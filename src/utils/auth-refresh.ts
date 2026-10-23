/**
 * Token 刷新协调器
 *
 * ============================ 解决的问题 ============================
 *
 * 场景：页面同时发出 5 个请求，后端返回 5 个 401。
 *
 * 朴素实现会导致：
 *   1. 触发 5 次刷新请求（后端压力倍增，且可能把 refresh token 轮换失效）；
 *   2. 刷新失败后弹出 5 个「登录已过期」；
 *   3. 竞态下旧 Token 可能覆盖新 Token。
 *
 * 正确的做法是 **单飞（single-flight）**：
 *   - 首个需要刷新的请求负责发起刷新，并持有一个 Promise；
 *   - 其余并发请求共享同一个 Promise，等待结果而非各自发起；
 *   - 刷新成功后各自用最新凭据重放原请求（是否允许重放由 http 层按幂等性决定）；
 *   - 刷新失败则由 `auth-session` 保证只做一次统一的会话终止处理。
 *
 * ============================ 为什么用裸客户端 ============================
 *
 * 这里刻意使用不带拦截器的 `rawClient`：
 * 刷新请求本身如果再走一次「401 → 刷新」的逻辑，就会无限递归。
 * 同理，登录请求也必须标记 skipAuth，见 `src/api/auth.ts`。
 */

import type { SessionTerminateReason } from '@/types/auth'
import { rawClient } from './http-client'
import { unwrapResponse } from './response-adapter'
import {
  commitRefreshedTokens,
  getCurrentGeneration,
  getRefreshToken,
  isSessionTerminated,
  markSessionTerminated,
} from './auth-session'
import { createLogger } from './logger'
import type { AuthTokens } from '@/types/auth'

const logger = createLogger('auth-refresh')

/** 刷新接口的业务数据结构 */
export interface RawRefreshTokenPayload {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  tokenType?: string
}

/** 刷新端点 */
const REFRESH_ENDPOINT = '/auth/refresh'

/** 当前进行中的刷新 Promise，用于实现单飞 */
let pendingRefresh: Promise<AuthTokens | null> | null = null

/**
 * 统一的刷新失败处理。
 *
 * 注意这里**不直接弹提示、不直接跳路由** ——
 * 这些都由 auth-session 的监听器统一处理，保证只发生一次。
 */
function handleRefreshFailure(error?: unknown): void {
  const shouldHandle = markSessionTerminated('refresh-failed')
  if (shouldHandle) {
    logger.warn('刷新 Token 失败，已统一终止会话', error)
  }
}

async function performRefresh(): Promise<AuthTokens | null> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    handleRefreshFailure(new Error('缺少 refreshToken'))
    return null
  }

  // 记录发起刷新时的代次，用于写回时校验
  const expectedGeneration = getCurrentGeneration()

  try {
    const raw = await rawClient(REFRESH_ENDPOINT, {
      method: 'POST',
      body: { refreshToken },
    })

    const result = unwrapResponse<RawRefreshTokenPayload>(raw)
    if (!result.success || !result.data?.accessToken) {
      handleRefreshFailure(new Error(result.message || '刷新响应缺少 accessToken'))
      return null
    }

    const refreshed: AuthTokens = {
      accessToken: result.data.accessToken,
      // 后端若不返回新的 refreshToken，说明采用固定刷新令牌，继续复用旧的
      refreshToken: result.data.refreshToken ?? refreshToken,
      expiresIn: result.data.expiresIn,
      tokenType: result.data.tokenType ?? 'Bearer',
    }

    /**
     * 关键点：只有当会话代次没有变化时才写回。
     * 若期间用户已退出或重新登录，本次刷新结果必须丢弃，
     * 否则会出现「旧 Token 覆盖新 Token」。
     */
    const committed = commitRefreshedTokens(refreshed, expectedGeneration)
    if (!committed) {
      logger.warn('会话代次已变化，丢弃本次刷新结果')
      return null
    }

    logger.debug('Token 刷新成功')
    return refreshed
  } catch (error) {
    // 401 明确表示刷新令牌本身失效；其它错误也按失败处理，避免请求无限挂起
    handleRefreshFailure(error)
    return null
  }
}

/**
 * 并发安全地获取新的访问凭据。
 *
 * @returns 新的凭据；返回 null 表示无法刷新（未配置 refresh、已失效或会话已终止）
 */
export function refreshAccessToken(): Promise<AuthTokens | null> {
  // 会话已经被终止（例如刚刚退出登录），不再尝试刷新
  if (isSessionTerminated()) {
    return Promise.resolve(null)
  }

  // 已有刷新在进行：所有并发请求共享同一个 Promise
  if (pendingRefresh) {
    logger.debug('复用进行中的刷新 Promise')
    return pendingRefresh
  }

  pendingRefresh = performRefresh().finally(() => {
    pendingRefresh = null
  })

  return pendingRefresh
}

/**
 * 主动宣告认证失效（供 http 层在「无 refresh token 可用」时调用）。
 *
 * @param reason 终止原因，决定用户看到的文案
 * @returns 是否由本次调用负责执行后续处理
 */
export function terminateSession(reason: SessionTerminateReason): boolean {
  return markSessionTerminated(reason)
}
