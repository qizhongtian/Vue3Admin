/**
 * 路由 / 菜单通用工具
 *
 * 全部为纯函数，方便单元测试。
 */

import type { MenuNode } from '@/types/route'

/** 递归打平菜单树 */
export function flattenMenus(nodes: MenuNode[]): MenuNode[] {
  const result: MenuNode[] = []
  const walk = (list: MenuNode[]): void => {
    for (const node of list) {
      result.push(node)
      if (node.children?.length) {
        walk(node.children)
      }
    }
  }
  walk(nodes)
  return result
}

/** 过滤出需要在侧边栏展示的节点（剔除隐藏项与纯按钮） */
export function filterVisibleMenus(nodes: MenuNode[]): MenuNode[] {
  return nodes
    .filter((node) => node.type !== 'button' && !node.hidden)
    .map((node) => ({
      ...node,
      children: node.children ? filterVisibleMenus(node.children) : undefined,
    }))
    .filter((node) => (node.type === 'directory' ? (node.children?.length ?? 0) > 0 : true))
}

/** 按父子关系拼接成绝对路径 */
export function buildAbsolutePath(parentPath: string, path: string): string {
  if (path.startsWith('/')) {
    return path
  }
  const normalized = parentPath.endsWith('/') ? parentPath.slice(0, -1) : parentPath
  return `${normalized}/${path}`
}

export interface MenuChainResult {
  /** 命中的菜单节点 */
  node: MenuNode
  /** 从根到当前节点的链路 */
  chain: MenuNode[]
  /** 绝对路径 */
  fullPath: string
}

/** 在菜单树中按绝对路径查找节点，并返回层级链路（用于面包屑） */
export function findMenuByFullPath(nodes: MenuNode[], targetPath: string): MenuChainResult | null {
  const search = (
    list: MenuNode[],
    parentPath: string,
    ancestors: MenuNode[],
  ): MenuChainResult | null => {
    for (const node of list) {
      const fullPath = buildAbsolutePath(parentPath, node.path)
      const chain = [...ancestors, node]
      if (
        node.type !== 'directory' &&
        (fullPath === targetPath || targetPath.startsWith(`${fullPath}/`))
      ) {
        // 继续下钻，优先命中更精确的子节点
        if (node.children?.length) {
          const deeper = search(node.children, fullPath, chain)
          if (deeper) {
            return deeper
          }
        }
        return { node, chain, fullPath }
      }
      if (node.children?.length) {
        const found = search(node.children, fullPath, chain)
        if (found) {
          return found
        }
      }
    }
    return null
  }
  return search(nodes, '', [])
}

/**
 * 找出登录后应当跳转的首个菜单页面。
 * 优先取第一个非外链的可访问页面菜单。
 */
export function findFirstAccessiblePath(nodes: MenuNode[], fallback = '/dashboard'): string {
  const stack: Array<{ node: MenuNode; parentPath: string }> = nodes.map((node) => ({
    node,
    parentPath: '',
  }))

  while (stack.length > 0) {
    const current = stack.shift()
    if (!current) {
      break
    }
    const { node, parentPath } = current
    if (node.type === 'button' || node.hidden) {
      continue
    }
    const fullPath = buildAbsolutePath(parentPath, node.path)
    if (node.type === 'menu' && !node.externalUrl) {
      return node.redirect ?? fullPath
    }
    if (node.children?.length) {
      stack.push(...node.children.map((child) => ({ node: child, parentPath: fullPath })))
    }
  }
  return fallback
}

/** 构造面包屑（只包含非隐藏节点） */
export function buildBreadcrumb(nodes: MenuNode[], currentPath: string): MenuNode[] {
  const matched = findMenuByFullPath(nodes, currentPath)
  if (!matched) {
    return []
  }
  return matched.chain.filter((node) => node.type !== 'button' && !node.hidden)
}

/** 排序：sort 升序，缺省视为 0 */
export function sortBySortField<T extends { sort?: number }>(nodes: T[]): T[] {
  return [...nodes].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
}
