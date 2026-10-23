<script setup lang="ts">
/**
 * 角色管理页
 *
 * 与用户管理页的分工差异（刻意保留，用来演示同一套能力的两种编排方式）：
 *  - 这里额外演示了**多选权限勾选**，因为 FormField 目前不支持 checkbox 控件，
 *    所以把「基础字段」交给 BaseForm、「权限勾选」单独渲染，
 *    而不是为了一个特殊控件去给 FormField 增加类型分支；
 *  - 删除内置角色会被后端拒绝（mock 返回 403），页面据此给出明确提示，
 *    用来演示「业务码为 403 的错误」与「HTTP 403」走的是同一套错误出口；
 *  - 按钮权限使用 `system:role:*` 系列，用 editor 账号登录即可看到按钮被隐藏，
 *    从而验证「菜单级 / 页面级 / 按钮级」三层权限是相互独立的。
 */
import { computed, h, ref } from 'vue'
import { NAlert, NButton, NCheckbox, NDivider, NSpace, NTag, NTooltip, useDialog } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import BaseSearch from '@/components/BaseSearch/BaseSearch.vue'
import BaseTable from '@/components/BaseTable/BaseTable.vue'
import BaseDialog from '@/components/BaseDialog/BaseDialog.vue'
import BaseForm from '@/components/BaseForm/BaseForm.vue'
import { AppIcon } from '@/components/AppIcon'
import { usePagination } from '@/composables/usePagination'
import { usePermission } from '@/composables/usePermission'
import { createRole, deleteRole, fetchRolePage, updateRole } from '@/api/role'
import type {
  CreateRoleParams,
  QueryRoleParams,
  SystemRole,
  UpdateRoleParams,
} from '@/types/entity'
import type { FormField } from '@/types/form'
import { PaginationDefaults, PERMISSION_OPTIONS, PermissionCode } from '@/config/app'
import { ApiError } from '@/utils/http-error'
import { notifyError, notifySuccess } from '@/utils/notify'

defineOptions({ name: 'SystemRolePage' })

/** searchParams 只需要过滤字段，分页字段由 usePagination 注入 */
type RoleSearchParams = Omit<QueryRoleParams, 'pageNum' | 'pageSize'>

const dialogApi = useDialog()
const { hasPermission } = usePermission()

/** ---------- 分页查询 ---------- */
const pagination = usePagination<SystemRole, RoleSearchParams>(fetchRolePage, {
  immediate: true,
  defaultPageSize: PaginationDefaults.PAGE_SIZE,
  defaultSearchParams: { keyword: '', status: '' },
  cacheKey: 'system-role',
})

const {
  data,
  loading,
  error,
  pageNum,
  pageSize,
  total,
  searchParams,
  search,
  reset,
  handlePageChange,
  handlePageSizeChange,
  onCreateSuccess,
  onUpdateSuccess,
  onDeleteSuccess,
  refresh,
} = pagination

/** ---------- 搜索表单 ---------- */
const searchFields: FormField[] = [
  { key: 'keyword', label: '关键词', placeholder: '支持角色标识 / 名称' },
  {
    key: 'status',
    label: '状态',
    widget: 'select',
    options: [
      { label: '启用', value: 'enabled' },
      { label: '禁用', value: 'disabled' },
    ],
  },
]

/** ---------- 新增 / 编辑 ---------- */
type RoleFormModel = Record<string, unknown>

const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const submitting = ref(false)
const editingId = ref<number | null>(null)
const editingCode = ref('')
const permissions = ref<string[]>([])
const formRef = ref<InstanceType<typeof BaseForm> | null>(null)

const formFields = computed<FormField[]>(() => [
  {
    key: 'code',
    label: '角色标识',
    required: true,
    disabled: dialogMode.value === 'edit',
    placeholder: '英文标识，创建后不可修改',
  },
  { key: 'name', label: '角色名称', required: true },
  {
    key: 'status',
    label: '状态',
    widget: 'select',
    required: true,
    options: [
      { label: '启用', value: 'enabled' },
      { label: '禁用', value: 'disabled' },
    ],
  },
  { key: 'sort', label: '排序', widget: 'number' },
  {
    key: 'description',
    label: '描述',
    widget: 'textarea',
    fullRow: true,
    placeholder: '一句话说明这个角色的职责范围',
  },
])

