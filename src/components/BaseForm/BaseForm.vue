<script setup lang="ts">
/**
 * 通用表单
 *
 * 与 BaseSearch 共用同一套 FormField 描述。
 * 对外暴露 validate / restoreValidation，供 BaseDialog 的确认按钮调用。
 *
 * 之所以不在组件内部直接提交：
 * 「提交」涉及具体业务的接口与后续刷新动作，交给页面编排更清晰，
 * 组件只负责渲染与校验，避免组件反过来依赖 api 层。
 */
import { ref } from 'vue'
import { NForm, NFormItem, NGrid, NGi, NInput, NSelect, NSwitch, NInputNumber } from 'naive-ui'
import type { FormField } from '@/types/form'

const props = withDefaults(
  defineProps<{
    fields: FormField[]
    modelValue: Record<string, unknown>
    labelWidth?: number
    /** 每行列数 */
    cols?: number
    disabled?: boolean
  }>(),
  {
    labelWidth: 90,
    cols: 1,
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [Record<string, unknown>]
}>()

const formRef = ref<InstanceType<typeof NForm> | null>(null)

function updateField(key: string, value: unknown): void {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

/** 创建 Naive UI 校验规则 */
function buildRules(field: FormField) {
  const rules: Array<{ required: boolean; message: string; trigger: string[] }> = []
  if (field.required) {
    rules.push({
      required: true,
      message: `${field.label}不能为空`,
      trigger: ['blur', 'change'],
    })
  }
  return [
    ...rules,
    ...((field.rules ?? []) as Array<{
      required: boolean
      message: string
      trigger: string[]
    }>),
  ]
}

/**
 * 触发校验。
 *
 * NForm.validate() 的返回值是 { warnings }，而页面只关心「是否通过」，
 * 因此统一收敛为 Promise<void>：校验不通过时 reject，通过时 resolve。
 */
async function validate(): Promise<void> {
  if (!formRef.value) return
  await formRef.value.validate()
}

/** 清除校验状态 */
function restoreValidation(): void {
  formRef.value?.restoreValidation()
}

defineExpose({ validate, restoreValidation, formRef })
</script>

<template>
  <NForm
    ref="formRef"
    :model="modelValue"
    :label-width="labelWidth"
    label-placement="left"
    require-mark-placement="right-hanging"
  >
    <NGrid :x-gap="16" :y-gap="0" :cols="cols">
      <NGi
        v-for="field in fields"
        :key="field.key"
        :span="field.fullRow ? cols : (field.span ?? cols)"
      >
        <NFormItem :label="field.label" :path="field.key" :rule="buildRules(field)[0]">
          <NSelect
            v-if="field.widget === 'select'"
            :value="(modelValue[field.key] as string | number | null) ?? null"
            :options="field.options ?? []"
            :placeholder="field.placeholder ?? `请选择${field.label}`"
            :disabled="disabled || field.disabled"
            clearable
            @update:value="(value) => updateField(field.key, value)"
          />
          <NSwitch
            v-else-if="field.widget === 'switch'"
            :value="Boolean(modelValue[field.key])"
            :disabled="disabled || field.disabled"
            @update:value="(value) => updateField(field.key, value)"
          />
          <NInputNumber
            v-else-if="field.widget === 'number'"
            :value="(modelValue[field.key] as number | null) ?? null"
            :placeholder="field.placeholder ?? `请输入${field.label}`"
            :disabled="disabled || field.disabled"
            style="width: 100%"
            @update:value="(value) => updateField(field.key, value)"
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
            :disabled="disabled || field.disabled"
            clearable
            @update:value="(value) => updateField(field.key, value)"
          />
        </NFormItem>
      </NGi>
    </NGrid>
  </NForm>
</template>
