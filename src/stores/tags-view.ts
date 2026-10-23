/**
 * 标签页 Store
 *
 * 设计要点：
 *  - 只保存路由的元信息快照（path / name / title / 是否缓存），
 *    **不保存组件实例**，否则持久化或序列化时会出问题；
 *  - cachedViews 只记录需要 keep-alive 的组件名，供 <keep-alive :include> 使用；
 *  - 退出登录时必须清掉受保护页面的标签，避免下个账号看到上一个账号的页签。
 */

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { RouteLocationNormalized } from 'vue-router'

export interface TagView {
  fullPath: string
  path: string
  name: string
  title: string
  /** 是否需要缓存 */
  keepAlive: boolean
  /** 是否固定在标签栏（首页通常固定） */
  affix: boolean
  icon?: string
}

/** 固定标签的路由名 */
const AFFIX_ROUTE_NAMES = new Set(['Dashboard'])

export const useTagsViewStore = defineStore('tags-view', () => {
  const visitedViews = ref<TagView[]>([])

  /**
   * 手动刷新序号。
   * BasicLayout 把它拼进 router-view 的 key，递增时即强制重建页面组件，
   * 从而实现「刷新当前页」而不需要跳转到一个临时路由。
   */
  const refreshSeq = ref(0)

  function incrementRefresh(): void {
    refreshSeq.value += 1
  }

  /** 需要缓存的组件名 */
  const cachedViews = computed<string[]>(() =>
    visitedViews.value.filter((item) => item.keepAlive).map((item) => item.name),
  )

  function toTag(route: RouteLocationNormalized): TagView {
    const title =
      typeof route.meta.title === 'string' ? route.meta.title : String(route.name ?? route.path)
    return {
      fullPath: route.fullPath,
      path: route.path,
      name: String(route.name ?? route.path),
      title,
      keepAlive: route.meta.keepAlive === true,
      affix: AFFIX_ROUTE_NAMES.has(String(route.name ?? '')),
      icon: typeof route.meta.icon === 'string' ? route.meta.icon : undefined,
    }
  }

  /** 判断标签是否已存在 */
  function hasView(route: RouteLocationNormalized): boolean {
    return visitedViews.value.some((item) => item.path === route.path)
  }

  /** 新增标签 */
  function addView(route: RouteLocationNormalized): TagView | null {
    if (!route.name || hasView(route)) {
      return null
    }
    const tag = toTag(route)
    visitedViews.value.push(tag)
    return tag
  }

  /** 更新标签（例如同一菜单不同参数） */
  function updateView(route: RouteLocationNormalized): void {
    const index = visitedViews.value.findIndex((item) => item.path === route.path)
    if (index >= 0) {
      visitedViews.value[index] = toTag(route)
    }
  }

  /** 关闭标签并返回相邻标签（供布局决定下一个展示页） */
  function closeView(target: TagView | string): TagView | null {
    const targetView =
      typeof target === 'string' ? visitedViews.value.find((item) => item.path === target) : target
    if (!targetView || targetView.affix) {
      return null
    }
    const index = visitedViews.value.findIndex((item) => item.path === targetView.path)
    if (index < 0) {
      return null
    }
    const neighbors = visitedViews.value.filter((item) => item.path !== targetView.path)
    visitedViews.value = neighbors
    return neighbors[Math.max(0, index - 1)] ?? null
  }

  /** 关闭右侧标签 */
  function closeRightViews(target: TagView): void {
    const index = visitedViews.value.findIndex((item) => item.path === target.path)
    if (index < 0) {
      return
    }
    visitedViews.value = visitedViews.value.slice(0, index + 1)
  }

  /** 关闭左侧标签 */
  function closeLeftViews(target: TagView): void {
    const index = visitedViews.value.findIndex((item) => item.path === target.path)
    if (index < 0) {
      return
    }
    visitedViews.value = visitedViews.value.filter((item, i) => i >= index || item.affix)
  }

  /** 关闭其它标签 */
  function closeOtherViews(target: TagView): void {
    visitedViews.value = visitedViews.value.filter(
      (item) => item.affix || item.path === target.path,
    )
  }

  /** 关闭全部（保留固定标签） */
  function closeAllViews(): void {
    visitedViews.value = visitedViews.value.filter((item) => item.affix)
  }

  /** 退出登录时清理受保护标签 */
  function resetTagsView(): void {
    visitedViews.value = []
  }

  return {
    visitedViews,
    cachedViews,
    refreshSeq,
    incrementRefresh,
    toTag,
    hasView,
    addView,
    updateView,
    closeView,
    closeRightViews,
    closeLeftViews,
    closeOtherViews,
    closeAllViews,
    resetTagsView,
  }
})
