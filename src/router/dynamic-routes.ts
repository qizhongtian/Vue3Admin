/**
 * 动态路由生成
 *
 * ============================ 安全约束 ============================
 *
 * 后端菜单只允许传入「已注册的组件标识」，不允许传任意路径。
 * 这里通过一张**静态写死的映射表**做翻译：
 * 后端传 `system/user/index` -> 取 import('@/views/system/user/index.vue')。
 *
 * 绝对不能写成 `import(rawComponentPath)` —— 那等于允许后端决定加载哪个模块，
 * 轻则 404，重则被利用成远程代码执行入口。
 *
 * 组件标识未命中时统一回退到错误页，并在开发环境给出警告，避免静默白屏。
 */

import type { Component } from 'vue'
import type { RouteMeta, RouteRecordRaw } from 'vue-router'
import type { MenuNode } from '@/types/route'
import { createLogger } from '@/utils/logger'

const logger = createLogger('dynamic-routes')

/** 布局路由名称，动态路由统一挂载到它下面 */
export const LAYOUT_ROUTE_NAME = 'BasicLayout'

/**
 * 受白名单约束的组件映射表。
 * 新增页面时必须在此登记，否则后端下发的菜单无法生效。
 */
const componentMap: Record<string, () => Promise<Component>> = {
  'dashboard/index': () => import('@/views/dashboard/index.vue'),
  'system/user/index': () => import('@/views/system/user/index.vue'),
  'system/role/index': () => import('@/views/system/role/index.vue'),
  'cesium-demo/index': () => import('@/views/cesium-demo/index.vue'),
}

/** 组件标识缺失或未登记时的兜底页面 */
const FallbackComponent: () => Promise<Component> = () => import('@/views/error/Exception.vue')

/** 返回所有已登记的组件标识，便于调试与测试断言 */
export function listComponentKeys(): string[] {
  return Object.keys(componentMap)
}

/** 安全地把组件标识翻译为懒加载组件 */
export function resolveComponent(key: string | undefined): () => Promise<Component> {
  if (!key) {
    return FallbackComponent
  }
  const loader = componentMap[key]
  if (!loader) {
    logger.warn(`菜单组件标识未登记：「${key}」，已回退到异常页`)
    return FallbackComponent
  }
  return loader
}

/**
 * 构造路由元信息。
 *
 * 返回类型用 vue-router 的 RouteMeta 而不是 AppRouteMeta：
 * RouteMeta 带 `[key: string]: unknown` 索引签名，RouteRecordRaw.meta 需要它；
 * 而 AppRouteMeta 是 interface（没有隐式索引签名），直接返回会导致类型不兼容。
 * 字段层面两者完全一致 —— 因为 `types/route.ts` 里已经用模块增强
 * 把 AppRouteMeta 合并进了 RouteMeta。
 */
function buildMeta(node: MenuNode): RouteMeta {
  return {
    title: node.title,
    icon: node.icon,
    permissions: node.permissions,
    roles: node.roles,
    keepAlive: node.keepAlive,
    hidden: node.hidden,
    requiresAuth: true,
    sort: node.sort,
    menuId: node.id,
    componentKey: node.component,
    externalUrl: node.externalUrl,
  }
}

/** 排序，保证菜单与路由顺序稳定 */
function sortNodes(nodes: MenuNode[]): MenuNode[] {
  return [...nodes].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
}

/** 拼接父子路径为绝对路径 */
function joinPath(parentPath: string, childPath: string): string {
  if (childPath.startsWith('/')) {
    return childPath
  }
  const normalizedParent = parentPath.endsWith('/') ? parentPath.slice(0, -1) : parentPath
  return `${normalizedParent}/${childPath}`
}

/**
 * 把后端菜单树转换为**扁平**的路由记录。
 *
 * 为什么不保留嵌套：
 *  - vue-router 的类型要求带 children 的父记录必须提供 component，
 *    而目录节点本身没有页面，硬塞一个空壳组件属于无意义抽象；
 *  - 扁平化后所有页面都直接挂在布局路由下，匹配行为更可预测，
 *    也避免了「父级重定向与子路由并存」导致的匹配歧义；
 *  - 面包屑通过菜单树另行计算（见 route-utils.ts），不依赖路由嵌套关系。
 *
 * 处理细节：
 *  - button 类型不产生路由；
 *  - hidden 的菜单不注册路由（详情页等可通过已有路径访问）；
 *  - 外链菜单不注册本地路由，由菜单组件直接渲染 <a>。
 */
export function transformMenuToRoutes(nodes: MenuNode[], parentPath = ''): RouteRecordRaw[] {
  const records: RouteRecordRaw[] = []

  for (const node of sortNodes(nodes)) {
    if (node.type === 'button' || node.hidden) {
      continue
    }

    // 外链交给菜单渲染，不进入路由表
    if (node.type === 'menu' && node.externalUrl) {
      continue
    }

    const absolutePath = parentPath ? joinPath(parentPath, node.path) : node.path

    // 目录：递归展开子节点，自身不产生路由
    if (node.type === 'directory') {
      if (node.children && node.children.length > 0) {
        records.push(...transformMenuToRoutes(node.children, absolutePath))
      }
      continue
    }

    if (node.type !== 'menu') {
      continue
    }

    // 页面仍可能携带子路由（例如详情页），此时需要父级组件渲染嵌套 view
    const children = node.children ? transformMenuToRoutes(node.children, absolutePath) : []

    records.push({
      path: absolutePath,
      name: node.name,
      component: resolveComponent(node.component),
      meta: buildMeta(node),
      ...(children.length > 0 ? { children } : {}),
    })
  }

  return records
}
