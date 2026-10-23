/**
 * 用户 Store
 *
 * 职责边界：
 *  - 负责登录、退出、当前用户信息、认证状态；
 *  - **不负责**菜单与动态路由（那是 permission store 的职责），避免出现循环依赖；
 *  - Token 本身不存放在 Pinia 里，而是统一由 `auth-session` 管理，
 *    这样请求层无需依赖 Pinia 即可读取凭据，从根上断开循环引用。
 */

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as authApi from '@/api/auth'
import type { LoginParams, SessionTerminateReason, UserProfile } from '@/types/auth'
import { ApiError } from '@/utils/http-error'
import {
  clearCredentials,
  getAccessToken,
  markSessionTerminated,
  startSession,
} from '@/utils/auth-session'
import { resetNotifyDedupe } from '@/utils/notify'
import { clearDedupe } from '@/utils/request-dedupe'
import { createStorage } from '@/utils/storage'
import { StorageKeys } from '@/config/app'
import { BackendErrorCodeMap } from '@/types/api'

const profileStorage = createStorage('', 'local')

export const useUserStore = defineStore('user', () => {
  /** 当前用户信息 */
  const profile = ref<UserProfile | null>(null)
  /** 请求进行中 */
  const loading = ref(false)

  /**
   * 用户信息是否已经从服务端校验过。
   * 刷新页面时会先用本地快照秒开 UI，但必须重新请求服务端才算可信，
   * 否则一旦服务端权限变更，前端会拿着旧权限继续放行。
   */
  let profileVerified = false

  const token = computed<string | null>(() => getAccessToken())
  const userId = computed(() => profile.value?.id ?? null)
  const username = computed(() => profile.value?.username ?? '')
  const nickname = computed(() => profile.value?.nickname ?? '')
  const avatar = computed(() => profile.value?.avatar ?? '')
  const roles = computed<readonly string[]>(() => profile.value?.roles ?? [])
  const permissions = computed<readonly string[]>(() => profile.value?.permissions ?? [])
  const isSuperAdmin = computed(() => profile.value?.superAdmin ?? false)

  /** 从本地快照恢复（仅用于首屏快速渲染，不可信） */
  function hydrateFromStorage(): void {
    if (profile.value || profileVerified) {
      return
    }
    const cached = profileStorage.get<UserProfile | null>(StorageKeys.USER_PROFILE, null)
    profile.value = cached
  }

  /** 强制从服务端拉取用户信息 */
  async function fetchProfile(): Promise<UserProfile> {
    loading.value = true
    try {
      const data = await authApi.fetchProfile()
      profile.value = data
      profileVerified = true
      profileStorage.set(StorageKeys.USER_PROFILE, data)
      return data
    } finally {
      loading.value = false
    }
  }

  /**
   * 确保用户信息可用且已经过服务端校验。
   * 未校验过的情况下会主动拉取一次。
   */
  async function ensureProfile(): Promise<UserProfile | null> {
    hydrateFromStorage()
    if (profileVerified && profile.value) {
      return profile.value
    }
    try {
      return await fetchProfile()
    } catch {
      // 拉取失败时保留本地快照，由上层决定是否清理会话
      return profile.value
    }
  }

  /**
   * 登录。
   *
   * 成功后必须调用 startSession：它会开启新的会话代次，
   * 使得上一次会话遗留的过期事件不会再影响本次登录。
   */
  async function login(params: LoginParams): Promise<void> {
    loading.value = true
    try {
      const tokens = await authApi.login(params)
      startSession(tokens)
      // 新一轮会话允许新的过期提示
      resetNotifyDedupe()
      clearDedupe()
      await fetchProfile()
    } finally {
      loading.value = false
    }
  }

  /**
   * 退出登录。
   *
   * 用户主动退出时不提示「登录已过期」：
   * markSessionTerminated 带上 manual-logout 原因后，
   * 会话监听器会跳过提示；同时本次调用也会屏蔽后续同代次的 401。
   */
  async function logout(reason: SessionTerminateReason = 'manual-logout'): Promise<void> {
    const handled = markSessionTerminated(reason)
    // 无论服务端是否成功，前端状态都已经清理
    clearCredentials()
    resetState()

    if (handled) {
      try {
        await authApi.logout()
      } catch {
        // 退出接口失败不影响本地清理
      }
    }
  }

  /** 清理本 store 的敏感状态（不触碰会话代次） */
  function resetState(): void {
    profile.value = null
    profileVerified = false
    loading.value = false
    profileStorage.remove(StorageKeys.USER_PROFILE)
  }

  return {
    profile,
    loading,
    token,
    userId,
    username,
    nickname,
    avatar,
    roles,
    permissions,
    isSuperAdmin,
    hydrateFromStorage,
    fetchProfile,
    ensureProfile,
    login,
    logout,
    resetState,
  }
})

/**
 * 把 ApiError 转换为面向用户的登录错误文案。
 * 抽成函数是为了让登录页复用同一套文案策略。
 */
export function resolveLoginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return '账号已被禁用，请联系管理员'
    }
    if (error.code === BackendErrorCodeMap.UNAUTHORIZED) {
      return '账号或密码错误'
    }
    return error.message || '登录失败，请重试'
  }
  return '网络异常，请稍后重试'
}
