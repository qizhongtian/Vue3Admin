/**
 * 权限 Store
 *
 * 职责：菜单数据、动态路由注册与注销、权限初始化。
 *
 * 关键要求：
 *  - 动态路由初始化必须**单飞**：并发导航、登录页跳转、深层路由直达都可能同时触发，
 *    如果没有去重就会出现重复注册、重复请求菜单、甚至无限重定向；
 *  - 必须能够清理：退出登录后要注销动态路由，否则下一个账号会看到上一个账号的菜单；
 *  - 菜单/路由/按钮三层权限分离，本 store 只负责前两层。
 */

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Router } from 'vue-router'
import * as authApi from '@/api/auth'
import type { MenuNode } from '@/types/route'
import { LAYOUT_ROUTE_NAME, transformMenuToRoutes } from '@/router/dynamic-routes'
import { filterVisibleMenus } from '@/router/route-utils'
import { createLogger } from '@/utils/logger'
import type { RouteRecordRaw } from 'vue-router'

const logger = createLogger('permission')

export const usePermissionStore = defineStore('permission', () => {
  /** 后端原始菜单树 */
  const menus = ref<MenuNode[]>([])
  /** 生成出的动态路由记录 */
  const dynamicRoutes = ref<RouteRecordRaw[]>([])
  /** 是否已完成动态路由注册 */
  const isRoutesGenerated = ref(false)
  const loading = ref(false)

  /** addRoute 返回的注销函数，用于彻底移除动态路由 */
  let unregisterFns: Array<() => void> = []
  /** 初始化单飞 Promise */
  let initPromise: Promise<void> | null = null

  /** 侧边栏需要渲染的菜单（已剔除隐藏项与按钮） */
  const visibleMenus = computed<MenuNode[]>(() => filterVisibleMenus(menus.value))

  /** 是否已经初始化过 */
  const isInitialized = computed(() => isRoutesGenerated.value)

  /** 拉取菜单数据 */
  async function loadMenus(): Promise<MenuNode[]> {
    loading.value = true
    try {
      const data = await authApi.fetchMenus()
      menus.value = data
      return data
    } finally {
      loading.value = false
    }
  }

  /**
   * 把菜单转换为路由并注册到布局路由下。
   *
   * @param router 路由实例
   */
  function registerRoutes(router: Router, menuData: MenuNode[]): void {
    const records = transformMenuToRoutes(menuData)
    dynamicRoutes.value = records

    for (const record of records) {
      const name = record.name
      // 同名路由已存在则跳过，彻底杜绝重复注册
      if (typeof name === 'string' && router.hasRoute(name)) {
        logger.warn(`路由名称重复，已跳过注册：${name}`)
        continue
      }
      // vue-router 的 addRoute 会返回一个注销函数，比按 name 删除更可靠
      const unregister = router.addRoute(LAYOUT_ROUTE_NAME, record)
      unregisterFns.push(unregister)
    }
  }

  /**
   * 移除所有已注册的动态路由。
   *
   * 不需要 router 参数：`router.addRoute()` 已经返回了注销函数，
   * 直接调用它们即可精确移除，比按 name 删除更可靠。
   */
  function removeDynamicRoutes(): void {
    unregisterFns.forEach((fn) => {
      try {
        fn()
      } catch (error) {
        logger.warn('注销动态路由时发生异常', error)
      }
    })
    unregisterFns = []
  }

  /**
   * 初始化权限与动态路由（单飞）。
   *
   * 多个并发调用会共享同一个 Promise，避免重复请求与重复注册。
   */
  function initPermission(router: Router, force = false): Promise<void> {
    if (isRoutesGenerated.value && !force) {
      return Promise.resolve()
    }
    if (initPromise) {
      return initPromise
    }

    initPromise = (async () => {
      const menuData = await loadMenus()
      registerRoutes(router, menuData)
      isRoutesGenerated.value = true
      logger.debug(`动态路由注册完成，共 ${dynamicRoutes.value.length} 条`)
    })()
      .catch((error) => {
        // 初始化失败必须回到未初始化状态，否则后续导航会一直以为已经初始化
        removeDynamicRoutes()
        isRoutesGenerated.value = false
        throw error
      })
      .finally(() => {
        initPromise = null
      })

    return initPromise
  }

  /** 清理权限状态并注销动态路由 */
  function resetPermission(): void {
    removeDynamicRoutes()
    unregisterFns = []
    menus.value = []
    dynamicRoutes.value = []
    isRoutesGenerated.value = false
    loading.value = false
    initPromise = null
  }

  return {
    menus,
    dynamicRoutes,
    visibleMenus,
    isRoutesGenerated,
    isInitialized,
    loading,
    loadMenus,
    initPermission,
    registerRoutes,
    removeDynamicRoutes,
    resetPermission,
  }
})
