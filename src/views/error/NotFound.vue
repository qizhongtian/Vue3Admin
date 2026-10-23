<script setup lang="ts">
/**
 * 404 页面不存在
 *
 * 路由表里有一条兜底记录 `/:pathMatch(.*)*` 指向本页。
 * 常见触发原因：
 *  - 手输了错误地址；
 *  - 动态路由尚未注册完成就被访问（此时应优先排查守卫里的 await initPermission）；
 *  - 后端下发了前端 componentMap 里不存在的 component 标识（会被降级到 Exception 页）。
 */
import { useRoute, useRouter } from 'vue-router'
import { computed } from 'vue'
import { NButton, NSpace } from 'naive-ui'
import { AppIcon } from '@/components/AppIcon'

defineOptions({ name: 'NotFoundPage' })

const router = useRouter()
const route = useRoute()

/** 回显用户实际访问的路径，便于反馈与排查 */
const attemptedPath = computed(() => String(route.fullPath ?? ''))

function goHome(): void {
  void router.replace('/')
}

function goBack(): void {
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1
  if (canGoBack) {
    router.back()
  } else {
    void router.replace('/')
  }
}
</script>

<template>
  <div class="not-found">
    <div class="not-found__art" aria-hidden="true">
      <AppIcon name="Compass" :size="96" />
    </div>

    <h1 class="not-found__code">404</h1>
    <p class="not-found__title">页面走丢了</p>
    <p class="not-found__desc">
      没有匹配到路由
      <code v-if="attemptedPath" class="not-found__path">{{ attemptedPath }}</code>
      。它可能已被移除、重命名，或你暂时没有访问权限。
    </p>

    <NSpace justify="center" :size="12">
      <NButton type="primary" @click="goHome">
        <template #icon><AppIcon name="Home" /></template>
        返回首页
      </NButton>
      <NButton tertiary @click="goBack">
        <template #icon><AppIcon name="ArrowLeft" /></template>
        返回上一页
      </NButton>
    </NSpace>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/variables.scss' as v;
@use '@/assets/styles/mixins.scss' as m;

.not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: v.$gap-xl v.$gap-md;
  text-align: center;

  &__art {
    color: var(--app-color-info);
    opacity: 0.9;
  }

  &__code {
    margin: v.$gap-md 0 v.$gap-sm;
    font-size: 56px;
    font-weight: 700;
    line-height: 1;
    color: var(--app-color-text);
  }

  &__title {
    margin: 0 0 v.$gap-sm;
    font-size: v.$font-size-lg;
    color: var(--app-color-text);
  }

  &__desc {
    max-width: 560px;
    margin: 0 0 v.$gap-lg;
    color: var(--app-color-text-secondary);
    line-height: 1.7;
  }

  &__path {
    padding: 2px 6px;
    border-radius: v.$radius-sm;
    background: var(--app-color-hover);
    color: var(--app-color-text);
    font-size: v.$font-size-sm;
    word-break: break-all;
  }

  @include m.respond-to('sm') {
    &__code {
      font-size: 44px;
    }
  }
}
</style>
