/**
 * 认证相关接口
 *
 * 约定：业务页面只能通过 `src/api/*` 调用后端，禁止在页面里自行创建请求实例。
 *
 * 这里的三个接口都必须标记 `skipAuth`：
 *  - login：此时还没有 Token；
 *  - refreshToken：由 auth-refresh 用裸客户端调用，如果再走认证链路会死循环。
 */

import { http } from '@/utils/http'
import type { AuthTokens, LoginParams, RefreshTokenParams, UserProfile } from '@/types/auth'
import type { MenuNode } from '@/types/route'

/** 登录 */
export function login(params: LoginParams): Promise<AuthTokens> {
  return http.post<AuthTokens>('/auth/login', {
    body: params,
    skipAuth: true,
    // 登录错误的文案由页面自己处理，避免同时出现「吐司 + 表单内提示」
    showError: false,
  })
}

/** 获取登录后的初始化数据：用户信息、菜单、权限码 */
export function fetchProfile(): Promise<UserProfile> {
  return http.get<UserProfile>('/auth/profile', { showError: false })
}

/** 获取当前用户的菜单树 */
export function fetchMenus(): Promise<MenuNode[]> {
  return http.get<MenuNode[]>('/auth/menus', { showError: false })
}

/** 退出登录 */
export function logout(): Promise<null> {
  return http.post<null>('/auth/logout', {
    // 退出失败也不该阻塞前端清理，交由会话状态机统一兜底
    showError: false,
  })
}

/** 修改密码 */
export function changePassword(params: {
  oldPassword: string
  newPassword: string
}): Promise<null> {
  return http.post<null>('/auth/password', { body: params })
}

/**
 * 刷新 Token。
 *
 * 注意：真正负责并发协调的是 `src/utils/auth-refresh.ts`，
 * 它使用不带拦截器的裸客户端请求本接口，因此这里不会被业务直接调用，
 * 保留此函数是为了让 API 清单完整、便于后端联调时对齐协议。
 */
export function refreshToken(params: RefreshTokenParams): Promise<AuthTokens> {
  return http.post<AuthTokens>('/auth/refresh', {
    body: params,
    skipAuth: true,
    showError: false,
  })
}
