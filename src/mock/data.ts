/**
 * Mock 数据
 *
 * Mock 与真实后端必须遵守同一套 `/src/types` 约定，
 * 这样把 VITE_USE_MOCK 改为 false 之后，业务页面完全不需要改动。
 */

import type { MenuNode } from '@/types/route'
import type { SystemRole } from '@/types/entity'
import { PermissionCode } from '@/config/app'

/** 用户实体 */
export interface MockUser {
  id: number
  username: string
  password: string
  nickname: string
  email: string
  phone: string
  status: 'enabled' | 'disabled'
  roles: string[]
  createdAt: string
}

/** 角色 -> 权限码 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    PermissionCode.USER_VIEW,
    PermissionCode.USER_CREATE,
    PermissionCode.USER_UPDATE,
    PermissionCode.USER_DELETE,
    PermissionCode.USER_EXPORT,
    PermissionCode.ROLE_CREATE,
    PermissionCode.ROLE_UPDATE,
    PermissionCode.ROLE_DELETE,
  ],
  editor: [PermissionCode.USER_VIEW],
}

/** 角色 -> 菜单 */
export const ROLE_MENUS: Record<string, MenuNode[]> = {
  admin: [
    {
      id: 1,
      name: 'Dashboard',
      path: '/dashboard',
      component: 'dashboard/index',
      title: '首页',
      icon: 'LayoutDashboard',
      type: 'menu',
      sort: 1,
    },
    {
      id: 2,
      name: 'System',
      path: '/system',
      redirect: '/system/user',
      title: '系统管理',
      icon: 'Settings',
      type: 'directory',
      sort: 90,
      children: [
        {
          id: 21,
          parentId: 2,
          name: 'SystemUser',
          path: 'user',
          component: 'system/user/index',
          title: '用户管理',
          icon: 'Users',
          type: 'menu',
          sort: 1,
        },
        {
          id: 22,
          parentId: 2,
          name: 'SystemRole',
          path: 'role',
          component: 'system/role/index',
          title: '角色管理',
          icon: 'ShieldCheck',
          type: 'menu',
          sort: 2,
        },
      ],
    },
    {
      id: 3,
      name: 'CesiumDemo',
      path: '/cesium-demo',
      component: 'cesium-demo/index',
      title: '三维地图',
      icon: 'Globe',
      type: 'menu',
      sort: 95,
    },
  ],
  editor: [
    {
      id: 1,
      name: 'Dashboard',
      path: '/dashboard',
      component: 'dashboard/index',
      title: '首页',
      icon: 'LayoutDashboard',
      type: 'menu',
      sort: 1,
    },
    {
      id: 2,
      name: 'System',
      path: '/system',
      redirect: '/system/user',
      title: '系统管理',
      icon: 'Settings',
      type: 'directory',
      sort: 90,
      children: [
        {
          id: 21,
          parentId: 2,
          name: 'SystemUser',
          path: 'user',
          component: 'system/user/index',
          title: '用户管理',
          icon: 'Users',
          type: 'menu',
          sort: 1,
        },
      ],
    },
  ],
}

/** 初始用户列表 */
export function createInitialUsers(): MockUser[] {
  const list: MockUser[] = []
  const base = new Date('2026-01-01T08:00:00Z').getTime()
  for (let i = 1; i <= 68; i += 1) {
    list.push({
      id: i,
      username: `user${String(i).padStart(3, '0')}`,
      password: '123456',
      nickname: `测试用户${i}`,
      email: `user${i}@example.com`,
      phone: `138${String(10000000 + i).slice(0, 8)}`,
      status: i % 11 === 0 ? 'disabled' : 'enabled',
      roles: i === 1 ? ['admin'] : ['editor'],
      createdAt: new Date(base + i * 86400000).toISOString(),
    })
  }
  return list
}

/** 可被登录的演示账号 */
export const MOCK_ACCOUNTS: Record<string, MockUser> = {
  admin: {
    id: 0,
    username: 'admin',
    password: 'admin123',
    nickname: '超级管理员',
    email: 'admin@example.com',
    phone: '13800000000',
    status: 'enabled',
    roles: ['admin'],
    createdAt: '2026-01-01T08:00:00Z',
  },
  editor: {
    id: -1,
    username: 'editor',
    password: 'editor123',
    nickname: '普通编辑',
    email: 'editor@example.com',
    phone: '13800000001',
    status: 'enabled',
    roles: ['editor'],
    createdAt: '2026-01-02T08:00:00Z',
  },
}

/**
 * 初始角色列表
 *
 * 权限码直接复用 ROLE_PERMISSIONS，保证「mock 菜单看到的权限」
 * 与「角色管理页勾选的权限」是同一份数据，不会出现两处打架。
 */
export function createInitialRoles(): SystemRole[] {
  const adminPermissions = ROLE_PERMISSIONS.admin ?? []
  const editorPermissions = ROLE_PERMISSIONS.editor ?? []

  return [
    {
      id: 1,
      code: 'admin',
      name: '超级管理员',
      description: '拥有全部功能权限，不可删除',
      status: 'enabled',
      permissions: adminPermissions,
      sort: 1,
      createdAt: '2026-01-01T08:00:00Z',
    },
    {
      id: 2,
      code: 'editor',
      name: '普通编辑',
      description: '仅可浏览用户列表，用于演示按钮级权限差异',
      status: 'enabled',
      permissions: editorPermissions,
      sort: 2,
      createdAt: '2026-01-02T08:00:00Z',
    },
    {
      id: 3,
      code: 'auditor',
      name: '审计员',
      description: '只读角色，用于演示第三种权限组合',
      status: 'enabled',
      permissions: [PermissionCode.USER_VIEW, PermissionCode.USER_EXPORT],
      sort: 3,
      createdAt: '2026-01-03T08:00:00Z',
    },
    {
      id: 4,
      code: 'intern',
      name: '实习生',
      description: '已停用示例，用于演示状态筛选',
      status: 'disabled',
      permissions: [PermissionCode.USER_VIEW],
      sort: 4,
      createdAt: '2026-01-04T08:00:00Z',
    },
  ]
}
