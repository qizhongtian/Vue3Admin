/**
 * response-adapter.ts（后端响应适配）单元测试
 */
import { describe, expect, it } from 'vitest'

import { unwrapResponse, normalizePagination } from '@/utils/response-adapter'

describe('unwrapResponse', () => {
  it('标准信封 + 成功码', () => {
    const result = unwrapResponse<{ id: number }>({ code: 0, message: 'success', data: { id: 1 } })
    expect(result).toMatchObject({ success: true, data: { id: 1 }, code: 0, message: 'success' })
  })

  it('成功码支持 0 / 200 / success 等多种取值', () => {
    expect(unwrapResponse({ code: 200, message: '', data: 1 }).success).toBe(true)
    expect(unwrapResponse({ code: 'success', message: '', data: 1 }).success).toBe(true)
    expect(unwrapResponse({ code: '0', message: '', data: 1 }).success).toBe(true)
  })

  it('业务失败码：success 为 false，data 为 undefined', () => {
    const result = unwrapResponse({ code: 'A0400', message: '参数错误', data: null })
    expect(result.success).toBe(false)
    expect(result.data).toBeUndefined()
    expect(result.message).toBe('参数错误')
    expect(result.code).toBe('A0400')
  })

  it('裸数据（无信封）视为成功', () => {
    const bare = { list: [1], notEnvelope: true }
    const result = unwrapResponse<typeof bare>(bare)
    expect(result.success).toBe(true)
    expect(result.data).toEqual(bare)
    expect(result.code).toBeUndefined()
  })

  it('裸基础类型视为成功', () => {
    expect(unwrapResponse('plain').success).toBe(true)
    expect(unwrapResponse(42).data).toBe(42)
  })

  it('空响应判定为失败', () => {
    expect(unwrapResponse(null).success).toBe(false)
    expect(unwrapResponse(undefined).message).toBe('响应数据为空')
  })
})

describe('normalizePagination', () => {
  const fallback = { pageNum: 1, pageSize: 20 }

  it('标准 records + total 结构', () => {
    const result = normalizePagination<{ id: number }>(
      { records: [{ id: 1 }, { id: 2 }], total: 21, pageNum: 2, pageSize: 10 },
      fallback,
    )
    expect(result.records.length).toBe(2)
    expect(result.total).toBe(21)
    expect(result.pageNum).toBe(2)
    expect(result.totalPages).toBe(3)
  })

  it('兼容 list / totalCount / current / limit 等别名', () => {
    const result = normalizePagination<string>(
      { list: ['a', 'b'], totalCount: 11, current: 2, limit: 5 },
      fallback,
    )
    expect(result.records).toEqual(['a', 'b'])
    expect(result.total).toBe(11)
    expect(result.pageNum).toBe(2)
    expect(result.pageSize).toBe(5)
    expect(result.totalPages).toBe(3)
  })

  it('兼容 Spring Page 风格 content / totalElements', () => {
    const result = normalizePagination<string>({ content: ['x'], totalElements: 3 }, fallback)
    expect(result.records).toEqual(['x'])
    expect(result.total).toBe(3)
    expect(result.pageNum).toBe(1)
  })

  it('直接传数组时按单页处理', () => {
    const result = normalizePagination<number>([1, 2, 3], fallback)
    expect(result.records).toEqual([1, 2, 3])
    expect(result.total).toBe(3)
    expect(result.totalPages).toBe(1)
  })

  it('字符串数字被转换，非法值回退默认', () => {
    const result = normalizePagination<string>(
      { records: ['a'], total: '7', pageNum: '2', pageSize: 'bogus' },
      fallback,
    )
    expect(result.total).toBe(7)
    expect(result.pageNum).toBe(2)
    expect(result.pageSize).toBe(20)
    expect(result.totalPages).toBe(1)
  })

  it('空值与非对象输入返回空结果', () => {
    for (const raw of [null, undefined, 'text', 123]) {
      const result = normalizePagination<string>(raw, fallback)
      expect(result.records).toEqual([])
      expect(result.total).toBe(0)
      expect(result.totalPages).toBe(0)
    }
  })
})
