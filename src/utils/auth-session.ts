/**
 * 认证会话状态中心
 *
 * ============================ 核心设计 ============================
 *
 * 这里解决的是一个很容易写错的并发问题：
 *   页面同时发出 N 个请求，后端一起返回 401。
 *   错误实现会导致：弹 N 个「登录已过期」、执行 N 次状态清理、跳转 N 次登录页，
 *   甚至在用户已经重新登录后又被迟到的旧请求把状态覆盖回去。
 *
 * 常见但错误的解法是使用一个「永久不重置的全局布尔变量」做锁：
 *   一旦置 true 就再也不弹提示，导致用户第二次登录后再过期时完全没有任何提示。
 *
 * 本项目采用 **会话代次（generation）** 模型：
 *   - 每次成功登录都会开启一个新的代次（generation 自增）；
 *   - 每个代次最多只允许执行一次「会话终止处理」（清理凭据 + 提示 + 跳转）；
 *   - 同一代次内后续的 401 会被静默丢弃，不会产生重复副作用；
 *   - 新一轮登录开启新代次后，后续独立的过期事件依然可以正常提示。
 *
 * ============================ 职责边界 ============================
 *
 * 本模块只负责「凭据的存放与会话生命周期的状态机」，
 * 不做以下事情（它们分别在各自模块中处理）：
 *   - 不发起刷新 Token 请求      -> src/utils/auth-refresh.ts
 *   - 不发送 HTTP 请求           -> src/utils/http.ts
 *   - 不做路由跳转               -> src/router/guards.ts
 *   - 不负责用户资料与菜单       -> src/stores/*
 */

import type { AuthMode, AuthTokens, SessionTerminateReason } from '@/types/auth'
import { StorageKeys, AUTH_HEADER, TOKEN_PREFIX } from '@/config/app'
import { createStorage, type AppStorage, type StorageType } from './storage'

/** 会话终止事件详情 */
export interface SessionTerminatedEvent {
  /** 发生终止的会话代次 */
  generation: number
  /** 终止原因 */
  reason: SessionTerminateReason
  /** 是否需要向用户展示提示。用户主动退出时为 false */
  notifyUser: boolean
  /** 展示给用户的文案 */
  message: string
}

type SessionTerminatedListener = (event: SessionTerminatedEvent) => void

/** 不同终止原因对应的用户文案；manual-logout 不提示 */
const TERMINATE_MESSAGE: Record<SessionTerminateReason, string> = {
  'manual-logout': '已退出登录',
  'token-expired': '登录状态已失效，请重新登录',
  'refresh-failed': '登录状态已失效，请重新登录',
  'account-disabled': '账号已被禁用，请联系管理员',
  'server-revoked': '登录状态已被服务端撤销，请重新登录',
  'forced-reauth': '需要重新验证身份，请重新登录',
}

/**
 * Token 存储容器。
 * 注意 StorageKeys 内部已带 `vue3-admin:` 前缀，这里不要再叠加前缀，否则会出现重复前缀。
 */
let tokenStorage: AppStorage = createStorage('', 'local')

/** 当前认证模式 */
let authMode: AuthMode = 'refresh'

/** 当前会话代次。每次成功登录自增 */
let generation = 0

/** 已经被处理过终止流程的代次。初始值 -1 保证 generation=0 时未处理 */
let terminatedGeneration = -1

const listeners = new Set<SessionTerminatedListener>()

function notifyListeners(event: SessionTerminatedEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event)
    } catch (error) {
      // 单个监听器的异常不能影响其它监听器
      console.error('[auth-session] 会话终止监听器执行异常', error)
    }
  })
}

/**
 * 配置凭据存储方式。
 *
 * @param mode 认证模式
 * @param storageType local 可跨标签页保留；session 关闭标签即失效，XSS 风险相对更低
 */
export function configureSession(mode: AuthMode, storageType: StorageType = 'local'): void {
  authMode = mode
  tokenStorage = createStorage('', storageType)
}

export function getAuthMode(): AuthMode {
  return authMode
}

/** 读取访问令牌 */
export function getAccessToken(): string | null {
  return tokenStorage.get<string | null>(StorageKeys.ACCESS_TOKEN, null)
}

/** 读取刷新令牌 */
export function getRefreshToken(): string | null {
  return tokenStorage.get<string | null>(StorageKeys.REFRESH_TOKEN, null)
}

