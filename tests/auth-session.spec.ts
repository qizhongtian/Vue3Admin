/**
 * auth-session.ts（会话代次状态机）单元测试
 *
 * 重点验证：
 *  - 同一代次内的并发 401 只产生一次终止副作用；
 *  - 重新登录后（新代次）后续过期事件可以再次正常处理；
 *  - 刷新结果带过期代次时被拒绝写入。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StorageKeys } from '@/config/app'
import {
  buildAuthHeader,
  clearCredentials,
  commitRefreshedTokens,
  configureSession,
  getCurrentGeneration,
  getRefreshToken,
  getTokenExpiresAt,
  hasActiveSession,
  hasRefreshToken,
  isSessionTerminated,
  markSessionTerminated,
  onSessionTerminated,
  startSession,
  __resetSessionStateForTest,
} from '@/utils/auth-session'

beforeEach(() => {
  __resetSessionStateForTest()
  configureSession('refresh', 'local')
})

describe('凭据存取', () => {
  it('startSession 写入访问令牌、刷新令牌与过期时间', () => {
    const expiresAt = Date.now() + 60_000
    startSession({ accessToken: 'at-1', refreshToken: 'rt-1', expiresAt })

    expect(getRefreshToken()).toBe('rt-1')
    expect(getTokenExpiresAt()).toBe(expiresAt)
    expect(hasActiveSession()).toBe(true)
    expect(hasRefreshToken()).toBe(true)
  })

  it('expiresIn 相对秒数被换算为绝对时间戳', () => {
    const before = Date.now()
    startSession({ accessToken: 'at-2', expiresIn: 30 })
    const expiresAt = getTokenExpiresAt()

    expect(expiresAt).not.toBeNull()
    expect(expiresAt!).toBeGreaterThanOrEqual(before + 30_000)
    expect(expiresAt!).toBeLessThanOrEqual(Date.now() + 30_000)
  })

  it('bearer 模式下 hasRefreshToken 恒为 false', () => {
    configureSession('bearer', 'local')
    startSession({ accessToken: 'at-3', refreshToken: 'rt-3' })

    expect(getRefreshToken()).toBe('rt-3')
    expect(hasRefreshToken()).toBe(false)
  })

  it('clearCredentials 清空全部凭据', () => {
    startSession({ accessToken: 'at-4', refreshToken: 'rt-4', expiresIn: 10 })
    clearCredentials()

    expect(getRefreshToken()).toBeNull()
    expect(getTokenExpiresAt()).toBeNull()
  })

  it('buildAuthHeader：有 token 带 Bearer 头，无 token 返回空对象', () => {
    expect(buildAuthHeader()).toEqual({})

    startSession({ accessToken: 'at-5' })
    expect(buildAuthHeader()).toEqual({ Authorization: 'Bearer at-5' })
  })
})

describe('会话代次', () => {
  it('startSession 每次自增代次', () => {
    expect(getCurrentGeneration()).toBe(0)

    startSession({ accessToken: 'a' })
    expect(getCurrentGeneration()).toBe(1)

    startSession({ accessToken: 'b' })
    expect(getCurrentGeneration()).toBe(2)
  })

  it('同一代次内只有第一次 markSessionTerminated 生效', () => {
    startSession({ accessToken: 'a' })

    expect(markSessionTerminated('token-expired')).toBe(true)
    expect(markSessionTerminated('refresh-failed')).toBe(false)
    expect(isSessionTerminated()).toBe(true)
    // 凭据已在第一次终止时被清理
    expect(getRefreshToken()).toBeNull()
  })

  it('同代次内多个监听器只收到一次通知', () => {
    const listener = vi.fn()
    const unwatch = onSessionTerminated(listener)

    startSession({ accessToken: 'a' })
    markSessionTerminated('token-expired')
    markSessionTerminated('token-expired')

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ generation: 1, reason: 'token-expired', notifyUser: true }),
    )

    unwatch()
  })

  it('manual-logout 不提示用户', () => {
    const listener = vi.fn()
    onSessionTerminated(listener)

    startSession({ accessToken: 'a' })
    markSessionTerminated('manual-logout')

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ notifyUser: false }))
  })

  it('重新登录开启新代次后，过期事件可再次处理', () => {
    startSession({ accessToken: 'first' })
    expect(markSessionTerminated('token-expired')).toBe(true)

    startSession({ accessToken: 'second' })
    expect(isSessionTerminated()).toBe(false)
    expect(hasActiveSession()).toBe(true)
    expect(markSessionTerminated('server-revoked')).toBe(true)
  })

  it('监听器抛异常不影响其它监听器', () => {
    const badListener = vi.fn(() => {
      throw new Error('listener crash')
    })
    const goodListener = vi.fn()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    onSessionTerminated(badListener)
    onSessionTerminated(goodListener)

    startSession({ accessToken: 'a' })
    markSessionTerminated('token-expired')

    expect(badListener).toHaveBeenCalledTimes(1)
    expect(goodListener).toHaveBeenCalledTimes(1)
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })
})

describe('commitRefreshedTokens', () => {
  it('代次一致时写入新令牌', () => {
    const generation = startSession({ accessToken: 'old-at', refreshToken: 'old-rt' })
    const expiresAt = Date.now() + 60_000

    expect(
      commitRefreshedTokens(
        { accessToken: 'new-at', refreshToken: 'new-rt', expiresAt },
        generation,
      ),
    ).toBe(true)
    expect(buildAuthHeader()).toEqual({ Authorization: 'Bearer new-at' })
    expect(getTokenExpiresAt()).toBe(expiresAt)
    // 刷新不开启新代次
    expect(getCurrentGeneration()).toBe(generation)
  })

  it('代次不一致（期间发生重新登录/退出）时拒绝写入', () => {
    const oldGeneration = startSession({ accessToken: 'old-at' })
    startSession({ accessToken: 'new-at' }) // 期间重新登录

    expect(
      commitRefreshedTokens({ accessToken: 'stale-at', refreshToken: 'stale-rt' }, oldGeneration),
    ).toBe(false)
    expect(buildAuthHeader()).toEqual({ Authorization: 'Bearer new-at' })
  })
})

describe('未初始化状态', () => {
  it('没有会话时 hasActiveSession 为 false', () => {
    expect(hasActiveSession()).toBe(false)
    expect(buildAuthHeader()).toEqual({})
  })
})

describe('存储落盘', () => {
  it('凭据真实写入 localStorage（jsdom 环境）', () => {
    startSession({ accessToken: 'persisted', refreshToken: 'persisted-rt', expiresIn: 5 })

    const raw = window.localStorage.getItem(StorageKeys.ACCESS_TOKEN)
    expect(raw).toBe(JSON.stringify('persisted'))
  })
})
