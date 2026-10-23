/**
 * route-utils.ts（菜单树纯函数）单元测试
 */
import { describe, expect, it } from 'vitest'

import {
  buildAbsolutePath,
  buildBreadcrumb,
  filterVisibleMenus,
  findFirstAccessiblePath,
  findMenuByFullPath,
  flattenMenus,
  sortBySortField,
} from '@/router/route-utils'
import type { MenuNode } from '@/types/route'

function menu(
  overrides: Partial<MenuNode> & Pick<MenuNode, 'id' | 'name' | 'path' | 'title' | 'type'>,
): MenuNode {
  return { ...overrides }
}

const tree: MenuNode[] = [
  menu({
    id: '1',
    name: 'Dashboard',
    path: '/dashboard',
    title: '工作台',
    type: 'menu',
    sort: 2,
  }),
  menu({
    id: '2',
    name: 'System',
    path: '/system',
    title: '系统管理',
    type: 'directory',
    sort: 1,
    children: [
      menu({
        id: '2-1',
        name: 'SystemUser',
        path: 'user',
        title: '用户管理',
        type: 'menu',
        sort: 2,
        children: [
          menu({
            id: '2-1-1',
            name: 'UserCreate',
            path: 'create',
            title: '新建用户',
            type: 'button',
          }),
        ],
      }),
      menu({
        id: '2-2',
        name: 'SystemRole',
        path: 'role',
        title: '角色管理',
        type: 'menu',
        sort: 1,
      }),
    ],
  }),
  menu({
    id: '3',
    name: 'HiddenMenu',
    path: '/hidden',
    title: '隐藏页',
    type: 'menu',
    hidden: true,
  }),
  menu({
    id: '4',
    name: 'External',
    path: '/external',
    title: '外链',
    type: 'menu',
    externalUrl: 'https://example.com',
  }),
]

describe('flattenMenus', () => {
  it('递归打平整棵树（含按钮）', () => {
    const flat = flattenMenus(tree)
    expect(flat.map((node) => node.id)).toEqual(['1', '2', '2-1', '2-1-1', '2-2', '3', '4'])
  })
})

describe('filterVisibleMenus', () => {
  it('剔除按钮与隐藏节点', () => {
    const visible = filterVisibleMenus(tree)
    const ids = visible.map((node) => node.id)

    expect(ids).not.toContain('3') // hidden
    // 外链属于 menu 类型，filterVisibleMenus 不负责剔除它（由路由层处理）
    expect(ids).toContain('4')
    // 子级按钮被剔除后 children 变为 undefined
    expect(visible.find((node) => node.id === '2-1')?.children).toBeUndefined()
  })

  it('外链菜单保留，按钮被剔除', () => {
    const visible = filterVisibleMenus(tree)
    expect(visible.find((node) => node.id === '4')).toBeDefined()
    expect(visible.find((node) => node.id === '2-1')?.children).toBeUndefined()
  })

  it('空目录（所有子节点均不可见）被剔除', () => {
    const withEmptyDir: MenuNode[] = [
      menu({
        id: 'd1',
        name: 'EmptyDir',
        path: '/empty',
        title: '空目录',
        type: 'directory',
        children: [menu({ id: 'd1-1', name: 'B', path: 'b', title: '按钮', type: 'button' })],
      }),
    ]
    expect(filterVisibleMenus(withEmptyDir)).toEqual([])
  })
})

describe('buildAbsolutePath', () => {
  it('子路径为相对路径时拼接父路径', () => {
    expect(buildAbsolutePath('/system', 'user')).toBe('/system/user')
  })

  it('子路径以 / 开头时使用绝对路径', () => {
    expect(buildAbsolutePath('/system', '/other')).toBe('/other')
  })

  it('父路径末尾多余斜杠被归一化', () => {
    expect(buildAbsolutePath('/system/', 'user')).toBe('/system/user')
  })
})

describe('findMenuByFullPath', () => {
  it('命中节点并返回根到叶子的链路', () => {
    const matched = findMenuByFullPath(tree, '/system/role')

    expect(matched).not.toBeNull()
    expect(matched?.node.id).toBe('2-2')
    expect(matched?.fullPath).toBe('/system/role')
    expect(matched?.chain.map((node) => node.id)).toEqual(['2', '2-2'])
  })

  it('找不到时返回 null', () => {
    expect(findMenuByFullPath(tree, '/no/such/path')).toBeNull()
  })

  it('目录本身不作为命中目标，继续下钻', () => {
    // /system 是目录，应继续在子节点中找
    expect(findMenuByFullPath(tree, '/system')).toBeNull()
  })
})

describe('findFirstAccessiblePath', () => {
  it('优先返回第一个非外链页面菜单', () => {
    expect(findFirstAccessiblePath(tree)).toBe('/dashboard')
  })

  it('跳过按钮、隐藏节点与外链', () => {
    const onlySpecial: MenuNode[] = [
      menu({ id: 'b', name: 'B', path: '/b', title: '按钮', type: 'button' }),
      menu({ id: 'h', name: 'H', path: '/h', title: '隐藏', type: 'menu', hidden: true }),
      menu({
        id: 'e',
        name: 'E',
        path: '/e',
        title: '外链',
        type: 'menu',
        externalUrl: 'https://x.com',
      }),
      menu({ id: 'm', name: 'M', path: '/m', title: '页面', type: 'menu' }),
    ]
    expect(findFirstAccessiblePath(onlySpecial)).toBe('/m')
  })

  it('菜单声明 redirect 时优先使用', () => {
    const withRedirect: MenuNode[] = [
      menu({
        id: 'r',
        name: 'R',
        path: '/r',
        title: '带重定向',
        type: 'menu',
        redirect: '/r/detail',
      }),
    ]
    expect(findFirstAccessiblePath(withRedirect)).toBe('/r/detail')
  })

  it('空树使用 fallback', () => {
    expect(findFirstAccessiblePath([], '/fallback')).toBe('/fallback')
  })
})

describe('buildBreadcrumb', () => {
  it('返回过滤后的层级链路', () => {
    const breadcrumb = buildBreadcrumb(tree, '/system/user')
    expect(breadcrumb.map((node) => node.title)).toEqual(['系统管理', '用户管理'])
  })

  it('未命中返回空数组', () => {
    expect(buildBreadcrumb(tree, '/nothing')).toEqual([])
  })

  it('链路中的隐藏节点被剔除', () => {
    const withHiddenParent: MenuNode[] = [
      menu({
        id: 'p',
        name: 'P',
        path: '/p',
        title: '隐藏父级',
        type: 'directory',
        hidden: true,
        children: [menu({ id: 'p1', name: 'P1', path: 'child', title: '子页', type: 'menu' })],
      }),
    ]
    expect(buildBreadcrumb(withHiddenParent, '/p/child').map((node) => node.title)).toEqual([
      '子页',
    ])
  })
})

describe('sortBySortField', () => {
  it('按 sort 升序，缺省视为 0，且不修改原数组', () => {
    const original = [{ name: 'c', sort: 3 }, { name: 'a' }, { name: 'b', sort: 1 }]
    const sorted = sortBySortField(original)

    expect(sorted.map((node) => node.name)).toEqual(['a', 'b', 'c'])
    expect(original.map((node) => node.name)).toEqual(['c', 'a', 'b'])
  })
})
