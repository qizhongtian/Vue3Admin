/**
 * 静态路由表
 *
 * 静态路由（登录、错误页、首页容器）与动态路由（后端下发）严格分离。
 *
 * 关键约定：
 *  - 布局路由 BasicLayout **不设置 redirect**。
 *    因为动态路由要等菜单加载完成后才注册，如果在进入前就写死 redirect，
 *    首次访问时会因为目标路由尚未注册而被解析成 404。
 *    根路径的跳转交给 guard 在路由初始化完成后决策。
 *  - Dashboard 作为保底首页静态注册：即使某个账号的菜单里没有它，
 *    登录后也不会无处可去；动态菜单里若重复出现同名路由会被自动跳过注册。
 *  - 404 通配路由必须放在最后，否则会抢占其它路由。
 */

import type { RouteRecordRaw } from 'vue-router'
import BasicLayout from '@/layouts/BasicLayout.vue'
import { RouteNames } from '@/config/app'

export const constantRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: RouteNames.LOGIN,
    component: () => import('@/views/login/index.vue'),
    meta: {
      title: '登录',
      requiresAuth: false,
      hidden: true,
    },
  },
  {
    path: '/',
    name: 'BasicLayout',
    component: BasicLayout,
    children: [
      {
        path: 'dashboard',
        name: RouteNames.DASHBOARD,
        component: () => import('@/views/dashboard/index.vue'),
        meta: {
          title: '首页',
          icon: 'LayoutDashboard',
          requiresAuth: true,
          keepAlive: false,
        },
      },
    ],
  },
  {
    path: '/403',
    name: RouteNames.ERROR_403,
    component: () => import('@/views/error/Forbidden.vue'),
    meta: {
      title: '无权限',
      requiresAuth: false,
      hidden: true,
    },
  },
  // 兜底：必须放在所有路由之后
  {
    path: '/:pathMatch(.*)*',
    name: RouteNames.ERROR_404,
    component: () => import('@/views/error/NotFound.vue'),
    meta: {
      title: '页面不存在',
      requiresAuth: false,
      hidden: true,
    },
  },
]
