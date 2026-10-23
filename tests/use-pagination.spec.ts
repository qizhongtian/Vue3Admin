/**
 * usePagination（通用分页 Hook）单元测试
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearPaginationCache,
  usePagination,
  type PaginationRequestFn,
} from '@/composables/usePagination'
import { ApiError } from '@/utils/http-error'

interface Row {
  id: number
  name: string
}

interface SearchParams extends Record<string, unknown> {
  keyword?: string
}

function makeResult(records: Row[], total: number, pageNum = 1, pageSize = 10) {
  return { records, total, pageNum, pageSize, totalPages: Math.ceil(total / pageSize) }
}

/** 手动控制 resolve 时机的一对一 mock API */
function createManualApi() {
  const pending: Array<{
    params: SearchParams & { pageNum: number; pageSize: number }
    resolve: (r: ReturnType<typeof makeResult>) => void
  }> = []
  const api: PaginationRequestFn<Row, SearchParams> = (params) =>
    new Promise((resolve) => {
      pending.push({ params, resolve })
    })
  return { api, pending }
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  clearPaginationCache()
})

describe('usePagination - 基本查询', () => {
  it('immediate=true 时自动发起首次查询', async () => {
    const api = vi.fn(async () => makeResult([{ id: 1, name: 'a' }], 1))
    const page = usePagination(api, { immediate: true, defaultPageSize: 10 })

    await flushMicrotasks()
    expect(api).toHaveBeenCalledTimes(1)
    expect(page.data.value).toEqual([{ id: 1, name: 'a' }])
    expect(page.total.value).toBe(1)
    expect(page.loading.value).toBe(false)
    expect(page.isEmpty.value).toBe(false)
  })

  it('immediate=false 时不自动查询', async () => {
    const api = vi.fn(async () => makeResult([], 0))
    const page = usePagination<Row, SearchParams>(api, { immediate: false })

    await flushMicrotasks()
    expect(api).not.toHaveBeenCalled()
    expect(page.isEmpty.value).toBe(true)
  })

  it('请求参数包含分页信息与搜索条件', async () => {
    const api = vi.fn(async (_params: SearchParams & { pageNum: number; pageSize: number }) =>
      makeResult([], 0),
    )
    const page = usePagination<Row, SearchParams>(api, {
      immediate: false,
      defaultPageSize: 15,
      defaultSearchParams: { keyword: 'init' },
    })

    await page.refresh()
    const params = api.mock.calls[0]?.[0]
    expect(params).toMatchObject({ pageNum: 1, pageSize: 15, keyword: 'init' })
  })
})

describe('usePagination - 翻页与搜索', () => {
  it('search 合并条件并回到第一页', async () => {
    const { api, pending } = createManualApi()
    const page = usePagination<Row, SearchParams>(api, { immediate: false, defaultPageSize: 10 })

    // 先翻到第 3 页
    void page.handlePageChange(3)
    await flushMicrotasks()
    pending[0]?.resolve(makeResult([], 100, 3, 10))
    await flushMicrotasks()
    expect(page.pageNum.value).toBe(3)

    // 搜索触发回到第一页
    void page.search({ keyword: 'hello' })
    await flushMicrotasks()
    const lastCall = pending[pending.length - 1]
    expect(lastCall?.params.pageNum).toBe(1)
    expect(lastCall?.params.keyword).toBe('hello')
  })

  it('越界页码与非法页码被忽略', async () => {
    const { api, pending } = createManualApi()
    const page = usePagination<Row, SearchParams>(api, { immediate: false, defaultPageSize: 10 })

    void page.handlePageChange(1)
    await flushMicrotasks()
    // total=20、每页 10 → 共 2 页
    pending[0]?.resolve(makeResult([], 20, 1, 10))
    await flushMicrotasks()

    await page.handlePageChange(3)
    expect(page.pageNum.value).toBe(1)

    await page.handlePageChange(0)
    expect(page.pageNum.value).toBe(1)

    await page.handlePageSizeChange(0)
    expect(page.pageSize.value).toBe(10)
  })

  it('切换每页条数后回到第一页', async () => {
    const { api, pending } = createManualApi()
    const page = usePagination<Row, SearchParams>(api, { immediate: false, defaultPageSize: 10 })

    void page.handlePageChange(2)
    await flushMicrotasks()
    pending[0]?.resolve(makeResult([], 40, 2, 10))
    await flushMicrotasks()

    void page.handlePageSizeChange(50)
    await flushMicrotasks()
    const lastCall = pending[pending.length - 1]
    expect(lastCall?.params.pageNum).toBe(1)
    expect(lastCall?.params.pageSize).toBe(50)
  })
})

