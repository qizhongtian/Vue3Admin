<script setup lang="ts">
/**
 * 侧边栏菜单
 *
 * 关键点：
 *  - 菜单数据来自后端（permissionStore），图标通过 **安全映射表** 解析，
 *    不会把后端字符串拼进模块路径；
 *  - 外链菜单渲染成 <a target="_blank">，不进入路由表；
 *  - 目录节点（directory）只作为分组容器：可以展开/收起，但不会跳转页面；
 *  - 选中态由当前路由驱动，支持深层路由自动展开父级。
 */
import { computed, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NMenu, type MenuOption } from 'naive-ui'
import { AppIcon } from '@/components/AppIcon'
import { usePermissionStore } from '@/stores/permission'
import { useAppStore } from '@/stores/app'
import { buildAbsolutePath } from '@/router/route-utils'
import type { MenuNode } from '@/types/route'

const route = useRoute()
const router = useRouter()
const permissionStore = usePermissionStore()
const appStore = useAppStore()

/**
 * 菜单图标渲染器。
 *
 * 后端只下发图标名字符串，这里交给 AppIcon 的**安全映射表**解析，
 * 找不到时回退到默认图标 —— 不会把后端字符串拼进 import() 路径。
 */
function iconRenderer(iconName: string | undefined): (() => ReturnType<typeof h>) | undefined {
  if (!iconName) return undefined
  return () => h(AppIcon, { name: iconName })
}

/**
 * 目录节点（directory）的绝对路径集合。
 *
 * 为什么要单独记下来：目录只作为分组容器存在（例如「系统管理」），
 * 点击它应当是展开/收起而不是跳转 —— 它的 path 并不对应任何页面。
 *
 * 注意这里**不能**用 MenuOption 的 `disabled` 来表达这一点：
 * Naive UI 一旦把菜单项标记为 disabled，连「点击展开」都会被拦掉，
 * 结果整个目录既不能被展开、子菜单也永远点不到（表现为菜单项是灰色不可点）。
 */
const directoryKeys = new Set<string>()

/** 把菜单树转换为 Naive UI 的 MenuOption */
function buildMenuOptions(nodes: MenuNode[], parentPath = ''): MenuOption[] {
  return nodes.map((node) => {
    const fullPath = buildAbsolutePath(parentPath, node.path)

    const renderLabel = (): ReturnType<typeof h> =>
      node.externalUrl
        ? h(
            'a',
            { href: node.externalUrl, target: '_blank', rel: 'noopener noreferrer' },
            { default: () => node.title },
          )
        : h('span', null, { default: () => node.title })

    const option: MenuOption = {
      // 用绝对路径作为 key，便于与当前路由比对
      key: fullPath,
      label: renderLabel,
      // 先在同步作用域里取出来，避免箭头函数内部丢失 node.icon 的类型收窄
      icon: iconRenderer(node.icon),
    }

    if (node.type === 'directory') {
      directoryKeys.add(fullPath)
    }

    if (node.children && node.children.length > 0) {
      option.children = buildMenuOptions(node.children, fullPath)
    }

    return option
  })
}

const menuOptions = computed<MenuOption[]>(() => {
  directoryKeys.clear()
  return buildMenuOptions(permissionStore.visibleMenus)
})

/**
 * 当前选中的菜单。
 * 使用 fullPath 精确匹配；若匹配不到（例如详情页），
 * 退化为按最长前缀匹配，保证父级菜单仍然高亮。
 */
const activeKey = computed<string | null>(() => {
  const current = route.path
  const allPaths = collectPaths(menuOptions.value)
  if (allPaths.includes(current)) {
    return current
  }
  const matched = allPaths
    .filter((path) => current.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)
  return matched[0] ?? null
})

/** 默认展开的父级：当前路径的所有前缀 */
const expandedKeys = computed<string[]>(() => {
  const current = route.path
  return collectParents(menuOptions.value, current)
})

function collectPaths(options: MenuOption[]): string[] {
  const result: string[] = []
  const walk = (list: MenuOption[]): void => {
    list.forEach((item) => {
      result.push(String(item.key))
      if (item.children) {
        walk(item.children)
      }
    })
  }
  walk(options)
  return result
}

function collectParents(options: MenuOption[], target: string): string[] {
  const parents: string[] = []
  const walk = (list: MenuOption[], ancestors: string[]): void => {
    list.forEach((item) => {
      const key = String(item.key)
      const isTarget = key === target || target.startsWith(`${key}/`)
      if (isTarget) {
        parents.push(...ancestors)
      }
      if (item.children) {
        walk(item.children, [...ancestors, key])
      }
    })
  }
  walk(options, [])
  return Array.from(new Set(parents))
}

function handleUpdateValue(key: string): void {
  // 目录节点没有对应页面，push 过去只会命中 404，这里直接忽略
  if (directoryKeys.has(key)) {
    return
  }
  void router.push(key)
}
</script>

<template>
  <NMenu
    :value="activeKey"
    :options="menuOptions"
    :collapsed="appStore.collapsed"
    :collapsed-width="64"
    :collapsed-icon-size="20"
    :default-expanded-keys="expandedKeys"
    :indent="18"
    accordion
    @update:value="handleUpdateValue"
  />
</template>
