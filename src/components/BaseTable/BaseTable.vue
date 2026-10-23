<script setup lang="ts" generic="T extends object">
/**
 * 通用表格
 *
 * 职责：统一「工具栏 + 数据 + 分页 + 空态 + 加载态」的组合方式。
 *
 * 数据获取不在组件内部进行 —— 由 usePagination 负责，它更清楚竞态、
 * 缓存与取消策略。组件只接收数据与分页状态，并通过事件把用户操作抛出去。
 *
 * 排序：remote 模式下把排序变化抛给父组件，由父组件决定是否并入查询条件。
 *
 * 泛型 T 只约束「父组件传入的行类型」，内部交给 NDataTable 时会做一次
 * 显式转换：Naive UI 的 RowData 是 Record<string, unknown>，而业务实体
 * 通常是 interface（没有隐式索引签名），两者结构上无法直接互相赋值。
 * 这个转换被收敛在组件内部，业务页面因此可以保持强类型。
 */
import { computed } from 'vue'
import { NDataTable, NPagination, NSpace, NButton, NEmpty } from 'naive-ui'
import type { DataTableColumns, DataTableRowKey, DataTableSortState } from 'naive-ui'
import { AppIcon } from '@/components/AppIcon'
import { PaginationDefaults } from '@/config/app'

/** NDataTable 内部使用的行类型 */
type RowData = Record<string, unknown>

const props = withDefaults(
  defineProps<{
    columns: DataTableColumns<T>
    data: T[]
    loading?: boolean
    page?: number
    pageSize?: number
    total?: number
    pageSizes?: readonly number[]
    /** 是否服务端分页/排序 */
    remote?: boolean
    /** 行唯一键 */
    rowKey?: string
    /** 是否显示分页器 */
    showPagination?: boolean
    /** 表格最大高度，超出后内部滚动 */
    maxHeight?: number | string
    size?: 'small' | 'medium' | 'large'
  }>(),
  {
    loading: false,
    page: 1,
    pageSize: PaginationDefaults.PAGE_SIZE,
    total: 0,
    pageSizes: () => PaginationDefaults.PAGE_SIZE_OPTIONS,
    remote: true,
    rowKey: 'id',
    showPagination: true,
    maxHeight: undefined,
    size: 'medium',
  },
)

const emit = defineEmits<{
  'update:page': [number]
  'update:pageSize': [number]
  'update:sorter': [DataTableSortState | null]
  refresh: []
}>()

/**
 * 交给 NDataTable 的列与数据。
 *
 * 唯一一处 `as unknown as`：把业务强类型转换为 Naive UI 的行类型。
 * 之所以安全：BaseTable 只做透传，不会读取任何具体字段；
 * 渲染逻辑全在父组件传入的 columns 里，类型已在父组件侧校验过。
 */
const tableColumns = computed(() => props.columns as unknown as DataTableColumns<RowData>)
const tableData = computed(() => props.data as unknown as RowData[])

/** Naive UI 分页所需的受控对象 */
const pagination = computed(() => ({
  page: props.page,
  pageSize: props.pageSize,
  itemCount: props.total,
  pageSizes: Array.from(props.pageSizes),
  showSizePicker: true,
  showQuickJumper: true,
  prefix: ({ itemCount }: { itemCount: number | undefined }) => `共 ${itemCount ?? 0} 条`,
}))

function handlePageChange(page: number): void {
  emit('update:page', page)
}

function handlePageSizeChange(size: number): void {
  emit('update:pageSize', size)
}

function handleSorterChange(sorter: DataTableSortState | null): void {
  emit('update:sorter', sorter)
}

function keyOfRow(row: T): DataTableRowKey {
  const raw = (row as Record<string, unknown>)[props.rowKey]
  return typeof raw === 'number' || typeof raw === 'string' ? raw : JSON.stringify(row)
}
</script>

<template>
  <div class="base-table">
    <div class="base-table__toolbar">
      <div class="base-table__toolbar-left">
        <slot name="toolbar-left" />
      </div>
      <NSpace align="center" :size="8">
        <slot name="toolbar-right" />
        <NButton quaternary size="small" :disabled="loading" title="刷新" @click="emit('refresh')">
          <template #icon>
            <AppIcon name="RefreshCw" />
          </template>
        </NButton>
      </NSpace>
    </div>

    <NDataTable
      :columns="tableColumns"
      :data="tableData"
      :loading="loading"
      :remote="remote"
      :row-key="keyOfRow"
      :size="size"
      :max-height="maxHeight"
      :pagination="false"
      scroll-x="max-content"
      @update:sorter="handleSorterChange"
    >
      <template #empty>
        <NEmpty :description="loading ? '加载中…' : '暂无数据'">
          <template #icon>
            <AppIcon name="FileSearch" :size="32" />
          </template>
          <template #extra>
            <slot name="empty-extra" />
          </template>
        </NEmpty>
      </template>
    </NDataTable>

    <div v-if="showPagination" class="base-table__footer">
      <NPagination
        :page="pagination.page"
        :page-size="pagination.pageSize"
        :item-count="pagination.itemCount"
        :page-sizes="pagination.pageSizes"
        show-size-picker
        show-quick-jumper
        :prefix="pagination.prefix"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/variables.scss' as v;
@use '@/assets/styles/mixins.scss' as m;

.base-table {
  display: flex;
  flex-direction: column;
  gap: v.$gap-md;

  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: v.$gap-sm;
    flex-wrap: wrap;
  }

  &__toolbar-left {
    display: flex;
    align-items: center;
    gap: v.$gap-sm;
  }

  &__footer {
    display: flex;
    justify-content: flex-end;

    @include m.respond-to('sm') {
      justify-content: center;
      overflow-x: auto;
    }
  }
}
</style>
