/**
 * 认证相关类型
 *
 * 三种认证模式的取舍：
 *  - bearer：最常见的 AccessToken 模式，Token 存 localStorage / sessionStorage；
 *  - refresh：AccessToken + RefreshToken，需要 `src/utils/auth-refresh.ts` 参与无感刷新；
 *  - cookie：服务端会话模式，前端不持有 Token，需要处理 CSRF。
 *
 * 安全提示：无论哪种模式，**前端路由与菜单权限都只是用户体验层**，
 * 真正的授权必须由后端在每一次 API 调用时独立完成校验。
 */

/** 认证模式 */
export type AuthMode = 'bearer' | 'refresh' | 'cookie'

/** 认证凭据 */
export interface AuthTokens {
  /** 访问令牌 */
  accessToken: string
  /** 刷新令牌，仅 refresh 模式下有意义 */
  refreshToken?: string
  /** Token 类型，默认 Bearer */
  tokenType?: string
  /** 过期时间，单位秒（相对值） */
  expiresIn?: number
  /** 绝对过期时间戳，单位毫秒（优先于 expiresIn 使用） */
  expiresAt?: number
}

/** 登录请求参数 */
export interface LoginParams {
  /** 账号 */
  username: string
  /** 密码 */
  password: string
  /** 是否记住我（选择长期持久化时使用） */
  remember?: boolean
  /** 验证码 */
  captcha?: string
}

/** 刷新 Token 请求参数 */
export interface RefreshTokenParams {
  refreshToken: string
}

/** 当前用户信息 */
export interface UserProfile {
  id: string | number
  username: string
  /** 昵称 / 展示名 */
  nickname: string
  avatar?: string
  email?: string
  phone?: string
  /** 角色标识集合 */
  roles: string[]
  /** 按钮级权限码集合 */
  permissions: string[]
  /** 是否是超级管理员（拥有全部权限） */
  superAdmin?: boolean
}

/**
 * 会话终止原因。
 * 不同原因对应不同的用户提示策略，这是「主动退出不报过期」的关键。
 */
export type SessionTerminateReason =
  /** 用户主动退出登录 */
  | 'manual-logout'
  /** AccessToken 过期且无法刷新 */
  | 'token-expired'
  /** RefreshToken 失效 */
  | 'refresh-failed'
  /** 账号被禁用 */
  | 'account-disabled'
  /** 服务端主动撤销认证 */
  | 'server-revoked'
  /** 其他需要强制重新认证的业务场景 */
  | 'forced-reauth'
