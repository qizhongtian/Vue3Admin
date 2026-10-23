<script setup lang="ts">
/**
 * 后台主布局
 *
 * 结构：侧边栏 + （顶栏 + 标签页 + 内容区）
 *
 * 响应式策略：
 *  - 宽度小于移动端断点时，侧边栏改为抽屉形态，内容区占满屏宽；
 *  - 断点值集中在 LayoutConfig 维护，避免散落魔法数字。
 *
 * 页面缓存：
 *  - router-view 的 key 由「路径 + 刷新序号」组成，支持标签页手动刷新；
 *  - keep-alive 的 include 取自 tags store，只有声明了 keepAlive 的页面才缓存。
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, RouterView } from 'vue-router'
import { NDrawer, NDrawerContent, NLayout, NLayoutContent, NLayoutSider } from 'naive-ui'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import TagsView from '@/components/layout/TagsView.vue'
import { LayoutConfig } from '@/config/app'
import { useAppStore } from '@/stores/app'
import { useTagsViewStore } from '@/stores/tags-view'

const appStore = useAppStore()
const tagsStore = useTagsViewStore()
const route = useRoute()

/** 统一的出现置顶key：路径变化或手动刷新都会重建组件 */
const contentKey = computed(() => `${route.fullPath}-${tagsStore.refreshSeq}`)

function syncViewport(): void {
  if (typeof window === 'undefined') {
    return
  }
  appStore.setIsMobile(window.innerWidth < LayoutConfig.MOBILE_BREAKPOINT)
}

onMounted(() => {
  syncViewport()
  window.addEventListener('resize', syncViewport, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewport)
})
</script>

<template>
  <NLayout class="basic-layout" has-sider>
    <!-- 桌面端：常驻侧边栏 -->
    <NLayoutSider
      v-if="!appStore.isMobile"
      class="basic-layout__sider"
      show-trigger="arrow-circle"
      bordered
      collapse-mode="width"
      :collapsed="appStore.collapsed"
      :collapsed-width="LayoutConfig.SIDEBAR_COLLAPSED_WIDTH"
      :width="LayoutConfig.SIDEBAR_WIDTH"
      @update:collapsed="appStore.setCollapsed($event)"
    >
      <div class="basic-layout__logo">
        <AppIcon name="Globe" :size="22" />
        <span v-show="!appStore.collapsed" class="basic-layout__title">企业后台</span>
      </div>
      <AppSidebar />
    </NLayoutSider>

    <!-- 移动端：抽屉形态 -->
    <NDrawer
      v-else
      v-model:show="appStore.drawerVisible"
      :width="LayoutConfig.SIDEBAR_WIDTH"
      placement="left"
    >
      <NDrawerContent title="导航菜单" :native-scrollbar="false">
        <AppSidebar />
      </NDrawerContent>
    </NDrawer>

    <NLayout class="basic-layout__main">
      <AppHeader />
      <TagsView v-if="appStore.showTagsView" />

      <NLayoutContent
        class="basic-layout__content"
        :class="{ 'basic-layout__content--with-tags': appStore.showTagsView }"
        :native-scrollbar="false"
        content-style="padding: 16px;"
      >
        <RouterView v-slot="{ Component }">
          <template v-if="Component">
            <KeepAlive :include="tagsStore.cachedViews">
              <component :is="Component" :key="contentKey" />
            </KeepAlive>
          </template>
        </RouterView>
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>

<style scoped lang="scss">
@use '@/assets/styles/variables.scss' as *;
@use '@/assets/styles/mixins.scss' as *;

.basic-layout {
  height: 100vh;

  &__sider {
    background: var(--app-sidebar-background);
  }

  &__logo {
    display: flex;
    gap: $gap-sm;
    align-items: center;
    height: $header-height;
    padding: 0 $gap-md;
    overflow: hidden;
    color: var(--app-color-primary);
    border-bottom: 1px solid var(--app-color-border);
  }

  &__title {
    font-size: $font-size-lg;
    font-weight: 600;
    white-space: nowrap;

    @include text-ellipsis;
  }

  &__main {
    height: 100vh;
    background: var(--app-color-background);
  }

  &__content {
    // 顶栏固定高度；标签栏可开关，关闭时不需要预留其高度
    height: calc(100vh - #{$header-height});
    background: var(--app-color-background);
  }

  &__content--with-tags {
    height: calc(100vh - #{$header-height} - #{$tags-view-height});
  }
}
</style>