/** 读取过期时间戳（毫秒） */
export function getTokenExpiresAt(): number | null {
  return tokenStorage.get<number | null>(StorageKeys.TOKEN_EXPIRES_AT, null)
}

/** 是否具备刷新 Token 的能力 */
export function hasRefreshToken(): boolean {
  return authMode === 'refresh' && getRefreshToken() !== null
}

/** 当前是否处于已登录状态 */
export function hasActiveSession(): boolean {
  return terminatedGeneration !== generation && getAccessToken() !== null
}

/**
 * 写入凭据，并**开启一个新的会话代次**。
 *
 * 这是唯一会自增 generation 的入口，必须只在登录成功后调用。
 * 注意：Token 刷新成功时不要调用它，否则会破坏并发刷新依赖的代次一致性。
 */
export function startSession(tokens: AuthTokens): number {
  tokenStorage.set(StorageKeys.ACCESS_TOKEN, tokens.accessToken)
  if (tokens.refreshToken) {
    tokenStorage.set(StorageKeys.REFRESH_TOKEN, tokens.refreshToken)
  }
  if (tokens.expiresAt !== undefined) {
    tokenStorage.set(StorageKeys.TOKEN_EXPIRES_AT, tokens.expiresAt)
  } else if (tokens.expiresIn !== undefined) {
    tokenStorage.set(StorageKeys.TOKEN_EXPIRES_AT, Date.now() + tokens.expiresIn * 1000)
  }

  generation += 1
  terminatedGeneration = -1
  return generation
}

/**
 * 写入刷新得到的新凭据（不开启新代次）。
 *
 * @param expectedGeneration 发起刷新时所记录的代次。
 *   若期间发生了重新登录或退出，代次会变化，本次结果必须丢弃，
 *   否则会出现「旧 Token 覆盖新 Token」的严重问题。
 * @returns 是否写入成功
 */
export function commitRefreshedTokens(tokens: AuthTokens, expectedGeneration: number): boolean {
  if (expectedGeneration !== generation) {
    return false
  }
  tokenStorage.set(StorageKeys.ACCESS_TOKEN, tokens.accessToken)
  if (tokens.refreshToken) {
    tokenStorage.set(StorageKeys.REFRESH_TOKEN, tokens.refreshToken)
  }
  if (tokens.expiresAt !== undefined) {
    tokenStorage.set(StorageKeys.TOKEN_EXPIRES_AT, tokens.expiresAt)
  } else if (tokens.expiresIn !== undefined) {
    tokenStorage.set(StorageKeys.TOKEN_EXPIRES_AT, Date.now() + tokens.expiresIn * 1000)
  }
  return true
}

/** 仅清理凭据，不影响代次。通常由 markSessionTerminated 内部调用 */
export function clearCredentials(): void {
  tokenStorage.remove(StorageKeys.ACCESS_TOKEN)
  tokenStorage.remove(StorageKeys.REFRESH_TOKEN)
  tokenStorage.remove(StorageKeys.TOKEN_EXPIRES_AT)
}

export function getCurrentGeneration(): number {
  return generation
}

/** 当前代次是否已经处理过终止流程 */
export function isSessionTerminated(): boolean {
  return terminatedGeneration === generation
}

/**
 * 请求终止当前会话。
 *
 * 这是保证「同一认证失效事件只处理一次」的核心方法：
 * 同一个代次内只有第一个调用者拿到 true，从而成为唯一的处理者。
 *
 * @returns true 表示当前调用者负责执行后续处理（清理 + 提示 + 跳转）
 */
export function markSessionTerminated(reason: SessionTerminateReason): boolean {
  if (terminatedGeneration === generation) {
    // 同一失效事件已经被处理过，静默丢弃
    return false
  }
  terminatedGeneration = generation
  clearCredentials()

  notifyListeners({
    generation,
    reason,
    notifyUser: reason !== 'manual-logout',
    message: TERMINATE_MESSAGE[reason],
  })
  return true
}

/** 订阅会话终止事件，返回取消订阅函数 */
export function onSessionTerminated(listener: SessionTerminatedListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 生成注入给请求的认证头 */
export function buildAuthHeader(): Record<string, string> {
  const token = getAccessToken()
  if (!token) {
    return {}
  }
  return { [AUTH_HEADER]: `${TOKEN_PREFIX} ${token}` }
}

/**
 * 仅测试使用：把状态机恢复到初始值。
 */
export function __resetSessionStateForTest(): void {
  generation = 0
  terminatedGeneration = -1
  clearCredentials()
  listeners.clear()
}