describe('usePagination - 竞态与取消', () => {
  it('迟到的旧响应被丢弃，不会覆盖新结果', async () => {
    const { api, pending } = createManualApi()
    const page = usePagination<Row, SearchParams>(api, { immediate: false, defaultPageSize: 10 })

    void page.search({ keyword: 'slow' })
    void page.search({ keyword: 'fast' })
    await flushMicrotasks()
    expect(pending.length).toBe(2)

    // 新请求先返回
    pending[1]?.resolve(makeResult([{ id: 2, name: 'new' }], 1, 1, 10))
    await flushMicrotasks()
    expect(page.data.value).toEqual([{ id: 2, name: 'new' }])
    expect(page.loading.value).toBe(false)

    // 旧请求后返回
    pending[0]?.resolve(makeResult([{ id: 1, name: 'stale' }], 1, 1, 10))
    await flushMicrotasks()
    expect(page.data.value).toEqual([{ id: 2, name: 'new' }])
  })

  it('发起新请求时中断上一个进行中的请求', async () => {
    const signals: AbortSignal[] = []
    const api: PaginationRequestFn<Row, SearchParams> = (_params, signal) =>
      new Promise((_resolve, reject) => {
        signals.push(signal)
        signal?.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')))
      })

    const page = usePagination<Row, SearchParams>(api, { immediate: false })
    void page.refresh()
    void page.refresh()
    await flushMicrotasks()

    expect(signals.length).toBe(2)
    expect(signals[0]?.aborted).toBe(true)
  })
})

describe('usePagination - 删除回退', () => {
  it('删掉最后一页的最后一条后自动回退上一页', async () => {
    const { api, pending } = createManualApi()
    const page = usePagination<Row, SearchParams>(api, { immediate: false, defaultPageSize: 10 })

    // 共 21 条 → 3 页；进入第 3 页（只有 1 条数据）
    void page.handlePageChange(3)
    await flushMicrotasks()
    pending[0]?.resolve(makeResult([{ id: 21, name: 'last' }], 21, 3, 10))
    await flushMicrotasks()

    void page.onDeleteSuccess(1)
    await flushMicrotasks()
    // 剩余 20 条 → 最多第 2 页
    const lastCall = pending[pending.length - 1]
    expect(lastCall?.params.pageNum).toBe(2)
  })

  it('页内仍有数据时保持当前页', async () => {
    const { api, pending } = createManualApi()
    const page = usePagination<Row, SearchParams>(api, { immediate: false, defaultPageSize: 10 })

    void page.handlePageChange(2)
    await flushMicrotasks()
    pending[0]?.resolve(makeResult([], 21, 2, 10))
    await flushMicrotasks()

    void page.onDeleteSuccess(1)
    await flushMicrotasks()
    const lastCall = pending[pending.length - 1]
    expect(lastCall?.params.pageNum).toBe(2)
  })
})

describe('usePagination - 错误处理', () => {
  it('请求失败时记录 ApiError 并清空数据', async () => {
    const apiError = new ApiError({ kind: 'business', message: '加载失败', code: 'E001' })
    const api = vi.fn(async () => {
      throw apiError
    })

    const page = usePagination<Row, SearchParams>(api, { immediate: false })
    await page.refresh()

    expect(page.error.value).toBe(apiError)
    expect(page.data.value).toEqual([])
    expect(page.total.value).toBe(0)
    expect(page.loading.value).toBe(false)
  })

  it('取消类错误不进入 error 状态', async () => {
    const api: PaginationRequestFn<Row, SearchParams> = (_params, signal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')))
      })

    const page = usePagination<Row, SearchParams>(api, { immediate: false })
    void page.refresh()
    void page.refresh()
    await flushMicrotasks()

    expect(page.error.value).toBeNull()
  })

  it('onError / onSuccess 回调被触发', async () => {
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const api = vi.fn(async () => makeResult([{ id: 9, name: 'x' }], 9, 1, 10))

    const page = usePagination<Row, SearchParams>(api, { immediate: false, onSuccess, onError })
    await page.refresh()

    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()

    const failing = vi.fn(async (): Promise<ReturnType<typeof makeResult>> => {
      throw new ApiError({ kind: 'network', message: 'down' })
    })
    const page2 = usePagination<Row, SearchParams>(failing, {
      immediate: false,
      onSuccess,
      onError,
    })
    await page2.refresh()

    expect(onError).toHaveBeenCalledTimes(1)
  })
})

describe('usePagination - 缓存', () => {
  it('同一参数在缓存有效期内复用，不重复请求', async () => {
    const api = vi.fn(async () => makeResult([{ id: 1, name: 'cached' }], 1))
    const page = usePagination<Row, SearchParams>(api, {
      immediate: false,
      defaultPageSize: 10, // 与 mock 返回的 pageSize 一致，保证两次请求参数（缓存键）相同
      cacheKey: 'user-list',
      cacheTtl: 10_000,
    })

    await page.refresh()
    await page.refresh()

    expect(api).toHaveBeenCalledTimes(1)
    expect(page.data.value).toEqual([{ id: 1, name: 'cached' }])
  })

  it('参数不同时不命中缓存', async () => {
    const api = vi.fn(async () => makeResult([], 0))
    const page = usePagination<Row, SearchParams>(api, {
      immediate: false,
      defaultPageSize: 10,
      cacheKey: 'user-list',
      cacheTtl: 10_000,
    })

    await page.refresh()
    void page.search({ keyword: 'other' })
    await flushMicrotasks()

    expect(api).toHaveBeenCalledTimes(2)
  })
})
