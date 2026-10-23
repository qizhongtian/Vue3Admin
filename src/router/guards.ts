/**
 * 路由守卫
 *
 * 需要覆盖的真实场景：
 *  1. 未登录访问受保护页面      -> 记录原地址后跳转登录页；
 *  2. 登录后回访登录页          -> 跳转首页；
 *  3. 浏览器刷新 / 深层路由直达 -> 等待菜单加载与动态路由注册完成后再放行，
 *                                绝不能在路由尚未就绪时把用户重定向到 404；
 *  4. 权限数据加载失败          -> 回到登录页，且不留下半初始化状态；
 *  5. 无权限访问页面            -> 403；
 *  6. 会话被统一终止            -> 清理所有 store、注销动态路由、跳转登录页；
 *  7. 不同账号切换              -> 上一个账号的动态路由必须被彻底注销。
 *
 * 这里刻意把所有「跳转到登录页」的原因收敛到 `redirectToLogin`，
 * 便于统一带上 redirect 参数，避免各分支行为不一致。
 */

import type { RouteLocationNormalized, Router } from 'vue-router'
import { RouteNames } from '@/config/app'
import { envConfig } from '@/config/env'
import { getAccessToken, hasActiveSession, onSessionTerminated } from '@/utils/auth-session'
import { checkAccess } from '@/utils/permission'
import { clearDedupe } from '@/utils/request-dedupe'
import { notifyError } from '@/utils/notify'
import { createLogger } from '@/utils/logger'
import { useUserStore } from '@/stores/user'
import { usePermissionStore } from '@/stores/permission'
import { useTagsViewStore } from '@/stores/tags-view'
import { findFirstAccessiblePath } from './route-utils'

const logger = createLogger('router-guard')

/** 白名单：这些路由不需要登录即可访问 */
function isPublicRoute(to: RouteLocationNormalized): boolean {
  // 刷新 / 深链直达时，动态路由尚未注册，目标地址会暂时匹配到 404 兜底路由。
  // 兜底路由虽声明了 requiresAuth: false，但此时不能当作公开路由放行，
  // 否则会跳过「补齐动态路由」流程，刷新后永远落在 404 页。
  if (to.name === RouteNames.ERROR_404) {
    return false
  }
  return to.meta.requiresAuth === false
}

/** 统一跳转到登录页并带上原始访问地址 */
function redirectToLogin(to: RouteLocationNormalized | null): {
  name: string
  query: Record<string, string>
} {
  const redirect = to && to.path !== '/login' ? to.fullPath : undefined
  return {
    name: RouteNames.LOGIN,
    query: redirect ? { redirect } : {},
  }
}

/**
 * 决定登录后应该跳到哪个页面。
 * 优先使用后端菜单里的首个可访问页面，其次回退到静态首页。
 */
function resolveHomeTarget(router: Router): { path: string } {
  const permissionStore = usePermissionStore()
  const firstPath = findFirstAccessiblePath(permissionStore.menus, '/dashboard')

  // 极端情况：菜单给出的目标并未注册（例如后端配置错误），退回静态首页
  const candidates = [firstPath, '/dashboard']
  for (const path of candidates) {
    const resolved = router.resolve(path)
    const isNotFound = resolved.matched.some((record) => record.name === RouteNames.ERROR_404)
    if (!isNotFound) {
      return { path }
    }
  }
  return { path: '/dashboard' }
}

/** 会话被统一终止时的处理（由 auth-session 保证同一事件只触发一次） */
function handleSessionTerminated(event: {
  notifyUser: boolean
  message: string
  generation: number
}): void {
  logger.warn(`会话终止：${event.message}`)

  if (event.notifyUser) {
    // 去重键带上代次：同一失效事件只提示一次，新会话仍可正常提示
    notifyError(event.message, `session-expired:${event.generation}`)
  }

  const permissionStore = usePermissionStore()
  const userStore = useUserStore()
  const tagsViewStore = useTagsViewStore()

  permissionStore.resetPermission()
  userStore.resetState()
  tagsViewStore.resetTagsView()
  clearDedupe()
}

/**
 * 注册路由守卫。
 *
 * @returns 清理函数，测试或应用销毁时调用
 */
export function setupRouterGuards(router: Router): () => void {
  const unsubscribe = onSessionTerminated(handleSessionTerminated)

  const removeBeforeEach = router.beforeEach(async (to) => {
    logger.debug(`导航进入：${to.fullPath}`)

    // token 存在并不意味着会话有效：退出登录后 token 会被清空，
    // 但同一代次内仍可能存在迟到的请求，需要用 hasActiveSession 二次确认
    const token = getAccessToken()
    const sessionActive = hasActiveSession()

    // ---- 公开路由（登录页 / 403 / 404）----
    if (isPublicRoute(to)) {
      // 已登录用户不应再停留在登录页
      if (to.name === RouteNames.LOGIN && token && sessionActive) {
        logger.debug('已登录访问登录页，重定向到首页')
        return { path: '/' }
      }
      return true
    }

    // ---- 未登录访问受保护页面 ----
    if (!token || !sessionActive) {
      logger.warn('未登录访问受保护页面，跳转登录')
      return redirectToLogin(to)
    }

    const userStore = useUserStore()
    const permissionStore = usePermissionStore()

    // ---- 权限数据未初始化：补齐后再放行 ----
    if (!permissionStore.isRoutesGenerated) {
      try {
        // 刷新页面时本地快照不可信，这里会向服务端重新校验用户信息与权限
        await userStore.ensureProfile()
        await permissionStore.initPermission(router)
      } catch (error) {
        logger.error('权限初始化失败，回到登录页', error)
        permissionStore.resetPermission()
        return redirectToLogin(to)
      }

      // 动态路由刚刚注册完成，需要重新解析一次目标地址
      if (to.path === '/') {
        return { ...resolveHomeTarget(router), replace: true }
      }
      return { path: to.fullPath, replace: true }
    }

    // ---- 根路径定向 ----
    if (to.path === '/') {
      return { ...resolveHomeTarget(router), replace: true }
    }

    // ---- 页面级权限 ----
    const allowed = checkAccess({
      roles: userStore.roles,
      permissions: userStore.permissions,
      requiredRoles: Array.isArray(to.meta.roles) ? to.meta.roles : undefined,
      requiredPermissions: Array.isArray(to.meta.permissions) ? to.meta.permissions : undefined,
      superAdmin: userStore.isSuperAdmin,
    })

    if (!allowed) {
      logger.warn(`无权限访问：${to.fullPath}`)
      return { name: RouteNames.ERROR_403 }
    }

    return true
  })

  const removeAfterEach = router.afterEach((to) => {
    // 设置浏览器标签标题
    const title = typeof to.meta.title === 'string' ? to.meta.title : ''
    document.title = title ? `${title} - ${envConfig.appTitle}` : envConfig.appTitle

    // 记录标签页（登录页与错误页不记录）
    if (to.meta.requiresAuth !== false && to.name) {
      useTagsViewStore().addView(to)
    }
  })

  return () => {
    unsubscribe()
    removeBeforeEach()
    removeAfterEach()
  }
}
