/**
 * 路由与菜单类型
 *
 * 安全约定
 * --------
 * 后端菜单数据里只允许出现「前端已注册的组件标识」（例如 `system/user/index`），
 * 由 `src/router/dynamic-routes.ts` 的映射表翻译成真实组件。
 * 严禁把后端返回的字符串直接拼进 `import()`，否则等价于允许后端远程执行任意模块加载。
 */

import type { RouteRecordRaw } from 'vue-router'

/** 菜单节点类型 */
export type MenuType =
  /** 目录，仅用于分组，自身没有页面 */
  | 'directory'
  /** 页面菜单 */
  | 'menu'
  /** 按钮/操作，不参与路由生成，只用于按钮级权限 */
  | 'button'

/** 后端返回的原始菜单节点 */
export interface MenuNode {
  id: string | number
  parentId?: string | number | null
  /** 路由名称，需全局唯一 */
  name: string
  /** 路由路径 */
  path: string
  /**
   * 前端组件标识，只允许取自 componentMap。
   * 目录节点可以为空。
   */
  component?: string
  /** 重定向地址，通常用于目录指向首个子菜单 */
  redirect?: string
  /** 菜单标题 */
  title: string
  /** 图标标识，取自 lucide 图标映射表 */
  icon?: string
  /** 节点类型 */
  type: MenuType
  /** 排序号，升序排列 */
  sort?: number
  /** 是否在侧边栏隐藏 */
  hidden?: boolean
  /** 是否缓存页面 */
  keepAlive?: boolean
  /** 外链地址，存在时不注册本地路由 */
  externalUrl?: string
  /** 访问该页面所需的权限码 */
  permissions?: string[]
  /** 访问该页面所需的角色 */
  roles?: string[]
  children?: MenuNode[]
}

/** 扩展的路由元信息 */
export interface AppRouteMeta {
  /** 菜单 / 面包屑 / 标签页标题 */
  title: string
  /** 图标标识 */
  icon?: string
  /** 所需权限码，空数组或不传表示不限制 */
  permissions?: string[]
  /** 所需角色 */
  roles?: string[]
  /** 是否缓存 */
  keepAlive?: boolean
  /** 是否在菜单中隐藏 */
  hidden?: boolean
  /** 是否需要登录才能访问，默认 true */
  requiresAuth: boolean
  /** 排序号 */
  sort?: number
  /** 后端菜单 id，便于排错 */
  menuId?: string | number
  /** 命中的前端组件标识 */
  componentKey?: string
  /** 外链地址 */
  externalUrl?: string
}

/**
 * 模块增强：让 vue-router 的 meta 具备本项目的类型。
 *
 * vue-router 5 中 `interface RouteMeta extends Record<PropertyKey, unknown>`，
 * 不做增强时 `to.meta.xxx` 一律推导为 unknown。这里通过声明合并补上已知字段。
 */
declare module 'vue-router' {
  interface RouteMeta extends Partial<AppRouteMeta> {
    /** 默认需要鉴权，缺省视为 true，这里保持可选以便书写 */
    requiresAuth?: boolean
  }
}

/**
 * 从 vue-router 的联合类型中取出 component 的允许类型
 * （等价于内部的 RawRouteComponent = RouteComponent | Lazy<RouteComponent>，但它未导出）。
 */
type ExtractComponentOption<T> = T extends { component?: infer C } ? C : never
type RouteComponentOption = ExtractComponentOption<RouteRecordRaw>

/**
 * 带完整 meta 的路由记录。
 * 由于 vue-router 的 RouteRecordRaw 是联合类型，这里用自有结构化类型作为中间表示，
 * 在真正注册时再交给 addRoute。
 */
export interface AppRouteRecord {
  path: string
  name?: string
  component?: RouteComponentOption
  redirect?: string
  meta: AppRouteMeta
  children?: AppRouteRecord[]
}
