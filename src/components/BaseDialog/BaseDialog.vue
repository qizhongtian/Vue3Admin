<script setup lang="ts">
/**
 * 通用对话框
 *
 * 统一了确认/取消、加载态与关闭行为，避免各页面各写一套。
 *
 * 注意存在 `preset="dialog"` 与非 card 两种形态：
 * 这里使用 card 形态，便于自定义标题区与底部按钮插槽。
 */
import { computed } from 'vue'
import { NButton, NModal, NSpace, NSpin } from 'naive-ui'
import { AppIcon } from '@/components/AppIcon'

const props = withDefaults(
  defineProps<{
    /** 是否显示（支持 v-model:show） */
    show: boolean
    title?: string
    width?: number | string
    /** 确认按钮文案，传空字符串可隐藏 */
    positiveText?: string
    negativeText?: string
    /** 确认按钮 loading */
    loading?: boolean
    /** 点击遮罩是否关闭 */
    maskClosable?: boolean
    /** 是否显示关闭图标 */
    closable?: boolean
    /** 内容区是否在 loading */
    contentLoading?: boolean
  }>(),
  {
    title: '',
    width: 560,
    positiveText: '确定',
    negativeText: '取消',
    loading: false,
    maskClosable: false,
    closable: true,
    contentLoading: false,
  },
)

const emit = defineEmits<{
  'update:show': [boolean]
  confirm: []
  cancel: []
  afterLeave: []
}>()

const internalShow = computed({
  get: () => props.show,
  set: (value: boolean) => emit('update:show', value),
})

function handleConfirm(): void {
  emit('confirm')
}

function handleCancel(): void {
  emit('cancel')
  internalShow.value = false
}

function handleMaskClick(): void {
  if (props.maskClosable && !props.loading) {
    handleCancel()
  }
}
</script>

<template>
  <NModal
    v-model:show="internalShow"
    :mask-closable="false"
    :closable="false"
    preset="card"
    :style="{ width: typeof width === 'number' ? `${width}px` : width }"
    transform-origin="center"
    @mask-click="handleMaskClick"
    @after-leave="emit('afterLeave')"
  >
    <template #header>
      <div class="base-dialog__header">
        <span class="base-dialog__title">{{ title }}</span>
        <NButton v-if="closable" quaternary size="small" circle @click="handleCancel">
          <template #icon>
            <AppIcon name="X" />
          </template>
        </NButton>
      </div>
    </template>

    <NSpin :show="contentLoading">
      <div class="base-dialog__body">
        <slot />
      </div>
    </NSpin>

    <template #footer>
      <NSpace justify="end" :size="8">
        <slot name="footer-extra" />
        <NButton tertiary :disabled="loading" @click="handleCancel">
          {{ negativeText }}
        </NButton>
        <NButton v-if="positiveText" type="primary" :loading="loading" @click="handleConfirm">
          {{ positiveText }}
        </NButton>
      </NSpace>
    </template>
  </NModal>
</template>

<style scoped lang="scss">
@use '@/assets/styles/variables.scss' as v;

.base-dialog {
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: v.$gap-sm;
  }

  &__title {
    font-size: v.$font-size-lg;
    font-weight: 600;
  }

  &__body {
    max-height: 65vh;
    overflow-y: auto;
  }
}
</style>
