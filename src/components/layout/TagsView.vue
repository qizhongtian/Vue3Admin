<script setup lang="ts">
/**
 * 标签页栏
 *
 * 设计要点：
 *  - 只渲染 store 中的元信息快照，不涉及组件实例；
 *  - 首页（affix）不可关闭；
 *  - 关闭当前标签后自动跳转到相邻标签，避免停在空白页。
 *
 * 关于右键菜单：
 *  Naive UI 的 NDropdown 只支持 hover / click / focus / manual 四种触发方式，
 *  **没有** contextmenu 触发。这里用 manual + 手动计算坐标实现右键菜单，
 *  这也是官方推荐的右键菜单做法（同时避免了给每个标签都挂一个弹层实例）。
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NTag, NDropdown } from 'naive-ui'
import type { DropdownOption } from 'naive-ui'
import { AppIcon } from '@/components/AppIcon'
import { useTagsViewStore, type TagView } from '@/stores/tags-view'

const tagsStore = useTagsViewStore()
const route = useRoute()
const router = useRouter()

const activePath = computed(() => route.path)

/** ---------- 右键菜单状态 ---------- */
const contextTag = ref<TagView | null>(null)
const menuVisible = ref(false)
const menuX = ref(0)
const menuY = ref(0)

function openContextMenu(event: MouseEvent, tag: TagView): void {
  menuX.value = event.clientX
  menuY.value = event.clientY
  contextTag.value = tag
  menuVisible.value = true
}

function closeContextMenu(): void {
  menuVisible.value = false
}

/** 当前右键命中的标签在列表中的位置，用于禁用无效的批量关闭项 */
const contextIndex = computed(() =>
  contextTag.value
    ? tagsStore.visitedViews.findIndex((item) => item.path === contextTag.value?.path)
    : -1,
)

/** 构建下拉菜单选项（随右键命中的标签变化） */
const menuOptions = computed<DropdownOption[]>(() => {
  const tag = contextTag.value
  const isAffix = tag?.affix === true
  const isFirst = contextIndex.value <= 0
  const isLast = contextIndex.value === tagsStore.visitedViews.length - 1

  return [
    { key: 'refresh', label: '刷新' },
    { key: 'close', label: '关闭', disabled: isAffix },
    { key: 'divider1', type: 'divider' },
    { key: 'closeLeft', label: '关闭左侧', disabled: isFirst || isAffix },
    { key: 'closeRight', label: '关闭右侧', disabled: isLast || isAffix },
    { key: 'divider2', type: 'divider' },
    { key: 'closeOthers', label: '关闭其它', disabled: isAffix },
    { key: 'closeAll', label: '全部关闭' },
  ]
})

async function navigateTo(tag: TagView | null): Promise<void> {
  if (tag) {
    await router.push(tag.fullPath)
    return
  }
  await router.push('/dashboard')
}

async function handleSelect(key: string): Promise<void> {
  const tag = contextTag.value
  menuVisible.value = false
  if (!tag) return

  switch (key) {
    case 'refresh':
      /**
       * 刷新本质上是「让页面组件重新挂载」。
       * 这里通过递增 tags store 里的序号，让 BasicLayout 的 router-view key 变化，
       * 从而强制销毁并重建组件；比 replace 到临时路径再跳回来干净得多。
       */
      tagsStore.incrementRefresh()
      break
    case 'close': {
      const neighbor = tagsStore.closeView(tag)
      if (tag.path === activePath.value) {
        await navigateTo(neighbor)
      }
      break
    }
    case 'closeLeft':
      tagsStore.closeLeftViews(tag)
      break
    case 'closeRight':
      tagsStore.closeRightViews(tag)
      break
    case 'closeOthers':
      tagsStore.closeOtherViews(tag)
      await navigateTo(tag)
      break
    case 'closeAll':
      tagsStore.closeAllViews()
      await navigateTo(null)
      break
    default:
      break
  }
}

async function handleClick(tag: TagView): Promise<void> {
  if (tag.path !== activePath.value) {
    await router.push(tag.fullPath)
  }
}

async function handleClose(event: MouseEvent, tag: TagView): Promise<void> {
  event.stopPropagation()
  const neighbor = tagsStore.closeView(tag)
  if (tag.path === activePath.value) {
    await navigateTo(neighbor)
  }
}
</script>

<template>
  <div class="tags-view">
    <NTag
      v-for="tag in tagsStore.visitedViews"
      :key="tag.path"
      class="tags-view__item"
      :type="tag.path === activePath ? 'primary' : 'default'"
      :bordered="false"
      size="small"
      @click="handleClick(tag)"
      @contextmenu.prevent="openContextMenu($event, tag)"
    >
      <span class="tags-view__title">
        <AppIcon v-if="tag.icon" :name="tag.icon" :size="13" />
        {{ tag.title }}
      </span>
      <button
        v-if="!tag.affix"
        class="tags-view__close"
        type="button"
        aria-label="关闭标签页"
        @click="handleClose($event, tag)"
      >
        <AppIcon name="X" :size="12" />
      </button>
    </NTag>

    <!--
      共用一个 manual 触发的下拉：右键时记录坐标再显示，
      既实现了 contextmenu 交互，也避免为每个标签创建弹层。
    -->
    <NDropdown
      trigger="manual"
      placement="bottom-start"
      :show="menuVisible"
      :x="menuX"
      :y="menuY"
      :options="menuOptions"
      @select="handleSelect"
      @clickoutside="closeContextMenu"
    />
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/variables.scss' as v;
@use '@/assets/styles/mixins.scss' as m;

.tags-view {
  display: flex;
  gap: v.$gap-xs;
  align-items: center;
  height: v.$tags-view-height;
  padding: 0 v.$gap-md;
  overflow-x: auto;
  background: var(--app-color-surface);
  border-bottom: 1px solid var(--app-color-border);

  @include m.hide-scrollbar;

  &__item {
    cursor: pointer;
    user-select: none;
  }

  &__title {
    display: inline-flex;
    gap: v.$gap-xs;
    align-items: center;
  }

  &__close {
    display: inline-flex;
    align-items: center;
    padding: 0;
    margin-left: v.$gap-xs;
    color: inherit;
    cursor: pointer;
    background: transparent;
    border: none;
    border-radius: 50%;
    opacity: 0.6;

    &:hover {
      opacity: 1;
    }
  }
}
</style>