const formModel = ref<RoleFormModel>({
  code: '',
  name: '',
  status: 'enabled',
  sort: 10,
  description: '',
})

const canEdit = computed(() => hasPermission(PermissionCode.ROLE_UPDATE))
const canDelete = computed(() => hasPermission(PermissionCode.ROLE_DELETE))

function openCreate(): void {
  dialogMode.value = 'create'
  editingId.value = null
  editingCode.value = ''
  formModel.value = { code: '', name: '', status: 'enabled', sort: 10, description: '' }
  permissions.value = []
  formRef.value?.restoreValidation()
  dialogVisible.value = true
}

function openEdit(row: SystemRole): void {
  dialogMode.value = 'edit'
  editingId.value = row.id
  editingCode.value = row.code
  formModel.value = {
    code: row.code,
    name: row.name,
    status: row.status,
    sort: row.sort,
    description: row.description,
  }
  permissions.value = [...row.permissions]
  formRef.value?.restoreValidation()
  dialogVisible.value = true
}

/** 内置管理员角色的权限不允许取消勾选 —— 演示前端 UX 层的最小保护 */
const isBuiltinAdmin = computed(() => editingCode.value === 'admin')

function togglePermission(code: string, checked: boolean): void {
  if (checked) {
    permissions.value = Array.from(new Set([...permissions.value, code]))
  } else {
    permissions.value = permissions.value.filter((item) => item !== code)
  }
}

