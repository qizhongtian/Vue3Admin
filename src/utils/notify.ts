/**
 * 全局提示桥接层
 *
 * 为什么需要它：
 *  - 请求层不应该直接依赖某个 UI 组件库的消息 API，否则单元测试必须挂载整个 UI 环境；
 *  - 但请求层确实需要在出错时给出反馈。
 * 因此这里定义一个极简的「通知总线」：请求层只负责投递，
 * 由应用在初始化时把 Naive UI 的 message 挂进来。
 *
 * 同时提供**提示去重**能力：
 *  - 多个请求同时 401 时，只能提示一次；
 *  - 但去重用的缓存必须可以被「新一次登录」显式重置，
 *    否则第二次登录后的过期事件会被永久吞掉（这是常见实现里的典型 bug）。
 */

export type NotifyType = 'success' | 'error' | 'warning' | 'info'

export interface NotifyPayload {
  type: NotifyType
  content: string
  title?: string
  duration?: number
  /**
   * 去重键。同一个 key 在窗口期内只会提示一次。
   * 不传则不做去重。
   */
  dedupeKey?: string
}

export type Notifier = (payload: NotifyPayload) => void

/** 默认去重窗口（毫秒） */
const DEDUPE_WINDOW = 3000

/** key -> 上次提示时间戳 */
const recentNotifies = new Map<string, number>()

let currentNotifier: Notifier | null = null

/**
 * 注册通知实现。由 App.vue 在 setup 阶段调用一次。
 */
export function setNotifier(notifier: Notifier): void {
  currentNotifier = notifier
}

/** 移除通知实现，测试里用于还原 */
export function clearNotifier(): void {
  currentNotifier = null
}

/**
 * 清空去重缓存。
 * 用户重新登录后必须调用，否则后续独立的过期事件会被误认为重复提示。
 */
export function resetNotifyDedupe(): void {
  recentNotifies.clear()
}

/** 判断是否应被去重吞掉 */
function isDuplicate(payload: NotifyPayload, now: number): boolean {
  if (!payload.dedupeKey) {
    return false
  }
  const last = recentNotifies.get(payload.dedupeKey)
  if (last !== undefined && now - last < DEDUPE_WINDOW) {
    return true
  }
  recentNotifies.set(payload.dedupeKey, now)
  return false
}

/**
 * 发送通知。
 * 没有注册 notifier 时静默丢弃，避免在测试或 SSR 环境里报错。
 */
export function notify(payload: NotifyPayload): void {
  if (isDuplicate(payload, Date.now())) {
    return
  }
  currentNotifier?.(payload)
}

export function notifySuccess(content: string, title?: string): void {
  notify({ type: 'success', content, title })
}

export function notifyError(content: string, dedupeKey?: string): void {
  notify({ type: 'error', content, dedupeKey })
}
