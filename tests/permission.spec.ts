/**
 * permission.ts（权限判定纯函数）单元测试
 */
import { describe, expect, it } from 'vitest'

import { checkAccess, hasPermission, hasRole, matchPermission } from '@/utils/permission'

describe('matchPermission', () => {
  it('精确匹配', () => {
    const granted = ['system:user:create', 'system:role:view']
    expect(matchPermission(granted, 'system:user:create')).toBe(true)
    expect(matchPermission(granted, 'system:user:delete')).toBe(false)
  })

  it('空集合与空权限码一律拒绝', () => {
    expect(matchPermission([], 'system:user:create')).toBe(false)
    expect(matchPermission(['system:user:create'], '')).toBe(false)
    expect(matchPermission(['system:user:create'], '   ')).toBe(false)
  })

  it('通配符 system:user:* 覆盖该资源全部操作', () => {
    const granted = ['system:user:*']
    expect(matchPermission(granted, 'system:user:create')).toBe(true)
    expect(matchPermission(granted, 'system:user:delete')).toBe(true)
    expect(matchPermission(granted, 'system:role:view')).toBe(false)
  })

  it('中间层通配符覆盖后续任意层级', () => {
    const granted = ['system:*']
    expect(matchPermission(granted, 'system:user:create')).toBe(true)
    expect(matchPermission(granted, 'system:role:delete')).toBe(true)
    expect(matchPermission(granted, 'dashboard:view')).toBe(false)
  })

  it('全通配 * 匹配一切', () => {
    expect(matchPermission(['*'], 'anything:else')).toBe(true)
  })

  it('通配规则段数多于目标时不匹配', () => {
    const granted = ['system:user:create:extra']
    expect(matchPermission(granted, 'system:user:create')).toBe(false)
  })
})

describe('hasPermission', () => {
  const granted = ['system:user:view', 'system:role:*']

  it('required 为 undefined / 空数组时放行', () => {
    expect(hasPermission(granted, undefined)).toBe(true)
    expect(hasPermission(granted, [])).toBe(true)
  })

  it('some 模式：满足其一即可', () => {
    expect(hasPermission(granted, ['system:user:view', 'system:user:delete'], 'some')).toBe(true)
    expect(hasPermission(granted, ['system:user:delete', 'dashboard:view'], 'some')).toBe(false)
  })

  it('every 模式：必须全部满足', () => {
    expect(hasPermission(granted, ['system:user:view', 'system:role:create'], 'every')).toBe(true)
    expect(hasPermission(granted, ['system:user:view', 'system:user:delete'], 'every')).toBe(false)
  })

  it('单个字符串与数组写法等价', () => {
    expect(hasPermission(granted, 'system:user:view')).toBe(true)
    expect(hasPermission(granted, ['system:user:view'])).toBe(true)
  })
})

describe('hasRole', () => {
  it('SUPER_ADMIN 角色无条件放行', () => {
    expect(hasRole(['SUPER_ADMIN'], ['nonexistent-role'])).toBe(true)
  })

  it('required 为 undefined / 空数组时放行', () => {
    expect(hasRole(['editor'], undefined)).toBe(true)
    expect(hasRole(['editor'], [])).toBe(true)
  })

  it('some 与 every 模式', () => {
    const roles = ['editor', 'viewer']
    expect(hasRole(roles, ['editor', 'admin'], 'some')).toBe(true)
    expect(hasRole(roles, ['editor', 'admin'], 'every')).toBe(false)
  })
})

describe('checkAccess', () => {
  const base = {
    roles: ['editor'] as const,
    permissions: ['system:user:view', 'system:role:*'] as const,
  }

  it('未声明任何约束时放行', () => {
    expect(checkAccess(base)).toBe(true)
  })

  it('角色与权限都满足才通过', () => {
    expect(
      checkAccess({ ...base, requiredRoles: 'editor', requiredPermissions: 'system:user:view' }),
    ).toBe(true)
    expect(
      checkAccess({ ...base, requiredRoles: 'editor', requiredPermissions: 'system:user:delete' }),
    ).toBe(false)
    expect(
      checkAccess({ ...base, requiredRoles: 'admin', requiredPermissions: 'system:user:view' }),
    ).toBe(false)
  })

  it('SUPER_ADMIN 角色绕过全部校验', () => {
    expect(
      checkAccess({
        roles: ['SUPER_ADMIN'],
        permissions: [],
        requiredRoles: 'admin',
        requiredPermissions: 'unknown:code',
      }),
    ).toBe(true)
  })

  it('superAdmin 显式标记同样绕过校验', () => {
    expect(checkAccess({ ...base, requiredRoles: 'admin', superAdmin: true })).toBe(true)
  })
})
