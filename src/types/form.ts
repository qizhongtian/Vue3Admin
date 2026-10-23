/**
 * 表单配置通用类型
 *
 * 被 BaseSearch 与 BaseForm 共用，保证「筛选表单」与「新增/编辑表单」
 * 使用同一套字段描述，避免重复实现。
 */

/** 表单控件类型 */
export type FieldWidget =
  'input' | 'password' | 'textarea' | 'select' | 'switch' | 'number' | 'date'

/**
 * 下拉选项
 *
 * 说明两点：
 * 1. value 只允许 string | number —— 布尔值请用 switch 控件，
 *    Naive UI 的 SelectBaseOption 也把 value 限定为 string | number。
 * 2. 这里刻意用 type 而非 interface：
 *    type 会获得「隐式索引签名」，可以直接赋给带 `[k: string]: unknown`
 *    的 SelectOption；interface 不会，赋值时会报 index signature 缺失。
 */
export type FieldOption = {
  label: string
  value: string | number
  disabled?: boolean
}

/** 单个字段描述 */
export interface FormField {
  /** 绑定到表单对象的键 */
  key: string
  /** 标签文案 */
  label: string
  /** 控件类型，默认 input */
  widget?: FieldWidget
  /** 占位符 */
  placeholder?: string
  /** 下拉选项，widget 为 select 时必填 */
  options?: FieldOption[]
  /** 是否必填 */
  required?: boolean
  /** 自定义校验规则 */
  rules?: unknown[]
  /** 栅格占比（Naive UI gi 取值，1-24） */
  span?: number
  /** 是否禁用 */
  disabled?: boolean
  /** 是否独占一行（常用于 textarea） */
  fullRow?: boolean
  /** 帮助文案 */
  tip?: string
}
