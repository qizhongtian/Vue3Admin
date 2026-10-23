/**
 * request-dedupe.ts（重复请求控制）单元测试
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  abortDedupe,
  clearDedupe,
  createDedupeKey,
  dedupe,
  getDedupeSize,
} from '@/utils/request-dedupe'

beforeEach(() => {
  clearDedupe()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createDedupeKey', () => {
  it('参数对象属性顺序不影响 key', () => {
    expect(createDedupeKey('GET', '/users', { b: 2, a: 1 })).toBe(
      createDedupeKey('get', '/users', { a: 1, b: 2 }),
    )
  })

  it('方法名大小写统一、无参数时不带查询串', () => {
    expect(createDedupeKey('get', '/users')).toBe('GET /users')
    expect(createDedupeKey('post', '/users', { name: 'x' })).toBe('POST /users?{name:x}')
  })
})

describe('dedupe - share 模式', () => {
  it('并发请求共享同一个 Promise，任务只执行一次', async () => {
    let calls = 0
    const task = async (): Promise<string> => {
      calls += 1
      await new Promise((resolve) => setTimeout(resolve, 10))
      return 'shared-result'
    }

    const key = createDedupeKey('GET', '/dict')
    const [a, b] = await Promise.all([dedupe(key, task), dedupe(key, task)])

    expect(calls).toBe(1)
    expect(a).toBe('shared-result')
    expect(b).toBe('shared-result')
  })

  it('请求完成后不再共享（默认 ttl=0）', async () => {
    let calls = 0
    const task = async (): Promise<number> => {
      calls += 1
      return calls
    }

    const key = createDedupeKey('GET', '/once')
    await dedupe(key, task)
    await dedupe(key, task)

    expect(calls).toBe(2)
  })

  it('ttl>0 时结果在有效期内被复用', async () => {
    vi.useFakeTimers()
    let calls = 0
    const task = async (): Promise<number> => {
      calls += 1
      return calls
    }

    const key = createDedupeKey('GET', '/cached')

    const first = dedupe(key, task, { ttl: 5_000 })
    await vi.advanceTimersByTimeAsync(0)
    await first

    const second = await dedupe(key, task, { ttl: 5_000 })
    expect(calls).toBe(1)
    expect(second).toBe(1)

    // 超过 ttl 后重新发起
    await vi.advanceTimersByTimeAsync(5_001)
    await dedupe(key, task, { ttl: 5_000 })
    expect(calls).toBe(2)
  })
})

describe('dedupe - cancelPrevious 模式', () => {
  it('新请求会中断上一个同 key 请求', async () => {
    const signals: AbortSignal[] = []
    const task = async (signal: AbortSignal | undefined): Promise<string> => {
      signals.push(signal as AbortSignal)
      await new Promise((resolve) => setTimeout(resolve, 50))
      return 'done'
    }

    const key = createDedupeKey('GET', '/search')

    const firstPromise = dedupe(key, task, { mode: 'cancelPrevious' })
    const secondPromise = dedupe(key, task, { mode: 'cancelPrevious' })

    await Promise.allSettled([firstPromise, secondPromise])

    expect(signals.length).toBe(2)
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)
  })
})

describe('dedupe - 清理', () => {
  it('失败后清除注册记录，允许重试', async () => {
    const key = createDedupeKey('GET', '/fail')
    const failTask = async (): Promise<never> => {
      throw new Error('network down')
    }

    await expect(dedupe(key, failTask)).rejects.toThrow('network down')
    expect(getDedupeSize()).toBe(0)

    const retryTask = async (): Promise<string> => 'ok'
    await expect(dedupe(key, retryTask)).resolves.toBe('ok')
  })

  it('abortDedupe 中断并移除指定 key', async () => {
    const key = createDedupeKey('GET', '/cancel-me')
    const task = async (signal: AbortSignal | undefined): Promise<string> =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')))
      })

    // share 模式不会把 signal 传给 task，需使用 cancelPrevious 模式
    const pending = dedupe(key, task, { mode: 'cancelPrevious' })
    expect(getDedupeSize()).toBe(1)

    abortDedupe(key)
    expect(getDedupeSize()).toBe(0)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('clearDedupe 清空全部记录', async () => {
    const task = async (signal: AbortSignal | undefined): Promise<string> =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')))
      })

    const a = dedupe('GET /a', task, { mode: 'cancelPrevious' })
    const b = dedupe('GET /b', task, { mode: 'cancelPrevious' })
    expect(getDedupeSize()).toBe(2)

    clearDedupe()
    expect(getDedupeSize()).toBe(0)
    await Promise.allSettled([a, b])
  })
})
