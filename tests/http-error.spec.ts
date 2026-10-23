/**
 * http-error.ts（统一错误结构）单元测试
 */
import { describe, expect, it } from 'vitest'

import {
  ApiError,
  asApiResponse,
  isApiError,
  isCanceledError,
  toApiError,
} from '@/utils/http-error'

describe('ApiError', () => {
  it('保留全部上下文字段', () => {
    const cause = new Error('origin')
    const error = new ApiError({
      kind: 'http',
      message: '请求失败',
      status: 500,
      code: 'E500',
      data: { detail: 'x' },
      url: '/api/users',
      method: 'GET',
      cause,
    })

    expect(error.name).toBe('ApiError')
    expect(error.kind).toBe('http')
    expect(error.status).toBe(500)
    expect(error.code).toBe('E500')
    expect(error.data).toEqual({ detail: 'x' })
    expect(error.url).toBe('/api/users')
    expect(error.method).toBe('GET')
    expect(error.cause).toBe(cause)
    expect(error instanceof Error).toBe(true)
  })

  it('isUnauthorized / isForbidden 只看状态码', () => {
    const unauthorized = new ApiError({ kind: 'http', message: '', status: 401 })
    const forbidden = new ApiError({ kind: 'http', message: '', status: 403 })
    const ok = new ApiError({ kind: 'http', message: '', status: 200 })

    expect(unauthorized.isUnauthorized).toBe(true)
    expect(unauthorized.isForbidden).toBe(false)
    expect(forbidden.isForbidden).toBe(true)
    expect(ok.isUnauthorized).toBe(false)
  })

  it('isCanceled 仅 cancel 类型为真', () => {
    expect(new ApiError({ kind: 'cancel', message: '' }).isCanceled).toBe(true)
    expect(new ApiError({ kind: 'network', message: '' }).isCanceled).toBe(false)
  })

  it('isRetryable：network / timeout / 5xx 可重试，4xx 不可', () => {
    expect(new ApiError({ kind: 'network', message: '' }).isRetryable).toBe(true)
    expect(new ApiError({ kind: 'timeout', message: '' }).isRetryable).toBe(true)
    expect(new ApiError({ kind: 'http', message: '', status: 502 }).isRetryable).toBe(true)
    expect(new ApiError({ kind: 'http', message: '', status: 404 }).isRetryable).toBe(false)
    expect(new ApiError({ kind: 'business', message: '' }).isRetryable).toBe(false)
  })
})

describe('isApiError / isCanceledError', () => {
  it('isApiError 类型守卫', () => {
    expect(isApiError(new ApiError({ kind: 'network', message: '' }))).toBe(true)
    expect(isApiError(new Error('plain'))).toBe(false)
    expect(isApiError(null)).toBe(false)
  })

  it('isCanceledError 识别 ApiError 与 AbortError', () => {
    expect(isCanceledError(new ApiError({ kind: 'cancel', message: '' }))).toBe(true)
    expect(isCanceledError(new DOMException('aborted', 'AbortError'))).toBe(true)
    expect(isCanceledError(new ApiError({ kind: 'network', message: '' }))).toBe(false)
    expect(isCanceledError(new Error('other'))).toBe(false)
  })
})

describe('asApiResponse', () => {
  it('识别标准信封结构', () => {
    expect(asApiResponse({ code: 0, message: 'ok', data: [1, 2] })).toEqual({
      code: 0,
      message: 'ok',
      data: [1, 2],
    })
  })

  it('message 非字符串时回退为空字符串', () => {
    const result = asApiResponse({ code: 1, message: 123, data: null })
    expect(result?.message).toBe('')
  })

  it('缺少 code 或 data 字段时返回 undefined', () => {
    expect(asApiResponse({ code: 0 })).toBeUndefined()
    expect(asApiResponse({ data: 1 })).toBeUndefined()
    expect(asApiResponse('string')).toBeUndefined()
    expect(asApiResponse(null)).toBeUndefined()
  })
})

describe('toApiError', () => {
  it('ApiError 直接透传，不重复包装', () => {
    const original = new ApiError({ kind: 'http', message: 'keep', status: 400 })
    expect(toApiError(original)).toBe(original)
  })

  it('AbortError 归类为 cancel', () => {
    const error = toApiError(new DOMException('abort', 'AbortError'))
    expect(error.kind).toBe('cancel')
  })

  it('TypeError 归类为 network', () => {
    const error = toApiError(new TypeError('Failed to fetch'))
    expect(error.kind).toBe('network')
    expect(error.message).toContain('网络')
  })

  it('TimeoutError 归类为 timeout', () => {
    const timeout = new Error('deadline')
    timeout.name = 'TimeoutError'
    expect(toApiError(timeout).kind).toBe('timeout')
  })

  it('普通 Error 归类为 unknown 并保留 message', () => {
    const error = toApiError(new Error('boom'))
    expect(error.kind).toBe('unknown')
    expect(error.message).toBe('boom')
  })

  it('非 Error 值使用兜底文案', () => {
    expect(toApiError('weird').message).toBe('请求失败')
    expect(toApiError(undefined, '自定义兜底').message).toBe('自定义兜底')
  })
})
