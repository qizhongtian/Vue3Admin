<script setup lang="ts">
/**
 * 消息桥接组件
 *
 * 作用：把 Naive UI 的 message API 注册到框架的「通知总线」上。
 *
 * 为什么要单独一个组件：
 * `useMessage()` 必须在 `<n-message-provider>` 的内部调用，
 * 而通知总线的注册又需要拿到这个 API，因此在 provider 内部放一个空渲染组件来桥接。
 * 这样 `src/utils/http.ts` 在报错时就能发出提示，且完全不依赖 UI 组件库。
 */
import { onBeforeUnmount } from 'vue'
import { useMessage } from 'naive-ui'
import { clearNotifier, setNotifier } from '@/utils/notify'
import { NotifyDurations } from '@/config/app'

const message = useMessage()

const DURATION_MAP = {
  success: NotifyDurations.SUCCESS,
  warning: NotifyDurations.WARNING,
  error: NotifyDurations.ERROR,
  info: NotifyDurations.WARNING,
} as const

setNotifier((payload) => {
  const duration = payload.duration ?? DURATION_MAP[payload.type]
  message[payload.type](payload.content, { duration })
})

onBeforeUnmount(() => {
  clearNotifier()
})
</script>

<template>
  <!-- 不渲染任何可见内容 -->
  <span class="message-bridge" />
</template>

<style scoped>
.message-bridge {
  display: none;
}
</style>
