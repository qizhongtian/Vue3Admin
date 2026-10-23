/**
 * 通用异步请求 Hook
 *
 * 适用于「详情查询、字典、统计卡片」这类非分页的异步取数场景。
 * 分页场景请使用 usePagination。
 *
 * 解决的老问题：
 *  - 竞态：多次触发时只保留最后一次结果；
 *  - 卸载后仍给响应式变量赋值（并可能触发 warnings）；
 *  - 手动维护 loading / error 带来的重复样板代码。
 */

import { onScopeDispose, ref, type Ref } from 'vue'
import { ApiError, toApiError } from '@/utils/http-error'
import { createLogger } from '@/utils/logger'

const logger = createLogger('useRequest')

export interface UseRequestOptions<P, R> {
  /** 是否立即执行，默认 false */
  immediate?: boolean
  /** 初始数据 */
  initialData?: R | null
  /** 默认参数 */
  defaultParams?: P
  /** 防抖毫秒数，0 表示不启用 */
  debounce?: number
  /** 成功回调 */
  onSuccess?: (data: R, params: P) => void
  /** 失败回调 */
  onError?: (error: ApiError, params: P) => void
  /** 是否由底层 http 负责全局错误提示，默认 true */
  showError?: boolean
}

export interface UseRequestReturn<P, R> {
  data: Ref<R | null>
  loading: Ref<boolean>
  error: Ref<ApiError | null>
  /** 是否已成功取到数据 */
  finished: Ref<boolean>
  /** 执行请求 */
  run: (params?: P) => Promise<R | null>
  /** 用上一次的参数重新执行 */
  refresh: () => Promise<R | null>
  /** 重置到初始状态 */
  reset: () => void
  /** 取消进行中的请求 */
  cancel: () => void
}

/**
 * @param service 请求函数，第二个参数为取消信号
 */
export function useRequest<P = void, R = unknown>(
  service: (params: P, signal: AbortSignal) => Promise<R>,
  options: UseRequestOptions<P, R> = {},
): UseRequestReturn<P, R> {
  const {
    immediate = false,
    initialData = null,
    defaultParams,
    debounce = 0,
    onSuccess,
    onError,
  } = options

  const data = ref(initialData) as Ref<R | null>
  const loading = ref(false)
  const error = ref<ApiError | null>(null)
  const finished = ref(false)

  let controller: AbortController | null = null
  let requestSeq = 0
  let lastParams: P | undefined = defaultParams
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function cancel(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (controller) {
      controller.abort(new DOMException('useRequest 取消请求', 'AbortError'))
      controller = null
    }
  }

  async function execute(params: P): Promise<R | null> {
    controller?.abort(new DOMException('被新请求取代', 'AbortError'))
    controller = new AbortController()
    const currentSeq = ++requestSeq

    loading.value = true
    error.value = null

    try {
      const result = await service(params, controller.signal)
      if (currentSeq !== requestSeq) {
        return null
      }
      data.value = result
      finished.value = true
      onSuccess?.(result, params)
      return result
    } catch (rawError) {
      const apiError = toApiError(rawError)
      if (currentSeq !== requestSeq || apiError.isCanceled) {
        return null
      }
      error.value = apiError
      onError?.(apiError, params)
      return null
    } finally {
      if (currentSeq === requestSeq) {
        loading.value = false
      }
    }
  }

  function run(params?: P): Promise<R | null> {
    const nextParams = (params ?? lastParams) as P
    lastParams = nextParams

    if (debounce > 0) {
      return new Promise<R | null>((resolve) => {
        if (debounceTimer) {
          clearTimeout(debounceTimer)
        }
        debounceTimer = setTimeout(() => {
          debounceTimer = null
          execute(nextParams).then(resolve)
        }, debounce)
      })
    }
    return execute(nextParams)
  }

  function refresh(): Promise<R | null> {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    return execute(lastParams as P)
  }

  function reset(): void {
    cancel()
    requestSeq += 1
    data.value = initialData
    loading.value = false
    error.value = null
    finished.value = false
  }

  if (immediate) {
    void run()
  }

  onScopeDispose(() => {
    cancel()
    requestSeq += 1
  })

  logger.debug('useRequest 已创建')

  return { data, loading, error, finished, run, refresh, reset, cancel }
}
