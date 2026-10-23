/**
 * 应用 Store
 *
 * 只存放界面级偏好：侧边栏折叠、主题模式、标签页开关等。
 *
 * 注意「不要把所有业务数据都持久化到浏览器」：
 * 这里仅持久化用户主动选择的偏好项，且体积很小。
 */

import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { createStorage } from '@/utils/storage'
import { StorageKeys, LayoutConfig, type ThemeMode } from '@/config/app'

interface AppSettings {
  collapsed: boolean
  themeMode: ThemeMode
  showTagsView: boolean
  showBreadcrumb: boolean
  primaryColor: string
}

const DEFAULT_SETTINGS: AppSettings = {
  collapsed: false,
  themeMode: 'light',
  showTagsView: true,
  showBreadcrumb: true,
  primaryColor: '#2f6fed',
}

const settingsStorage = createStorage('', 'local')

function readSettings(): AppSettings {
  const cached = settingsStorage.get<Partial<AppSettings>>(StorageKeys.APP_SETTINGS, {})
  return { ...DEFAULT_SETTINGS, ...cached }
}

export const useAppStore = defineStore('app', () => {
  const settings = ref<AppSettings>(readSettings())

  /** 移动端标记，由布局组件根据视口宽度写入 */
  const isMobile = ref(false)
  /** 全局遮罩，移动端展开侧边栏时使用 */
  const drawerVisible = ref(false)

  const collapsed = computed(() => settings.value.collapsed || isMobile.value)
  const themeMode = computed<ThemeMode>(() => settings.value.themeMode)
  const showTagsView = computed(() => settings.value.showTagsView)
  const showBreadcrumb = computed(() => settings.value.showBreadcrumb)
  const primaryColor = computed(() => settings.value.primaryColor)

  const sidebarWidth = computed(() =>
    isMobile.value
      ? 0
      : collapsed.value
        ? LayoutConfig.SIDEBAR_COLLAPSED_WIDTH
        : LayoutConfig.SIDEBAR_WIDTH,
  )

  // 偏好变更时落盘（仅在浏览器环境下）
  watch(
    settings,
    (value) => {
      settingsStorage.set(StorageKeys.APP_SETTINGS, value)
    },
    { deep: true },
  )

  function toggleSidebar(): void {
    if (isMobile.value) {
      drawerVisible.value = !drawerVisible.value
      return
    }
    settings.value.collapsed = !settings.value.collapsed
  }

  function setCollapsed(value: boolean): void {
    settings.value.collapsed = value
  }

  function toggleTheme(): void {
    settings.value.themeMode = settings.value.themeMode === 'light' ? 'dark' : 'light'
  }

  function setThemeMode(mode: ThemeMode): void {
    settings.value.themeMode = mode
  }

  function setShowTagsView(value: boolean): void {
    settings.value.showTagsView = value
  }

  function setIsMobile(value: boolean): void {
    isMobile.value = value
    if (!value) {
      drawerVisible.value = false
    }
  }

  function closeDrawer(): void {
    drawerVisible.value = false
  }

  function resetSettings(): void {
    settings.value = { ...DEFAULT_SETTINGS }
  }

  return {
    settings,
    isMobile,
    drawerVisible,
    collapsed,
    themeMode,
    showTagsView,
    showBreadcrumb,
    primaryColor,
    sidebarWidth,
    toggleSidebar,
    setCollapsed,
    toggleTheme,
    setThemeMode,
    setShowTagsView,
    setIsMobile,
    closeDrawer,
    resetSettings,
  }
})
