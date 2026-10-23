/**
 * 本地存储封装
 *
 * 职责：
 *  - 统一 key 前缀，避免同域下多个系统互相污染；
 *  - JSON 序列化与反序列化，并容忍脏数据（不会因一条坏数据导致整页崩溃）；
 *  - 当 localStorage 不可用时（隐私模式、被禁用、配额超限）自动降级为内存存储。
 *
 * 安全提示：localStorage/sessionStorage 对同源 JS 完全可读，
 * 任何 XSS 都能拿到其中的 Token，因此持久化 Token 时需要在
 * 「刷新可恢复」与「被 XSS 窃取」之间做取舍，见 docs/security.md。
 */

/** 支持的存储类型 */
export type StorageType = 'local' | 'session' | 'memory'

export interface AppStorage {
  get<T>(key: string, fallback: T): T
  set<T>(key: string, value: T): void
  remove(key: string): void
  /** 只清理本前缀下的数据，不清空整个域的存储 */
  clearByPrefix(): void
  readonly type: StorageType
}

function createMemoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    key(index: number): string | null {
      return Array.from(map.keys())[index] ?? null
    },
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
    clear: () => {
      map.clear()
    },
  }
}

/** 探测某个 Web Storage 是否真的可写 */
function probe(storage: Storage): boolean {
  try {
    const testKey = '__storage_probe__'
    storage.setItem(testKey, '1')
    storage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

/** 按优先级挑选可用的底层存储 */
function pickBackend(preferred: StorageType): { storage: Storage; type: StorageType } {
  const globalScope = typeof globalThis !== 'undefined' ? globalThis : undefined
  if (preferred !== 'memory' && globalScope) {
    const candidate = preferred === 'local' ? globalScope.localStorage : globalScope.sessionStorage
    if (candidate && probe(candidate)) {
      return { storage: candidate, type: preferred }
    }
  }
  return { storage: createMemoryStorage(), type: 'memory' }
}

/**
 * 创建带前缀的存储实例。
 *
 * @param prefix key 前缀，建议使用 `StorageKeys` 中的值或自定义前缀
 * @param preferred 首选存储类型，不可用时会自动降级
 */
export function createStorage(prefix: string, preferred: StorageType = 'local'): AppStorage {
  const { storage, type } = pickBackend(preferred)
  const prefixKey = (key: string): string => `${prefix}${key}`

  return {
    type,
    get<T>(key: string, fallback: T): T {
      try {
        const raw = storage.getItem(prefixKey(key))
        if (raw === null) {
          return fallback
        }
        return JSON.parse(raw) as T
      } catch {
        // 脏数据直接丢弃，避免一次解析失败导致整个应用不可用
        storage.removeItem(prefixKey(key))
        return fallback
      }
    },
    set<T>(key: string, value: T): void {
      try {
        storage.setItem(prefixKey(key), JSON.stringify(value))
      } catch {
        // 配额超限等情况静默失败，不应阻断业务流程
      }
    },
    remove(key: string): void {
      storage.removeItem(prefixKey(key))
    },
    clearByPrefix(): void {
      const keys: string[] = []
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i)
        if (key && key.startsWith(prefix)) {
          keys.push(key)
        }
      }
      keys.forEach((key) => storage.removeItem(key))
    },
  }
}
