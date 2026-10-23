/**
 * 统一日志工具
 *
 * 要求：
 *  - 生产环境默认静音（由 VITE_ENABLE_CONSOLE 控制）；
 *  - **绝不输出 Token / 密码等敏感信息** —— 一旦泄漏到用户控制台或日志采集系统就是安全事故；
 *  - 结构化输出，便于排障。
 */

import { envConfig } from '@/config/env'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** 需要脱敏的关键字（不区分大小写） */
const SENSITIVE_KEYS = [
  'password',
  'passwd',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'secret',
  'captcha',
  'credential',
]

const REDACTED = '[REDACTED]'

/** 判断 key 是否需要脱敏 */
function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase()
  return SENSITIVE_KEYS.some((item) => lower.includes(item))
}

/**
 * 深拷贝式脱敏。
 * 只处理普通对象与数组，遇到其它类型原样返回，避免破坏不可序列化对象。
 */
function redactDeep<T>(value: T, depth = 0): T {
  if (depth > 4) {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, depth + 1)) as unknown as T
  }
  if (value !== null && typeof value === 'object') {
    // FormData / Blob / Response 等对象不做遍历
    const ctor = (value as object).constructor?.name
    if (ctor && ctor !== 'Object') {
      return value
    }
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = isSensitiveKey(key) ? REDACTED : redactDeep(item, depth + 1)
    }
    return result as T
  }
  return value
}

function format(scope: string, message: string): string {
  return `[${scope}] ${message}`
}

function emit(level: LogLevel, scope: string, message: string, ...rest: unknown[]): void {
  if (!envConfig.enableConsole) {
    return
  }
  const payload = rest.map((item) => redactDeep(item))
  const target = level === 'debug' ? console.log : console[level]
  target(format(scope, message), ...payload)
}

/** 按作用域创建一组日志方法 */
export function createLogger(scope: string) {
  return {
    debug: (message: string, ...rest: unknown[]): void => emit('debug', scope, message, ...rest),
    info: (message: string, ...rest: unknown[]): void => emit('info', scope, message, ...rest),
    warn: (message: string, ...rest: unknown[]): void => emit('warn', scope, message, ...rest),
    error: (message: string, ...rest: unknown[]): void => emit('error', scope, message, ...rest),
    /**
     * 临时排障用：忽略全局开关强制输出（仍会脱敏）。
     * 请只在排查线上疑难问题时短暂使用，不要留在业务代码里。
     */
    force(level: LogLevel, message: string, ...rest: unknown[]): void {
      const target = level === 'debug' ? console.log : console[level]
      target(format(scope, message), ...rest.map((item) => redactDeep(item)))
    },
  }
}

/** 全局默认 logger */
export const logger = createLogger('app')
