/**
 * 通用分页 Hook
 *
 * 与底层请求库完全解耦：只要求传入一个「接收分页参数、返回分页结果」的函数，
 * 因此换成任何后端都不需要改动本 Hook。
 *
 * 必须解决的真实问题：
 *  1. 防止旧请求覆盖新请求 —— 用自增序号 + AbortController 双重保险，
 *     只接受「最后一次发起」的响应；
 *  2. 搜索时回到第一页，编辑/删除后刷新当前页；
 *  3. 删除到最后一条时自动回到上一页，避免停留在空白页；
 *  4. 组件卸载时取消进行中的请求；
 *  5. 可选防抖与可选缓存。
 */

import { computed, onScopeDispose, ref, type Ref } from 'vue'
import type { PaginationParams, PaginationResult } from '@/types/pagination'
import { PaginationDefaults } from '@/config/app'
import { ApiError, toApiError } from '@/utils/http-error'
import { createLogger } from '@/utils/logger'

const logger = createLogger('usePagination')

export interface UsePaginationOptions<S> {
  immediate?: boolean
  /** 默认每页条数 */
  defaultPageSize?: number
  /** 初始搜索参数 */
  defaultSearchParams?: S
  /** 防抖时间（毫秒），0 表示不启用 */
  debounce?: number
  /** 缓存 key，传入后同一页数据会在有效期内复用 */
  cacheKey?: string
  /** 缓存有效期（毫秒），默认 30 秒 */
  cacheTtl?: number
  /** 查询成功回调 */
  onSuccess?: (result: PaginationResult<never>) => void
  /** 查询失败回调 */
  onError?: (error: ApiError) => void
}

export interface UsePaginationReturn<T, S> {
  /** 当前页数据 */
  data: Ref<T[]>
  /** 是否加载中 */
  loading: Ref<boolean>
  /** 最近一次错误 */
  error: Ref<ApiError | null>
  total: Ref<number>
  pageNum: Ref<number>
  pageSize: Ref<number>
  totalPages: Ref<number>
  /** 是否存在数据 */
  isEmpty: Ref<boolean>
  /** 搜索参数 */
  searchParams: Ref<S>
  /** 回到第一页查询 */
  search: (extra?: Partial<S>) => Promise<void>
  /** 刷新当前页 */
  refresh: () => Promise<void>
  /** 重置搜索条件并回到第一页 */
  reset: () => Promise<void>
  /** 切换页码 */
  handlePageChange: (page: number) => Promise<void>
  /** 切换每页条数 */
  handlePageSizeChange: (size: number) => Promise<void>
  /** 新增成功后刷新到第一页 */
  onCreateSuccess: () => Promise<void>
  /** 编辑成功后刷新当前页 */
  onUpdateSuccess: () => Promise<void>
  /** 删除成功后刷新（自动处理「删掉最后一页最后一条」的情况） */
  onDeleteSuccess: (deletedCount?: number) => Promise<void>
  /** 取消进行中的请求 */
  cancel: () => void
}

/** 缓存条目 */
interface CacheEntry<T> {
  result: PaginationResult<T>
  expiredAt: number
}

const cacheStore = new Map<string, CacheEntry<unknown>>()

function readCache<T>(key: string): PaginationResult<T> | null {
  const entry = cacheStore.get(key)
  if (!entry) {
    return null
  }
  if (entry.expiredAt <= Date.now()) {
    cacheStore.delete(key)
    return null
  }
  return entry.result as PaginationResult<T>
}

function writeCache<T>(key: string, result: PaginationResult<T>, ttl: number): void {
  if (ttl <= 0) {
    return
  }
  cacheStore.set(key, { result, expiredAt: Date.now() + ttl })
}

/** 仅测试使用：清空分页缓存 */
export function clearPaginationCache(): void {
  cacheStore.clear()
}

/**
 * 分页请求函数签名。
 *
 * 第二个参数是取消信号：
 * 由 Hook 负责创建与中断，业务 API 需要把它透传给 http 层才能真正取消。
 * 即使某个 API 忽略了它，Hook 仍通过自增序号保证旧结果不会覆盖新结果。
 */
export type PaginationRequestFn<T, S> = (
  params: S & PaginationParams,
  signal: AbortSignal,
) => Promise<PaginationResult<T>>

/**
 * 创建分页查询能力。
 *
 * @param requestApi 业务 API，接收「分页参数 + 搜索参数」
 * @param options 配置项
 */
