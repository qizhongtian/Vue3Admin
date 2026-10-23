<script setup lang="ts">
/**
 * 通用搜索 / 筛选组件
 *
 * 设计取舍：
 *  - 用 CSS Grid 而不是 n-grid 的固定 cols：
 *    自适应列数对宽屏、平板、移动端都更友好，也不需要在父页面里算断点；
 *  - 字段描述复用于 BaseForm，避免「筛选」和「表单」各写一套；
 *  - 搜索与重置都通过事件外抛，具体是否触发查询由父组件(通常是 usePagination)决定。
 */
import { computed, ref } from 'vue'
import { NButton, NForm, NFormItem, NInput, NSelect, NSpace, NSwitch, NInputNumber } from 'naive-ui'
import { AppIcon } from '@/components/AppIcon'
import type { FormField } from '@/types/form'

type FormModel = Record<string, unknown>

const props = withDefaults(
  defineProps<{
    /** 字段描述 */
    fields: FormField[]
    /** 表单数据（支持 v-model） */
    modelValue: FormModel
    /** 查询按钮 loading */
    loading?: boolean
    /** 标签宽度 */
    labelWidth?: number
    /** 单列最小宽度，决定自适应列数 */
    minColumnWidth?: number
    /** 是否显示重置按钮 */
    showReset?: boolean
  }>(),
  {
    loading: false,
    labelWidth: 80,
    minColumnWidth: 260,
    showReset: true,
  },
)

const emit = defineEmits<{
  'update:modelValue': [FormModel]
  search: [FormModel]
  reset: []
}>()

const formRef = ref<InstanceType<typeof NForm> | null>(null)

/** 内部值变更同步给父组件 */
function updateField(key: string, value: unknown): void {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function handleSearch(): void {
  emit('search', { ...props.modelValue })
}

function handleReset(): void {
  emit('reset')
}

/** 折叠/展开：字段较多时避免首屏被筛选区占满 */
const collapsed = ref(false)
const visibleFields = computed(() => (collapsed.value ? props.fields.slice(0, 2) : props.fields))
const hasCollapse = computed(() => props.fields.length > 2)

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(auto-fill, minmax(${props.minColumnWidth}px, 1fr))`,
}))

defineExpose({ formRef })
</script>

<template>
  <div class="base-search">
    <NForm
      ref="formRef"
      :model="modelValue"
      :label-width="labelWidth"
      label-placement="left"
      @submit.prevent="handleSearch"
    >
      <div class="base-search__grid" :style="gridStyle">
        <NFormItem
          v-for="field in visibleFields"
          :key="field.key"
          :label="field.label"
          :path="field.key"
          class="base-search__item"
        >
          <NSelect
            v-if="field.widget === 'select'"
            :value="modelValue[field.key] as string | number | null"
            :options="field.options ?? []"
            :placeholder="field.placeholder ?? `请选择${field.label}`"
            :disabled="field.disabled"
            clearable
            @update:value="(v) => updateField(field.key, v)"
          />
          <NSwitch
            v-else-if="field.widget === 'switch'"
            :value="Boolean(modelValue[field.key])"
            :disabled="field.disabled"
            @update:value="(v) => updateField(field.key, v)"
          />
          <NInputNumber
            v-else-if="field.widget === 'number'"
            :value="(modelValue[field.key] as number | null) ?? null"
            :placeholder="field.placeholder ?? `请输入${field.label}`"
            :disabled="field.disabled"
            clearable
            style="width: 100%"
            @update:value="(v) => updateField(field.key, v)"
          />
          <NInput
            v-else
            :value="String(modelValue[field.key] ?? '')"
            :type="
              field.widget === 'password'
                ? 'password'
                : field.widget === 'textarea'
                  ? 'textarea'
                  : 'text'
            "
            :placeholder="field.placeholder ?? `请输入${field.label}`"
            :disabled="field.disabled"
            clearable
            @update:value="(v) => updateField(field.key, v)"
          />
        </NFormItem>
      </div>

      <div class="base-search__actions">
        <NSpace align="center" :size="8">
          <NButton type="primary" :loading="loading" @click="handleSearch">
            <template #icon>
              <AppIcon name="Search" />
            </template>
            搜索
          </NButton>
          <NButton v-if="showReset" tertiary @click="handleReset">
            <template #icon>
              <AppIcon name="RotateCcw" />
            </template>
            重置
          </NButton>
          <NButton v-if="hasCollapse" quaternary @click="collapsed = !collapsed">
            <template #icon>
              <AppIcon name="ChevronDown" :class="{ 'base-search__collapse-icon': !collapsed }" />
            </template>
            {{ collapsed ? '展开' : '收起' }}
          </NButton>
          <slot name="actions" />
        </NSpace>
      </div>
    </NForm>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/variables.scss' as v;
@use '@/assets/styles/mixins.scss' as m;

.base-search {
  @include m.panel;

  &__grid {
    display: grid;
    gap: 0 v.$gap-md;
  }

  &__item {
    min-width: 0;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    margin-top: v.$gap-sm;
  }

  &__collapse-icon {
    transform: rotate(180deg);
    transition: transform v.$transition-fast;
  }
}
</style>
