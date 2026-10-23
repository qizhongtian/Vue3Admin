<script setup lang="ts">
/**
 * 通用异常兜底页
 *
 * 有两类用途：
 *  1. 路由组件异步加载失败 / 运行时异常时的展示位；
 *  2. **动态路由的安全兜底**：后端菜单下发的 `component` 标识如果在前端
 *     `componentMap` 中不存在，`dynamic-routes.ts` 会降级渲染本组件，
 *     而不是把后端字符串直接喂给 `import()`（那等于让后端决定加载哪个模块）。
 *
 * 因此这里必须把「到底是哪个标识没注册」讲清楚，否则线上很难排查。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAlert, NButton, NDescriptions, NDescriptionsItem, NSpace } from 'naive-ui'
import { AppIcon } from '@/components/AppIcon'
import { listComponentKeys } from '@/router/dynamic-routes'

defineOptions({ name: 'ExceptionPage' })

const route = useRoute()
const router = useRouter()

/** dynamic-routes 会把后端下发的原始 component 标识透传到 meta.componentKey */
const rawComponent = computed(() => {
  const meta = route.meta as Record<string, unknown>
  return typeof meta.componentKey === 'string' ? meta.componentKey : ''
})

/** 模块动态导入失败时抛出的原始错误信息 */
const rawError = computed(() => {
  const meta = route.meta as Record<string, unknown>
  return typeof meta.errorMessage === 'string' ? meta.errorMessage : ''
})

const registeredKeys = computed(() => listComponentKeys())

function goHome(): void {
  void router.replace('/')
}

function reload(): void {
  window.location.reload()
}
</script>

<template>
  <div class="exception">
    <div class="exception__art" aria-hidden="true">
      <AppIcon name="OctagonAlert" :size="88" />
    </div>

    <h1 class="exception__title">页面组件加载失败</h1>

    <p v-if="rawComponent" class="exception__desc">
      后端菜单下发的页面标识
      <code class="exception__code">{{ rawComponent }}</code>
      在前端组件映射表中不存在。出于安全考虑，框架不会直接使用后端字符串去动态
      <code class="exception__code">import()</code>
      ，而是落到这里。
    </p>
    <p v-else class="exception__desc">
      目标页面组件在加载过程中出现异常。可能是发版导致资源缺失、网络中断，或路由配置有误。
    </p>

    <NAlert v-if="rawError" type="warning" :bordered="false" class="exception__alert">
      错误信息：{{ rawError }}
    </NAlert>

    <NDescriptions
      v-if="rawComponent"
      bordered
      :column="1"
      label-placement="left"
      class="exception__detail"
      title="排查建议"
    >
      <NDescriptionsItem label="当前路径">{{ route.fullPath }}</NDescriptionsItem>
      <NDescriptionsItem label="期望标识">{{ rawComponent }}</NDescriptionsItem>
      <NDescriptionsItem label="已注册标识">
        <code class="exception__code">{{ registeredKeys.join('、') }}</code>
      </NDescriptionsItem>
      <NDescriptionsItem label="处理方式">
        在
        <code class="exception__code">src/router/dynamic-routes.ts</code>
        的
        <code class="exception__code">componentMap</code>
        中补登记该标识，或修正后端菜单配置。
      </NDescriptionsItem>
    </NDescriptions>

    <NSpace justify="center" :size="12">
      <NButton type="primary" @click="goHome">
        <template #icon><AppIcon name="Home" /></template>
        返回首页
      </NButton>
      <NButton tertiary @click="reload">
        <template #icon><AppIcon name="RefreshCw" /></template>
        重新加载
      </NButton>
    </NSpace>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/variables.scss' as v;

.exception {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: v.$gap-xl v.$gap-md;
  min-height: 100%;

  &__art {
    color: var(--app-color-error);
  }

  &__title {
    margin: v.$gap-md 0 v.$gap-sm;
    font-size: v.$font-size-xl;
    color: var(--app-color-text);
  }

  &__desc {
    max-width: 720px;
    margin: 0 0 v.$gap-md;
    color: var(--app-color-text-secondary);
    line-height: 1.8;
    text-align: center;
  }

  &__alert {
    width: 100%;
    max-width: 720px;
    margin-bottom: v.$gap-md;
  }

  &__detail {
    width: 100%;
    max-width: 720px;
    margin-bottom: v.$gap-lg;
  }

  &__code {
    padding: 2px 6px;
    border-radius: v.$radius-sm;
    background: var(--app-color-hover);
    color: var(--app-color-text);
    font-size: v.$font-size-sm;
    word-break: break-all;
  }
}
</style>
