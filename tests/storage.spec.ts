/**
 * storage.ts 单元测试
 */
import { describe, expect, it } from 'vitest'

import { createStorage, type StorageType } from '@/utils/storage'

describe('createStorage', () => {
  it('按前缀读写 JSON 数据', () => {
    const store = createStorage('vue3-admin:test:', 'local')

    store.set('user', { id: 1, name: '张三' })
    expect(store.get<{ id: number; name: string }>('user', { id: 0, name: '' })).toEqual({
      id: 1,
      name: '张三',
    })

    store.remove('user')
    expect(store.get('user', null)).toBeNull()
  })

  it('读取不存在的 key 时返回 fallback', () => {
    const store = createStorage('vue3-admin:test:', 'local')

    expect(store.get('missing', 'fallback-value')).toBe('fallback-value')
    expect(store.get('missing', 42)).toBe(42)
    expect(store.get<number[] | null>('missing', null)).toBeNull()
  })

  it('脏数据被安全丢弃并返回 fallback，不会抛异常', () => {
    const store = createStorage('vue3-admin:dirty:', 'local')

    // 绕过 set 直接写入非法 JSON
    window.localStorage.setItem('vue3-admin:dirty:broken', '{not-a-json')
    expect(store.get('broken', 'default')).toBe('default')
    // 坏数据应被移除，避免每次读取都触发解析失败
    expect(window.localStorage.getItem('vue3-admin:dirty:broken')).toBeNull()
  })

  it('clearByPrefix 只清理本前缀数据', () => {
    const store = createStorage('vue3-admin:prefix-a:', 'local')
    const other = createStorage('vue3-admin:prefix-b:', 'local')

    store.set('k1', 'v1')
    store.set('k2', 'v2')
    other.set('k3', 'v3')

    store.clearByPrefix()

    expect(store.get('k1', '')).toBe('')
    expect(store.get('k2', '')).toBe('')
    expect(other.get('k3', '')).toBe('v3')
  })

  it('localStorage 不可用时自动降级为 memory 存储', () => {
    const original = globalThis.localStorage
    const throwingStorage: Storage = {
      get length() {
        return 0
      },
      key: () => null,
      getItem: () => {
        throw new Error('storage disabled')
      },
      setItem: () => {
        throw new Error('storage disabled')
      },
      removeItem: () => {
        throw new Error('storage disabled')
      },
      clear: () => {
        throw new Error('storage disabled')
      },
    }
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: throwingStorage,
    })

    try {
      const store = createStorage('vue3-admin:degraded:', 'local')
      expect(store.type).toBe<StorageType>('memory')

      // 内存存储仍然具备完整的读写能力
      store.set('k', 'v')
      expect(store.get('k', '')).toBe('v')
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original })
    }
  })

  it('显式指定 memory 类型时直接使用内存后端', () => {
    const store = createStorage('vue3-admin:mem:', 'memory')

    expect(store.type).toBe('memory')
    store.set('flag', true)
    expect(store.get('flag', false)).toBe(true)
  })

  it('session 类型写入 sessionStorage', () => {
    const store = createStorage('vue3-admin:sess:', 'session')

    expect(store.type).toBe('session')
    store.set('n', 5)
    expect(window.sessionStorage.getItem('vue3-admin:sess:n')).toBe('5')
  })
})
