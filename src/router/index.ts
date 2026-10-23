/**
 * 路由实例
 *
 * 采用「工厂 + 单例」两种导出：
 *  - `createAppRouter()`：工厂方法，单元测试里可以创建干净的路由实例；
 *  - `router`：应用运行时使用的单例。
 *
 * 历史模式使用 createWebHistory 并传入部署基础路径，
 * 这样部署到子目录（例如 /admin/）时路由前缀才正确。
 */

import { createRouter, createWebHistory, type Router } from 'vue-router'
import { constantRoutes } from './routes'
import { envConfig } from '@/config/env'

/** 创建路由实例 */
export function createAppRouter(): Router {
  return createRouter({
    history: createWebHistory(envConfig.baseUrl),
    routes: constantRoutes,
    // 每次导航回到顶部，避免长列表页面跳转后停留原位
    scrollBehavior: () => ({ left: 0, top: 0 }),
  })
}

/** 应用使用的路由单例 */
export const router: Router = createAppRouter()

export default router
