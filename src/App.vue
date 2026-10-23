<script setup lang="ts">
/**
 * 根组件
 *
 * 职责：提供全局主题、国际化、弹窗/消息上下文；不承载任何业务。
 *
 * 主题：状态由 store 维护，`data-theme` 属性决定自定义 CSS 变量取值，
 * Naive UI 自身的主题通过 n-config-provider 的 theme 属性切换。
 */
import { computed, watchEffect } from 'vue'
/**
 * 注意：这里**没有**传 `date-locale`。
 * date 国际化依赖 naive-ui 的 date  locale 包，会连带把 date-fns 拉进产物。
 * 本项目当前没有任何日期选择器，因此不引入；后续若新增 NDatePicker /
 * NTimePicker，再补上 `:date-locale="dateZhCN"` 即可。
 */
import {
  NConfigProvider,
  NDialogProvider,
  NGlobalStyle,
  NLoadingBarProvider,
  NMessageProvider,
  NNotificationProvider,
  darkTheme,
  zhCN,
} from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'
import { RouterView } from 'vue-router'
import MessageBridge from '@/components/MessageBridge.vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

/** Naive UI 主题覆盖：与 CSS 变量中的主色保持一致 */
const themeOverrides = computed<GlobalThemeOverrides>(() => ({
  common: {
    primaryColor: appStore.primaryColor,
    primaryColorHover: '#4a82f1',
    primaryColorPressed: '#2a5fd4',
    primaryColorSuppl: '#4a82f1',
    borderRadius: '8px',
    fontSize: '14px',
  },
}))

const naiveTheme = computed(() => (appStore.themeMode === 'dark' ? darkTheme : undefined))

// 同步 data-theme，供自定义 CSS 变量切换
watchEffect(() => {
  document.documentElement.setAttribute('data-theme', appStore.themeMode)
})
</script>

<template>
  <NConfigProvider
    :theme="naiveTheme"
    :theme-overrides="themeOverrides"
    :locale="zhCN"
    class="app-provider"
  >
    <NGlobalStyle />
    <NLoadingBarProvider>
      <NDialogProvider>
        <NNotificationProvider>
          <NMessageProvider>
            <!-- 桥接层：必须在 MessageProvider 内部 -->
            <MessageBridge />
            <RouterView />
          </NMessageProvider>
        </NNotificationProvider>
      </NDialogProvider>
    </NLoadingBarProvider>
  </NConfigProvider>
</template>

<style scoped>
.app-provider {
  width: 100%;
  height: 100%;
}
</style>
