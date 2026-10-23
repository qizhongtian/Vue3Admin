/**
 * 重复请求控制
 *
 * 提供两种策略（由调用方选择，默认不开）：
 *
 * 1. 共享模式（share）：相同 key 的并发请求共用同一个 Promise，只真正发出一次请求。
 *    适用于详情字典、并发挂载的多个组件拉取同一份数据。
 * 2. 中断旧请求（cancelPrevious）：发起新请求前中断上一个未完成的同 key 请求。
 *    适用于搜索联想、条件变更后的列表刷新 —— 必须保证「旧结果不覆盖新结果」。
 *
 * 注意：共享的是**已解析后的数据**而非 Response 对象，
 * 因此不会出现 Response body 被读取两次的问题。
 */

export type DedupeMode = 'share' | 'cancelPrevious'

export interface DedupeOptions {
  mode?: DedupeMode
  /** 缓存共享结果的时长（毫秒），0 表示不缓存，仅控制并发 */
  ttl?: number
}

interface DedupeEntry {
  promise: Promise<unknown>
  createdAt: number
  controller?: AbortController
  ttl: number
}

const registry = new Map<string, DedupeEntry>()

function now(): number {
  return Date.now()
}

function purgeExpired(key: string, entry: DedupeEntry): boolean {
  if (entry.ttl > 0 && now() - entry.createdAt > entry.ttl) {
    registry.delete(key)
    return true
  }
  return false
}

/**
 * 生成去重键。
 * 参数会被稳定序列化，避免对象属性顺序不同导致 key 不一致。
 */
export function createDedupeKey(method: string, url: string, params?: unknown): string {
  let serialized = ''
  if (params !== undefined && params !== null) {
    serialized = stableStringify(params)
  }
  return `${method.toUpperCase()} ${url}${serialized ? `?${serialized}` : ''}`
}

/** 稳定序列化：对对象按 key 排序后再拼接 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  const source = value as Record<string, unknown>
  const keys = Object.keys(source).sort()
  return `{${keys
    .map((key) => {
      const item = source[key]
      return `${key}:${stableStringify(item)}`
    })
    .join('&')}}`
}

/**
 * 执行带去重控制的异步任务。
 *
 * @param key 去重键
 * @param task 真正发起请求的回调，可接收用于中断的 signal
 * @param options 去重策略
 */
export function dedupe<T>(
  key: string,
  task: (signal: AbortSignal | undefined) => Promise<T>,
  options: DedupeOptions = {},
): Promise<T> {
  const { mode = 'share', ttl = 0 } = options

  const existing = registry.get(key)
  if (existing) {
    purgeExpired(key, existing)
  }

  const current = registry.get(key)

  // 共享模式：直接复用进行中的 Promise
  if (mode === 'share' && current) {
    return current.promise as Promise<T>
  }

  // 中断模式：先打断上一个未完成的请求
  if (mode === 'cancelPrevious' && current?.controller) {
    current.controller.abort(new DOMException('被新的请求取消', 'AbortError'))
    registry.delete(key)
  }

  const controller = new AbortController()

  const promise = task(mode === 'cancelPrevious' ? controller.signal : undefined)
    .then((result) => {
      // ttl 为 0 时结果不留存，只在并发期间共享
      if (ttl <= 0) {
        registry.delete(key)
      }
      return result
    })
    .catch((error) => {
      registry.delete(key)
      throw error
    })

  registry.set(key, { promise, createdAt: now(), controller, ttl })

  return promise
}

/** 中断并移除某个 key 的去重记录 */
export function abortDedupe(key: string): void {
  const entry = registry.get(key)
  if (entry?.controller) {
    entry.controller.abort(new DOMException('主动取消', 'AbortError'))
  }
  registry.delete(key)
}

/** 清空所有去重记录。建议在退出登录时调用，避免残留旧状态 */
export function clearDedupe(): void {
  registry.forEach((entry) => {
    entry.controller?.abort(new DOMException('全局清理，请求被取消', 'AbortError'))
  })
  registry.clear()
}

/** 当前记录数量，便于测试断言 */
export function getDedupeSize(): number {
  return registry.size
}
