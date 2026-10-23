/**
 * 企业级请求封装（基于 ofetch）
 *
 * ============================ 分层原则 ============================
 *
 * 本文件刻意**不**把所有逻辑堆在 `onResponseError` 里，而是拆成几条独立链路：
 *
 *   1. 网络/HTTP 重试：幂等读请求允许按退避策略重试，写请求默认不重试；
 *   2. Token 刷新：由 `auth-refresh.ts` 单飞协调，与重试互不干扰；
 *   3. 业务错误码：HTTP 200 但 code 判定失败时单独处理；
 *   4. 会话终止：由 `auth-session.ts` 保证同一失效事件只处理一次；
 *   5. 消息提示：由 `notify.ts` 去重，**错误本身仍然会抛出**，去重只作用于吐司；
 *   6. 路由跳转：不在本层发生，交给 `guard` 订阅会话终止事件。
 *
 * ============================ 已核实的 ofetch 行为 ============================
 *
 *  - `$fetch.raw()` 返回完整 Response，状态码 >= 400 时会抛出 FetchError；
 *  - FetchError 上带有 `status` 与 `response._data`（已按 responseType 解析）；
 *  - 仅当未提供外部 signal 时 ofetch 才会启用内置超时；
 *  - FormData / Blob 不会被误序列化成 JSON。
 */

import type { FetchOptions, ResponseType } from 'ofetch'
import { ApiError, isCanceledError, toApiError } from './http-error'
import { BackendErrorCodeMap, HTTP_STATUS_MESSAGE, type BackendErrorCode } from '@/types/api'
import type {
  DownloadResult,
  HttpMethod,
  HttpRequestExtensions,
  RequestOptions,
} from '@/types/request'
import { RequestPolicy } from '@/config/app'
import { envConfig } from '@/config/env'
import { rawClient, composeSignalAndTimeout } from './http-client'
import { buildAuthHeader, hasRefreshToken, isSessionTerminated } from './auth-session'
import { refreshAccessToken, terminateSession } from './auth-refresh'
import { unwrapResponse } from './response-adapter'
import { createDedupeKey, dedupe } from './request-dedupe'
import { notifyError } from './notify'
import { createLogger } from './logger'

const logger = createLogger('http')

/** 需要从请求配置中剥离的自定义字段（不得透传给底层 fetch） */
const EXTENSION_KEYS: readonly (keyof HttpRequestExtensions)[] = [
  'showError',
  'skipAuth',
  'allowAuthRetry',
  'idempotent',
  'enableDedupe',
  'dedupeKey',
  'cancelPrevious',
  'retryCount',
  'meta',
]

/** 归一化后的请求执行参数 */
interface ResolvedRequest {
  method: HttpMethod
  url: string
  extensions: Required<Pick<HttpRequestExtensions, 'showError' | 'skipAuth' | 'idempotent'>> &
    HttpRequestExtensions
  fetchOptions: FetchOptions<ResponseType>
  maxNetworkRetries: number
  timeout: number
}

