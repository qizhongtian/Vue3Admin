<script setup lang="ts">
/**
 * 统一图标组件
 *
 * 用法：
 *   <AppIcon name="Users" :size="18" />
 *   <AppIcon name="LayoutDashboard" />
 *
 * 传入未登记的图标名时会渲染兜底图标而不是空白。
 */
import { computed } from 'vue'
import { FallbackIcon, resolveIcon } from './icon-map'

const props = withDefaults(
  defineProps<{
    /** 图标名称，取自 iconMap */
    name: string
    /** 尺寸，单位 px */
    size?: number | string
    /** 描边宽度 */
    strokeWidth?: number | string
    /** 自定义类名 */
    className?: string
  }>(),
  {
    size: 18,
    strokeWidth: 2,
    className: '',
  },
)

const currentIcon = computed(() => resolveIcon(props.name))

/** 判断是否命中兜底图标，便于开发期排查配置错误 */
const isFallback = computed(() => currentIcon.value === FallbackIcon)
</script>

<template>
  <component
    :is="currentIcon"
    :size="Number(size) || 18"
    :stroke-width="Number(strokeWidth) || 2"
    :class="['app-icon', { 'app-icon--fallback': isFallback }, className]"
    aria-hidden="true"
  />
</template>

<style scoped lang="scss">
.app-icon {
  flex-shrink: 0;
  vertical-align: middle;
}

.app-icon--fallback {
  opacity: 0.5;
}
</style>