async function submitRole(): Promise<void> {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    if (dialogMode.value === 'create') {
      const params: CreateRoleParams = {
        code: String(formModel.value.code ?? '').trim(),
        name: String(formModel.value.name ?? '').trim(),
        description: String(formModel.value.description ?? ''),
        status: formModel.value.status === 'disabled' ? 'disabled' : 'enabled',
        sort: Number(formModel.value.sort ?? 10),
        permissions: [...permissions.value],
      }
      await createRole(params)
      notifySuccess('角色创建成功')
      dialogVisible.value = false
      await onCreateSuccess()
    } else {
      const id = editingId.value
      if (id === null) {
        return
      }
      const params: UpdateRoleParams = {
        id,
        name: String(formModel.value.name ?? '').trim(),
        description: String(formModel.value.description ?? ''),
        status: formModel.value.status === 'disabled' ? 'disabled' : 'enabled',
        sort: Number(formModel.value.sort ?? 10),
        permissions: [...permissions.value],
      }
      await updateRole(params)
      notifySuccess('角色已更新')
      dialogVisible.value = false
      await onUpdateSuccess()
    }
  } catch (rawError) {
    notifyError(rawError instanceof ApiError ? rawError.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

/** ---------- 删除 ---------- */
function handleDelete(row: SystemRole): void {
  dialogApi.warning({
    title: '删除确认',
    content: `确定要删除角色「${row.name}」吗？已关联该角色的账号将失去对应权限。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteRole(row.id)
        notifySuccess('删除成功')
        await onDeleteSuccess(1)
      } catch (rawError) {
        notifyError(rawError instanceof ApiError ? rawError.message : '删除失败')
      }
    },
  })
}

/** ---------- 表格列 ---------- */
const columns = computed<DataTableColumns<SystemRole>>(() => [
  { title: 'ID', key: 'id', width: 70 },
  {
    title: '角色标识',
    key: 'code',
    minWidth: 130,
    render: (row) =>
      h(
        NSpace,
        { size: 6, align: 'center' },
        {
          default: () => [h(AppIcon, { name: 'KeyRound', size: 14 }), h('span', null, row.code)],
        },
      ),
  },
  { title: '角色名称', key: 'name', minWidth: 130 },
  {
    title: '描述',
    key: 'description',
    minWidth: 220,
    ellipsis: { tooltip: true },
  },
  {
    title: '权限数',
    key: 'permissionCount',
    width: 100,
    render: (row) =>
      h(
        NTooltip,
        {},
        {
          trigger: () =>
            h(
              NTag,
              { size: 'small', bordered: false, type: 'info' },
              {
                default: () => String(row.permissions.length),
              },
            ),
          default: () => row.permissions.join('、') || '暂无权限',
        },
      ),
  },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (row) =>
      h(
        NTag,
        { size: 'small', bordered: false, type: row.status === 'enabled' ? 'success' : 'error' },
        { default: () => (row.status === 'enabled' ? '启用' : '禁用') },
      ),
  },
  { title: '排序', key: 'sort', width: 80 },
  { title: '创建时间', key: 'createdAt', minWidth: 160 },
  {
    title: '操作',
    key: 'actions',
    width: 150,
    fixed: 'right',
    render: (row) =>
      h(
        NSpace,
        { size: 4 },
        {
          default: () => [
            // 无编辑权限时按钮直接隐藏（hide 策略），避免暴露不可用入口
            canEdit.value
              ? h(
                  NButton,
                  { size: 'small', tertiary: true, onClick: () => openEdit(row) },
                  { icon: () => h(AppIcon, { name: 'Pencil', size: 14 }), default: () => '编辑' },
                )
              : null,
            canDelete.value
              ? h(
                  NButton,
                  {
                    size: 'small',
                    tertiary: true,
                    type: 'error',
                    onClick: () => handleDelete(row),
                  },
                  { icon: () => h(AppIcon, { name: 'Trash2', size: 14 }), default: () => '删除' },
                )
              : null,
          ],
        },
      ),
  },
])
</script>

<template>
  <div class="role-page">
    <BaseSearch
      v-model="searchParams"
      :fields="searchFields"
      :loading="loading"
      @search="search()"
      @reset="reset()"
    />

    <!-- NAlert 没有 action 插槽，重试按钮直接放在默认插槽里排一行 -->
    <NAlert v-if="error" type="error" :bordered="false" class="role-page__error">
      <template #icon><AppIcon name="CircleAlert" /></template>
      <div class="role-page__error-body">
        <span>{{ error instanceof ApiError ? error.message : '加载角色列表失败' }}</span>
        <NButton size="tiny" tertiary @click="refresh()">重试</NButton>
      </div>
    </NAlert>

    <BaseTable
      :columns="columns"
      :data="data"
      :loading="loading"
      :page="pageNum"
      :page-size="pageSize"
      :total="total"
      row-key="id"
      @update:page="handlePageChange"
      @update:page-size="handlePageSizeChange"
      @refresh="refresh()"
    >
      <template #toolbar-left>
        <NButton v-permission="PermissionCode.ROLE_CREATE" type="primary" @click="openCreate">
          <template #icon><AppIcon name="Plus" /></template>
          新增角色
        </NButton>
      </template>
    </BaseTable>

    <BaseDialog
      v-model:show="dialogVisible"
      :title="dialogMode === 'create' ? '新增角色' : '编辑角色'"
      :width="680"
      :loading="submitting"
      @confirm="submitRole"
    >
      <BaseForm
        ref="formRef"
        v-model="formModel"
        :fields="formFields"
        :cols="2"
        :label-width="80"
      />

      <NDivider class="role-page__divider">权限配置</NDivider>

      <div class="role-page__permissions">
        <NCheckbox
          v-for="item in PERMISSION_OPTIONS"
          :key="item.code"
          :checked="permissions.includes(item.code)"
          :disabled="isBuiltinAdmin"
          :label="item.label"
          @update:checked="(checked: boolean) => togglePermission(item.code, checked)"
        />
      </div>

      <p v-if="isBuiltinAdmin" class="role-page__tip">
        超级管理员为系统内置角色，其权限不允许调整。
      </p>
      <p v-else class="role-page__tip">
        已勾选 {{ permissions.length }} / {{ PERMISSION_OPTIONS.length }} 项权限。
      </p>
    </BaseDialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/variables.scss' as v;

.role-page {
  display: flex;
  flex-direction: column;
  gap: v.$gap-md;

  &__error {
    margin-bottom: v.$gap-sm;
  }

  &__error-body {
    display: flex;
    gap: v.$gap-sm;
    align-items: center;
    justify-content: space-between;
  }

  &__divider {
    margin: v.$gap-md 0 v.$gap-sm;
  }

  &__permissions {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px 12px;
  }

  &__tip {
    margin: v.$gap-sm 0 0;
    color: var(--app-color-text-tertiary);
    font-size: v.$font-size-sm;
  }
}
</style>
