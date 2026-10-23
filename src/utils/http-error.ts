/**
 * 统一错误结构
 *
 * 为什么要有独立的错误模块：
 *  HTTP 状态码描述的是「传输层」结果，业务 code 描述的是「领域层」结果，
 *  网络异常、超时、取消则根本不属于任何一层。
 *  把它们揉成一个 Error 会让上层无法区分处理策略。
 *
 * 因此这里把所有失败归一化为 ApiError，并用 `kind` 明确区分来源。
 */

import type { ApiResponse, BackendErrorCode } from '@/types/api'

/** 错误来源分类 */
export type ApiErrorKind =
  /** HTTP 状态码非 2xx */
  | 'http'
  /** HTTP 200，但业务 code 判定失败 */
  | 'business'
  /** 网络断开、DNS 失败等 */
  | 'network'
  /** 请求超时 */
  | 'timeout'
  /** 被 AbortController 主动取消 */
  | 'cancel'
  /** 未能归类的其它错误 */
  | 'unknown'

export interface ApiErrorOptions {
  kind: ApiErrorKind
  message: string
  /** HTTP 状态码，网络/超时类错误为 undefined */
  status?: number
  /** 后端业务码 */
  code?: BackendErrorCode
  /** 后端返回的原始响应体 */
  data?: unknown
  /** 原始请求地址 */
  url?: string
  /** HTTP 方法 */
  method?: string
  /** 原始异常 */
  cause?: unknown
}

/**
 * 项目统一的错误类型。
 * 所有经过 `src/utils/http.ts` 的失败都会以本类型抛出。
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | undefined
  readonly code: BackendErrorCode | undefined
  readonly data: unknown
  readonly url: string | undefined
  readonly method: string | undefined

  constructor(options: ApiErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'ApiError'
    this.kind = options.kind
    this.status = options.status
    this.code = options.code
    this.data = options.data
    this.url = options.url
    this.method = options.method
  }

  /** 是否认证失效（401） */
  get isUnauthorized(): boolean {
    return this.status === 401
  }

  /** 是否无权限（403） */
  get isForbidden(): boolean {
    return this.status === 403
  }

  /** 是否属于「不应该展示业务错误文案」的可忽略错误 */
  get isCanceled(): boolean {
    return this.kind === 'cancel'
  }

  /** 是否适合做网络层重试 */
  get isRetryable(): boolean {
    return (
      this.kind === 'network' ||
      this.kind === 'timeout' ||
      (this.kind === 'http' && (this.status ?? 0) >= 500)
    )
  }
}

/** 类型守卫 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/** 区分「请求被取消」与其它错误，调用方据此跳过错误处理 */
export function isCanceledError(error: unknown): boolean {
  if (isApiError(error)) {
    return error.isCanceled
  }
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

/**
 * 尝试把后端响应体解析为 ApiResponse。
 * 只做形状判断，不做业务语义判断。
 */
export function asApiResponse(value: unknown): ApiResponse<unknown> | undefined {
  if (value === null || typeof value !== 'object') {
    return undefined
  }
  const candidate = value as Record<string, unknown>
  if ('code' in candidate && 'data' in candidate) {
    return {
      code: candidate.code as BackendErrorCode,
      message: typeof candidate.message === 'string' ? candidate.message : '',
      data: candidate.data,
    }
  }
  return undefined
}

/** 把未知异常规范化为 ApiError */
export function toApiError(error: unknown, fallbackMessage = '请求失败'): ApiError {
  if (isApiError(error)) {
    return error
  }
  if (isCanceledError(error)) {
    return new ApiError({ kind: 'cancel', message: '请求已取消', cause: error })
  }
  if (error instanceof TypeError) {
    // fetch 在网络断开时抛 TypeError: Failed to fetch
    return new ApiError({ kind: 'network', message: '网络连接失败，请检查网络', cause: error })
  }
  if (error instanceof Error) {
    if (error.name === 'TimeoutError') {
      return new ApiError({ kind: 'timeout', message: '请求超时，请稍后重试', cause: error })
    }
    return new ApiError({
      kind: 'unknown',
      message: error.message || fallbackMessage,
      cause: error,
    })
  }
  return new ApiError({ kind: 'unknown', message: fallbackMessage, cause: error })
}