/** 判断某个业务码是否代表认证失效 */
function isAuthFailureCode(code: BackendErrorCode | undefined): boolean {
  return code === BackendErrorCodeMap.UNAUTHORIZED || code === '401' || code === 'UNAUTHORIZED'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/** 拆分自定义扩展字段与 ofetch 原生配置 */
function splitOptions<R extends ResponseType>(
  options: RequestOptions<R>,
): {
  extensions: HttpRequestExtensions
  fetchOptions: FetchOptions<R>
} {
  const rest = { ...options } as FetchOptions<R> & HttpRequestExtensions
  const extensions: HttpRequestExtensions = {}
  for (const key of EXTENSION_KEYS) {
    const value = rest[key]
    if (value !== undefined) {
      // 逐字段搬运，保证类型可追踪
      Object.assign(extensions, { [key]: value })
      delete rest[key]
    }
  }
  return { extensions, fetchOptions: rest }
}

/** 根据方法与幂等性推导默认的网络重试次数 */
function resolveNetworkRetryCount(method: HttpMethod, extensions: HttpRequestExtensions): number {
  if (extensions.retryCount === false) {
    return 0
  }
  if (typeof extensions.retryCount === 'number') {
    return Math.max(0, extensions.retryCount)
  }
  if (method === 'GET') {
    return RequestPolicy.READ_RETRY_COUNT
  }
  // 写请求默认不重试；只有在调用方显式声明幂等时才允许
  return extensions.idempotent === true
    ? RequestPolicy.READ_RETRY_COUNT
    : RequestPolicy.WRITE_RETRY_COUNT
}

/**
 * 判断是否允许参与「401 → 刷新 → 重放」。
 *
 * 登录、刷新等接口必须设置 skipAuth，
 * 这里顺带把它们排除出刷新链路，从根上杜绝无限循环。
 */
function canAttemptAuthRetry(extensions: HttpRequestExtensions, method: HttpMethod): boolean {
  if (extensions.skipAuth === true) {
    return false
  }
  if (extensions.allowAuthRetry === false) {
    return false
  }
  if (extensions.allowAuthRetry === true) {
    return true
  }
  // 默认策略：只有读请求可以安全重放。
  // 写请求若确实幂等，请显式传入 { allowAuthRetry: true, idempotent: true }
  return method === 'GET'
}

/** 把后端/HTTP 结果转换成面向用户的提示语 */
function resolveErrorMessage(error: ApiError): string {
  if (error.message) {
    return error.message
  }
  if (error.status !== undefined) {
    const statusMessage = HTTP_STATUS_MESSAGE[error.status]
    if (statusMessage) {
      return statusMessage
    }
  }
  return '请求失败，请稍后重试'
}

/** 构造错误提示的去重键，避免同一类错误短时间反复刷屏 */
function resolveErrorDedupeKey(error: ApiError): string | undefined {
  if (error.kind === 'business' && error.code !== undefined) {
    return `business:${String(error.code)}`
  }
  if (error.status !== undefined) {
    return `http:${error.status}`
  }
  return undefined
}

/**
 * 处理无法恢复的认证失效。
 * 只负责「宣告」，真正的清理与跳转由 auth-session 的监听器统一执行一次。
 */
function handleAuthFailure(customErrorCode?: BackendErrorCode): void {
  if (customErrorCode !== undefined && !isAuthFailureCode(customErrorCode)) {
    return
  }
  // 有能力刷新时交给 auth-refresh 处理；无能力刷新则直接宣告过期
  if (!hasRefreshToken()) {
    terminateSession('token-expired')
  }
}

/** 执行一次真实请求并处理业务信封 */
async function executeOnce<T>(
  request: ResolvedRequest,
  signal: AbortSignal | undefined,
): Promise<T> {
  const { method, url, fetchOptions } = request

  try {
    const response = await rawClient.raw<unknown, ResponseType>(url, {
      ...fetchOptions,
      method,
      signal,
      /**
       * 始终带上超时。
       * ofetch 的内部超时只在「没有外部 signal」时生效，
       * 因此当调用方传入 signal 时，由 composeSignalAndTimeout 自行实现计时。
       */
      timeout: request.timeout,
      // 关闭 ofetch 内置重试，由本层统一控制重试次数与退避策略
      retry: 0,
      retryStatusCodes: [],
    })

    const result = unwrapResponse<T>(response._data)

    if (!result.success) {
      throw new ApiError({
        kind: 'business',
        message: result.message || '业务处理失败',
        status: response.status,
        code: result.code,
        data: result.raw,
        url,
        method,
      })
    }

    return result.data as T
  } catch (error) {
    if (isCanceledError(error)) {
      throw new ApiError({ kind: 'cancel', message: '请求已取消', url, method, cause: error })
    }

    // 直接从原始错误上取状态码 —— toApiError 会把 FetchError 降级为 unknown，丢失 status
    const candidate = error as {
      status?: number
      statusCode?: number
      data?: unknown
      response?: { status?: number; _data?: unknown }
    }
    const httpStatus = candidate.status ?? candidate.statusCode ?? candidate.response?.status
    const responseBody = candidate.data ?? candidate.response?._data

    if (httpStatus !== undefined) {
      const envelope =
        typeof responseBody === 'object' && responseBody !== null
          ? (responseBody as Record<string, unknown>)
          : undefined
      const backendMessage = typeof envelope?.message === 'string' ? envelope.message : undefined

      throw new ApiError({
        kind: httpStatus === 408 ? 'timeout' : 'http',
        message: backendMessage || HTTP_STATUS_MESSAGE[httpStatus] || '请求失败',
        status: httpStatus,
        code: (envelope?.code as BackendErrorCode | undefined) ?? undefined,
        data: responseBody,
        url,
        method,
        cause: error,
      })
    }

    // 无状态码：网络异常 / 超时 / 其它未知错误
    const fallback = toApiError(error)
    throw new ApiError({
      kind: fallback.kind,
      message: fallback.message,
      url,
      method,
      cause: error,
    })
  }
}

/** 带重试与刷新重放的请求主流程 */
async function runWithRetry<T>(request: ResolvedRequest): Promise<T> {
  const { maxNetworkRetries, extensions } = request
  let networkAttempt = 0
  let authRetries = 0
  // 防御性上限：无论如何都不会出现无限重试
  const maxTotalAttempts = maxNetworkRetries + RequestPolicy.MAX_AUTH_RETRY + 2
  let totalAttempts = 0

  while (true) {
    if (totalAttempts >= maxTotalAttempts) {
      throw new ApiError({
        kind: 'unknown',
        message: '请求重试次数过多，已终止',
        url: request.url,
        method: request.method,
      })
    }
    totalAttempts += 1

    const { signal, dispose } = composeSignalAndTimeout(
      request.fetchOptions.signal,
      request.timeout,
    )

    try {
      return await executeOnce<T>(request, signal)
    } catch (error) {
      const apiError = error instanceof ApiError ? error : toApiError(error)

      // 取消是最常见的「正常异常」，直接上抛且不提示
      if (apiError.isCanceled) {
        throw apiError
      }

      // ---- 认证失效链路 ----
      const businessCode = apiError.code
      const isAuthFailure =
        apiError.status === 401 || (apiError.kind === 'business' && isAuthFailureCode(businessCode))

      if (isAuthFailure) {
        const canRetry = canAttemptAuthRetry(extensions, request.method)
        if (!canRetry || authRetries >= RequestPolicy.MAX_AUTH_RETRY) {
          handleAuthFailure(businessCode)
          throw apiError
        }
        // 会话已终止则不再尝试刷新
        if (isSessionTerminated()) {
          throw apiError
        }
        const refreshed = await refreshAccessToken()
        if (!refreshed) {
          // 刷新失败时 auth-refresh 内部已宣告会话终止
          throw apiError
        }
        authRetries += 1
        logger.debug(`Token 刷新成功，重放请求（第 ${authRetries} 次）`, request.url)
        continue
      }

      // ---- 网络/服务端重试链路 ----
      const retryable =
        apiError.isRetryable ||
        (RequestPolicy.RETRY_STATUS_CODES as readonly number[]).includes(apiError.status ?? 0)

      if (retryable && networkAttempt < maxNetworkRetries) {
        const delay = RequestPolicy.RETRY_BASE_DELAY * 2 ** networkAttempt
        networkAttempt += 1
        logger.warn(
          `请求失败，${delay}ms 后重试（${networkAttempt}/${maxNetworkRetries}）`,
          request.url,
        )
        await sleep(delay)
        continue
      }

      // ---- 最终失败：提示（去重）后抛出，调用方仍可捕获处理 ----
      if (extensions.showError !== false) {
        notifyError(resolveErrorMessage(apiError), resolveErrorDedupeKey(apiError))
      }
      logger.warn('请求最终失败', { url: request.url, apiError })
      throw apiError
    } finally {
      dispose()
    }
  }
}

/** 构建完整请求 */
function createRequestRunner<T>(
  method: HttpMethod,
  url: string,
  options: RequestOptions<ResponseType> = {},
): Promise<T> {
  const { extensions, fetchOptions } = splitOptions(options)

  const resolved: ResolvedRequest = {
    method,
    url,
    extensions: {
      showError: true,
      skipAuth: false,
      idempotent: false,
      ...extensions,
    },
    /**
     * 这里必须经过 unknown 中转：
     * FetchOptions 在 retryDelay / onResponse 这类回调参数上是逆变的，
     * splitOptions 返回的泛型实例与 ResponseType 版本结构上不重叠，
     * TS 会拒绝直接断言。executeOnce 只按实际 responseType 读取 _data，
     * 因此这个转换不改变运行时行为。
     */
    fetchOptions: fetchOptions as unknown as FetchOptions<ResponseType>,
    maxNetworkRetries: resolveNetworkRetryCount(method, extensions),
    timeout: extensions.timeout ?? envConfig.requestTimeout,
  }

  // 注入 Token（登录、刷新等接口通过 skipAuth 关闭）
  if (resolved.extensions.skipAuth !== true) {
    resolved.fetchOptions.headers = {
      ...buildAuthHeader(),
      ...(resolved.fetchOptions.headers as Record<string, string> | undefined),
    }
  }

  const task = (): Promise<T> => runWithRetry<T>(resolved)

  if (resolved.extensions.enableDedupe !== true) {
    return task()
  }

  const key =
    resolved.extensions.dedupeKey ??
    createDedupeKey(method, url, fetchOptions.query ?? fetchOptions.body)

  return dedupe<T>(key, () => task(), {
    mode: resolved.extensions.cancelPrevious === true ? 'cancelPrevious' : 'share',
  })
}

/** 从 Content-Disposition 解析文件名，兼容 RFC 5987 的 filename* */
function parseFilename(header: string | null): string | undefined {
  if (!header) {
    return undefined
  }
  const starMatch = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (starMatch?.[1]) {
    try {
      return decodeURIComponent(starMatch[1].replace(/["']/g, ''))
    } catch {
      // 忽略解码失败，继续尝试普通字段
    }
  }
  const match = /filename="?([^";]+)"?/i.exec(header)
  return match?.[1]
}

/** 触发浏览器下载 */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  // 释放 Blob URL，避免内存泄漏
  URL.revokeObjectURL(url)
}

/**
 * 统一 HTTP 门面。
 *
 * 调用示例：
 * ```ts
 * const res = await http.get<ApiResponse<UserItem[]>>('/users', { query: { pageNum: 1, pageSize: 20 } })
 * await http.post<UserItem>('/users', { body: { username: 'demo' } })
 * ```
 */
export const http = {
  /** 通用请求 */
  request<T>(method: HttpMethod, url: string, options?: RequestOptions<ResponseType>): Promise<T> {
    return createRequestRunner<T>(method, url, options)
  },
  get<T>(url: string, options?: Omit<RequestOptions<ResponseType>, 'body'>): Promise<T> {
    return createRequestRunner<T>('GET', url, options)
  },
  post<T>(url: string, options?: RequestOptions<ResponseType>): Promise<T> {
    return createRequestRunner<T>('POST', url, options)
  },
  put<T>(url: string, options?: RequestOptions<ResponseType>): Promise<T> {
    return createRequestRunner<T>('PUT', url, options)
  },
  patch<T>(url: string, options?: RequestOptions<ResponseType>): Promise<T> {
    return createRequestRunner<T>('PATCH', url, options)
  },
  delete<T>(url: string, options?: RequestOptions<ResponseType>): Promise<T> {
    return createRequestRunner<T>('DELETE', url, options)
  },

  /**
   * 文件上传（FormData）。
   *
   * 注意：基于 fetch/ofetch 实现，因此**无法提供上传进度**；
   * 需要真实进度请使用 `uploadWithProgress`。
   */
  upload<T>(
    url: string,
    options: {
      file: File
      field?: string
      data?: Record<string, string | number | boolean>
    } & RequestOptions<ResponseType>,
  ): Promise<T> {
    const { file, field = 'file', data, ...rest } = options
    const form = new FormData()
    form.append(field, file)
    if (data) {
      Object.entries(data).forEach(([key, value]) => {
        form.append(key, String(value))
      })
    }
    return createRequestRunner<T>('POST', url, { ...rest, body: form })
  },

  /**
   * 带真实上传进度的文件上传。
   *
   * 基于 XMLHttpRequest 实现 —— fetch/ofetch 均不支持上传进度回调，
   * 这一点无法绕过，只能换底层实现。
   */
  uploadWithProgress<T>(params: {
    url: string
    file: File
    field?: string
    data?: Record<string, string | number | boolean>
    /** 进度回调，percent 为 0-100 */
    onProgress?: (percent: number, loaded: number, total: number) => void
    timeout?: number
    signal?: AbortSignal
    skipAuth?: boolean
  }): Promise<T> {
    const {
      url,
      file,
      field = 'file',
      data,
      onProgress,
      timeout = envConfig.requestTimeout,
      signal,
      skipAuth = false,
    } = params

    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const form = new FormData()
      form.append(field, file)
      if (data) {
        Object.entries(data).forEach(([key, value]) => {
          form.append(key, String(value))
        })
      }

      const baseUrl = envConfig.apiBaseUrl
      const fullUrl = url.startsWith('http')
        ? url
        : `${baseUrl}${url.startsWith('/') ? url : `/${url}`}`

      xhr.open('POST', fullUrl)
      xhr.timeout = timeout

      if (!skipAuth) {
        Object.entries(buildAuthHeader()).forEach(([key, value]) => {
          xhr.setRequestHeader(key, value)
        })
      }

      if (xhr.upload && onProgress) {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100)
            onProgress(percent, event.loaded, event.total)
          }
        })
      }

      const cleanup = (): void => {
        signal?.removeEventListener('abort', onExternalAbort)
      }

      const onExternalAbort = (): void => {
        xhr.abort()
      }

      if (signal) {
        // 已取消则不发起
        if (signal.aborted) {
          cleanup()
          reject(new ApiError({ kind: 'cancel', message: '上传已取消', url }))
          return
        }
        signal.addEventListener('abort', onExternalAbort, { once: true })
      }

      xhr.addEventListener('load', () => {
        cleanup()
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const parsed: unknown = JSON.parse(xhr.responseText)
            const result = unwrapResponse<T>(parsed)
            if (result.success) {
              resolve(result.data as T)
              return
            }
            reject(
              new ApiError({
                kind: 'business',
                message: result.message,
                code: result.code,
                status: xhr.status,
                url,
              }),
            )
          } catch {
            reject(
              new ApiError({
                kind: 'unknown',
                message: '上传响应解析失败',
                status: xhr.status,
                url,
              }),
            )
          }
          return
        }
        notifyError(HTTP_STATUS_MESSAGE[xhr.status] ?? '上传失败', `upload:${xhr.status}`)
        reject(new ApiError({ kind: 'http', message: '上传失败', status: xhr.status, url }))
      })

      xhr.addEventListener('error', () => {
        cleanup()
        notifyError('网络异常，上传失败', 'upload:network')
        reject(new ApiError({ kind: 'network', message: '网络异常，上传失败', url }))
      })

      xhr.addEventListener('timeout', () => {
        cleanup()
        notifyError('上传超时', 'upload:timeout')
        reject(new ApiError({ kind: 'timeout', message: '上传超时', url }))
      })

      xhr.addEventListener('abort', () => {
        cleanup()
        reject(new ApiError({ kind: 'cancel', message: '上传已取消', url }))
      })

      xhr.send(form)
    })
  },

  /**
   * 文件下载。
   *
   * @returns Blob 与解析出的文件名；调用方决定是否落盘
   */
  download(
    url: string,
    options?: {
      filename?: string
      signal?: AbortSignal
      skipAuth?: boolean
    } & RequestOptions<'blob'>,
  ): Promise<DownloadResult> {
    const { filename, skipAuth, ...rest } = options ?? {}
    return rawClient
      .raw<Blob, 'blob'>(url, {
        ...rest,
        method: 'GET',
        responseType: 'blob',
        headers:
          skipAuth === true
            ? rest.headers
            : { ...buildAuthHeader(), ...(rest.headers as Record<string, string> | undefined) },
      })
      .then((response) => {
        const disposition = response.headers.get('content-disposition')
        const parsed = parseFilename(disposition)
        return {
          blob: response._data as Blob,
          filename: filename ?? parsed ?? 'download',
          rawFilename: parsed,
        }
      })
      .catch((error) => {
        if (isCanceledError(error)) {
          throw new ApiError({ kind: 'cancel', message: '下载已取消', url })
        }
        const failure = error as {
          status?: number
          statusCode?: number
          response?: { status?: number }
        }
        const status = failure.status ?? failure.statusCode ?? failure.response?.status

        if (status === 401) {
          // 下载走的是裸客户端，没有刷新链路，这里直接宣告过期
          const handled = terminateSession('token-expired')
          if (handled) {
            logger.warn('下载请求认证失效，已终止会话')
          }
          throw new ApiError({ kind: 'http', message: '登录状态已失效', status, url })
        }

        if (status !== undefined && status >= 400) {
          notifyError(HTTP_STATUS_MESSAGE[status] ?? '下载失败', `download:${status}`)
          throw new ApiError({ kind: 'http', message: '下载失败', status, url })
        }

        notifyError('网络异常，下载失败', 'download:network')
        throw toApiError(error, '下载失败')
      })
  },

  /** 下载并直接触发浏览器保存 */
  async downloadFile(
    url: string,
    options?: { filename?: string; signal?: AbortSignal } & RequestOptions<'blob'>,
  ): Promise<void> {
    const result = await http.download(url, options)
    saveBlob(result.blob, result.filename)
  },
}
