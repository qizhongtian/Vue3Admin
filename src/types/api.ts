/**
 * 后端统一响应协议类型
 *
 * 约定：业务层只依赖本文件中定义的结构。
 * 若真实后端的字段名不同（例如 `errcode` / `msg` / `list`），
 * 应修改 `src/utils/http.ts` 中的 normalize 适配器，
 * 而不是在业务页面里各自解析。
 */

/** 后端业务错误码，不同后端可能返回数字或字符串 */
export type BackendErrorCode = string | number

/**
 * 后端统一响应体
 *
 * @example
 * { code: 0, message: 'success', data: { id: 1 } }
 */
export interface ApiResponse<T = unknown> {
  /** 业务码，非 HTTP 状态码 */
  code: BackendErrorCode
  /** 提示信息 */
  message: string
  /** 业务数据 */
  data: T
}

/**
 * 被判定为「业务成功」的 code 集合。
 * 实际项目请按后端协议收敛为唯一值，这里保留多值是为了兼容常见协议差异。
 */
export const SUCCESS_CODES: ReadonlySet<string | number> = new Set<string | number>([
  0,
  '0',
  200,
  '200',
  'SUCCESS',
  'success',
  'OK',
])

/**
 * 业务错误码枚举。
 * 与具体的 HTTP 状态码解耦 —— HTTP 状态码描述传输层结果，业务码描述领域结果。
 */
export const BackendErrorCodeMap = {
  /** 成功 */
  SUCCESS: 0,
  /** 参数错误 */
  PARAM_ERROR: 400,
  /** 未登录 / 认证失效 */
  UNAUTHORIZED: 401,
  /** 无权限 */
  FORBIDDEN: 403,
  /** 资源不存在 */
  NOT_FOUND: 404,
  /** 服务端异常 */
  SERVER_ERROR: 500,
  /** 请求过于频繁 */
  TOO_MANY_REQUESTS: 429,
} as const

export const HTTP_STATUS_MESSAGE: Record<number, string> = {
  400: '请求参数错误',
  401: '登录状态已失效，请重新登录',
  403: '没有权限执行该操作',
  404: '请求的资源不存在',
  405: '请求方式不被允许',
  408: '请求超时',
  409: '请求冲突',
  422: '参数校验未通过',
  429: '操作过于频繁，请稍后再试',
  500: '服务器开小差了，请稍后再试',
  502: '网关错误，请稍后再试',
  503: '服务暂时不可用，请稍后再试',
  504: '网关超时，请稍后再试',
}

/** 判断某个 code 是否代表业务成功 */
export function isSuccessCode(code: BackendErrorCode): boolean {
  return SUCCESS_CODES.has(code)
}