export function usePagination<T, S extends Record<string, unknown> = Record<string, unknown>>(
  requestApi: PaginationRequestFn<T, S>,
  options: UsePaginationOptions<S> = {},
): UsePaginationReturn<T, S> {
  const {
    immediate = true,
    defaultPageSize = PaginationDefaults.PAGE_SIZE,
    defaultSearchParams,
    debounce = 0,
    cacheKey,
    cacheTtl = 30_000,
    onSuccess,
    onError,
  } = options

  const data = ref<T[]>([]) as Ref<T[]>
  const loading = ref(false)
  const error = ref<ApiError | null>(null)
  // 显式标注 number：PaginationDefaults.PAGE_NUM 是 as const 的字面量 1，
  // 不标注会被推断成 Ref<1>，后续赋值页码就会报类型错误。
  const pageNum = ref<number>(PaginationDefaults.PAGE_NUM)
  const pageSize = ref(defaultPageSize)
  const total = ref(0)
  const searchParams = ref<S>({ ...((defaultSearchParams ?? {}) as S) }) as Ref<S>

  /** 自增序号：只有最新一次请求的结果才会被采纳 */
  let requestSeq = 0
  /** 最近一次请求的中断器 */
  let controller: AbortController | null = null
  /** 防抖定时器 */
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const totalPages = computed(() =>
    pageSize.value > 0 ? Math.ceil(total.value / pageSize.value) : 0,
  )
  const isEmpty = computed(() => !loading.value && data.value.length === 0)

  function cancel(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (controller) {
      controller.abort(new DOMException('分页请求被取消', 'AbortError'))
      controller = null
    }
  }

  /** 构造完整请求参数 */
  function buildParams(): S & PaginationParams {
    return {
      ...searchParams.value,
      pageNum: pageNum.value,
      pageSize: pageSize.value,
    }
  }

  /** 真正发起一次查询 */
  async function execute(): Promise<void> {
    // 每次发起都让旧请求失效
    controller?.abort(new DOMException('被新请求取代', 'AbortError'))
    controller = new AbortController()

    const currentSeq = ++requestSeq
    const params = buildParams()

    const cacheKeyFull = cacheKey ? `${cacheKey}:${JSON.stringify(params)}` : ''
    if (cacheKeyFull) {
      const cached = readCache<T>(cacheKeyFull)
      if (cached) {
        data.value = cached.records
        total.value = cached.total
        pageNum.value = cached.pageNum
        pageSize.value = cached.pageSize
        error.value = null
        logger.debug('命中分页缓存', cacheKeyFull)
        return
      }
    }

    loading.value = true
    error.value = null

    try {
      const result = await requestApi(params, controller.signal)

      // 迟到的响应直接丢弃，避免旧结果覆盖新结果
      if (currentSeq !== requestSeq) {
        logger.debug('丢弃过期响应', currentSeq)
        return
      }

      data.value = result.records
      total.value = result.total
      pageNum.value = result.pageNum || pageNum.value
      pageSize.value = result.pageSize || pageSize.value
      error.value = null

      if (cacheKeyFull) {
        writeCache(cacheKeyFull, result, cacheTtl)
      }
      onSuccess?.(result as unknown as PaginationResult<never>)
    } catch (rawError) {
      const apiError = toApiError(rawError)
      if (currentSeq !== requestSeq || apiError.isCanceled) {
        return
      }
      error.value = apiError
      data.value = []
      total.value = 0
      onError?.(apiError)
    } finally {
      if (currentSeq === requestSeq) {
        loading.value = false
      }
    }
  }

  /**
   * 带防抖的查询触发器。
   * 注意：防抖只作用于「由条件变更触发」的场景，
   * 显式调用 refresh() 会立即执行，避免用户点击后还要等待。
   */
  function trigger(options2: { debounced?: boolean } = {}): Promise<void> {
    const useDebounce = options2.debounced === true && debounce > 0
    if (!useDebounce) {
      return execute()
    }
    return new Promise<void>((resolve) => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        execute().finally(resolve)
      }, debounce)
    })
  }

  /** 回到第一页查询 */
  async function search(extra?: Partial<S>): Promise<void> {
    if (extra) {
      searchParams.value = { ...searchParams.value, ...extra } as S
    }
    if (pageNum.value !== 1) {
      pageNum.value = 1
    }
    await trigger({ debounced: true })
  }

  /** 刷新当前页 */
  async function refresh(): Promise<void> {
    await trigger()
  }

  /** 重置条件并回到第一页 */
  async function reset(): Promise<void> {
    searchParams.value = { ...((defaultSearchParams ?? {}) as S) } as S
    pageNum.value = PaginationDefaults.PAGE_NUM
    await trigger()
  }

  async function handlePageChange(page: number): Promise<void> {
    if (page < 1 || (totalPages.value > 0 && page > totalPages.value)) {
      return
    }
    pageNum.value = page
    await trigger()
  }

  async function handlePageSizeChange(size: number): Promise<void> {
    if (size <= 0) {
      return
    }
    // 每页条数变化后回到第一页，避免出现越界空页
    pageSize.value = size
    pageNum.value = 1
    await trigger()
  }

  /** 新增完成：回到第一页最符合直觉 */
  async function onCreateSuccess(): Promise<void> {
    pageNum.value = 1
    await trigger()
  }

  /** 编辑完成：保持当前页即可 */
  async function onUpdateSuccess(): Promise<void> {
    await trigger()
  }

  /**
   * 删除完成：如果当前页已被删空且不是第一页，则回退到上一页。
   */
  async function onDeleteSuccess(deletedCount = 1): Promise<void> {
    const remaining = Math.max(0, total.value - deletedCount)
    const maxPage = pageSize.value > 0 ? Math.ceil(remaining / pageSize.value) : 1
    if (pageNum.value > maxPage && maxPage >= 1) {
      pageNum.value = maxPage
    }
    await trigger()
  }

  if (immediate) {
    void trigger()
  }

  // 组件卸载时取消进行中的请求，避免内存泄漏与卸载后赋值
  onScopeDispose(() => {
    cancel()
  })

  return {
    data,
    loading,
    error,
    total,
    pageNum,
    pageSize,
    totalPages,
    isEmpty,
    searchParams,
    search,
    refresh,
    reset,
    handlePageChange,
    handlePageSizeChange,
    onCreateSuccess,
    onUpdateSuccess,
    onDeleteSuccess,
    cancel,
  }
}
