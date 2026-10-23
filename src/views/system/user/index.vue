<script setup lang="ts">
/**
 * 用户管理页
 *
 * 这是框架能力的综合演示：
 *  - usePagination：分页 / 搜索 / 竞态保护 / 取消；
 *  - BaseSearch + BaseTable + BaseDialog + BaseForm：通用组件组合；
 *  - usePermission + v-permission：按钮级权限控制；
 *  - 新增 / 编辑 / 删除后的刷新策略各不相同，由 usePagination 提供对应方法。
 */
import { computed, h, ref } from 'vue'
import { NAlert, NButton, NSpace, NTag, useDialog } from 'naive-ui'
import type { DataTableColumns, DataTableSortState } from 'naive-ui'
import BaseSearch from '@/components/BaseSearch/BaseSearch.vue'
import BaseTable from '@/components/BaseTable/BaseTable.vue'
import BaseDialog from '@/components/BaseDialog/BaseDialog.vue'
import BaseForm from '@/components/BaseForm/BaseForm.vue'
import { AppIcon } from '@/components/AppIcon'
import { usePagination } from '@/composables/usePagination'
import { usePermission } from '@/composables/usePermission'
import { createUser, deleteUser, fetchUserPage, updateUser } from '@/api/user'
import type {
  CreateUserParams,
  QueryUserParams,
  SystemUser,
  UpdateUserParams,
} from '@/types/entity'
import type { FormField } from '@/types/form'
import type { SortOrder } from '@/types/pagination'
import { PaginationDefaults, PermissionCode } from '@/config/app'
import { ApiError } from '@/utils/http-error'
import { notifyError, notifySuccess } from '@/utils/notify'

// keep-alive 需要显式组件名
defineOptions({ name: 'SystemUserPage' })

/**
 * 搜索参数类型。
 *
 * pageNum / pageSize 由 usePagination 自行维护并通过 PaginationParams 合并注入，
 * 因此这里用 Omit 去掉，避免出现「同一个字段两处来源」的隐患。
 */
type UserSearchParams = Omit<QueryUserParams, 'pageNum' | 'pageSize'> & {
  sortBy?: string
  sortOrder?: SortOrder | ''
}

const dialog = useDialog()
const { hasPermission } = usePermission()

/** ---------- 分页查询 ---------- */
const pagination = usePagination<SystemUser, UserSearchParams>(fetchUserPage, {
  immediate: true,
  defaultPageSize: PaginationDefaults.PAGE_SIZE,
  defaultSearchParams: { keyword: '', status: '', sortBy: '', sortOrder: '' },
  cacheKey: 'system-user',
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

/** 排序状态变化时回到第一页重新查询 */
function handleSorterChange(sorter: DataTableSortState | null): void {
  if (!sorter) {
    searchParams.value = { ...searchParams.value, sortBy: '', sortOrder: '' }
  } else {
    searchParams.value = {
      ...searchParams.value,
      sortBy: String(sorter.columnKey ?? ''),
      sortOrder: sorter.order === 'ascend' ? 'asc' : 'desc',
    }
  }
  void search()
}

/** ---------- 搜索表单 ---------- */
const searchFields: FormField[] = [
  {
    key: 'keyword',
    label: '关键词',
    placeholder: '支持账号 / 昵称模糊搜索',
  },
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

/** ---------- 新增 / 编辑弹窗 ---------- */
type UserFormModel = Record<string, unknown>

const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const submitting = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref<InstanceType<typeof BaseForm> | null>(null)

const roleOptions = [
  { label: '超级管理员', value: 'admin' },
  { label: '普通编辑', value: 'editor' },
]

const userFields = computed<FormField[]>(() => [
  {
    key: 'username',
    label: '账号',
    required: true,
    disabled: dialogMode.value === 'edit',
    placeholder: '登录账号，创建后不可修改',
  },
  {
    key: 'password',
    label: '密码',
    widget: 'password',
    required: dialogMode.value === 'create',
    placeholder: dialogMode.value === 'create' ? '请输入初始密码' : '留空表示不修改',
  },
  { key: 'nickname', label: '昵称', required: true },
  { key: 'email', label: '邮箱' },
  { key: 'phone', label: '手机号' },
  {
    key: 'roles',
    label: '角色',
    widget: 'select',
    options: roleOptions,
    required: true,
    placeholder: '请选择角色',
  },
  {
    key: 'status',
    label: '状态',
    widget: 'select',
    options: [
      { label: '启用', value: 'enabled' },
      { label: '禁用', value: 'disabled' },
    ],
    required: true,
  },
])

const userModel = ref<UserFormModel>({
  username: '',
  password: '',
  nickname: '',
  email: '',
  phone: '',
  roles: ['editor'],
  status: 'enabled',
})

function openCreate(): void {
  dialogMode.value = 'create'
  editingId.value = null
  userModel.value = {
    username: '',
    password: '',
    nickname: '',
    email: '',
    phone: '',
    roles: ['editor'],
    status: 'enabled',
  }
  formRef.value?.restoreValidation()
  dialogVisible.value = true
}

function openEdit(row: SystemUser): void {
  dialogMode.value = 'edit'
  editingId.value = row.id
  userModel.value = {
    username: row.username,
    password: '',
    nickname: row.nickname,
    email: row.email,
    phone: row.phone,
    roles: row.roles,
    status: row.status,
  }
  formRef.value?.restoreValidation()
  dialogVisible.value = true
}

async function submitUser(): Promise<void> {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    if (dialogMode.value === 'create') {
      const params: CreateUserParams = {
        username: String(userModel.value.username ?? '').trim(),
        password: String(userModel.value.password ?? ''),
        nickname: String(userModel.value.nickname ?? '').trim(),
        email: String(userModel.value.email ?? ''),
        phone: String(userModel.value.phone ?? ''),
        status: userModel.value.status === 'disabled' ? 'disabled' : 'enabled',
        roles: (userModel.value.roles as string[]) ?? ['editor'],
      }
      await createUser(params)
      notifySuccess('新增成功')
      dialogVisible.value = false
      await onCreateSuccess()
    } else {
      const id = editingId.value
      if (id === null) {
        return
      }
      const params: UpdateUserParams = {
        id,
        nickname: String(userModel.value.nickname ?? '').trim(),
        email: String(userModel.value.email ?? ''),
        phone: String(userModel.value.phone ?? ''),
        status: userModel.value.status === 'disabled' ? 'disabled' : 'enabled',
        roles: (userModel.value.roles as string[]) ?? ['editor'],
      }
      await updateUser(params)
      notifySuccess('修改成功')
      dialogVisible.value = false
      await onUpdateSuccess()
    }
  } catch (rawError) {
    const message2 = rawError instanceof ApiError ? rawError.message : '操作失败'
    notifyError(message2)
  } finally {
    submitting.value = false
  }
}

/** ---------- 删除 ---------- */
function handleDelete(row: SystemUser): void {
  dialog.warning({
    title: '删除确认',
    content: `确定要删除用户「${row.nickname}」吗？该操作不可撤销。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteUser(row.id)
        notifySuccess('删除成功')
        await onDeleteSuccess(1)
      } catch (rawError) {
        notifyError(rawError instanceof ApiError ? rawError.message : '删除失败')
      }
    },
  })
}

/** ---------- 表格列 ---------- */
const columns = computed<DataTableColumns<SystemUser>>(() => [
  { title: 'ID', key: 'id', width: 70, sorter: true, sortOrder: false },
  { title: '账号', key: 'username', minWidth: 120 },
  { title: '昵称', key: 'nickname', minWidth: 120 },
  { title: '邮箱', key: 'email', minWidth: 180 },
  { title: '手机号', key: 'phone', minWidth: 130 },
  {
    title: '角色',
    key: 'roles',
    minWidth: 130,
    render: (row) =>
      h(
        NSpace,
        { size: 4 },
        {
          default: () =>
            row.roles.map((role) =>
              h(
                NTag,
                { size: 'small', bordered: false, type: role === 'admin' ? 'warning' : 'default' },
                { default: () => (role === 'admin' ? '管理员' : '编辑') },
              ),
            ),
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
  { title: '创建时间', key: 'createdAt', minWidth: 160 },
  {
    title: '操作',
    key: 'actions',
    width: 160,
    fixed: 'right',
    render: (row) =>
      h(
        NSpace,
        { size: 4 },
        {
          default: () => [
            hasPermission(PermissionCode.USER_UPDATE)
              ? h(
                  NButton,
                  { size: 'small', tertiary: true, onClick: () => openEdit(row) },
                  { icon: () => h(AppIcon, { name: 'Pencil', size: 14 }), default: () => '编辑' },
                )
              : null,
            hasPermission(PermissionCode.USER_DELETE)
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
  <div class="user-page">
    <BaseSearch
      v-model="searchParams"
      :fields="searchFields"
      :loading="loading"
      @search="search()"
      @reset="reset()"
    >
      <template #actions>
        <NButton v-permission="PermissionCode.USER_EXPORT" tertiary>
          <template #icon><AppIcon name="Download" /></template>
          导出
        </NButton>
      </template>
    </BaseSearch>

    <!-- NAlert 没有 action 插槽，重试按钮直接放在默认插槽里排一行 -->
    <NAlert v-if="error" type="error" :bordered="false" class="user-page__error">
      <template #icon><AppIcon name="CircleAlert" /></template>
      <div class="user-page__error-body">
        <span>{{ error instanceof ApiError ? error.message : '加载用户列表失败' }}</span>
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
      @update:sorter="handleSorterChange"
      @refresh="refresh()"
    >
      <template #toolbar-left>
        <NButton v-permission="PermissionCode.USER_CREATE" type="primary" @click="openCreate">
          <template #icon><AppIcon name="UserPlus" /></template>
          新增用户
        </NButton>
      </template>
      <template #empty-extra>
        <NButton v-if="error" size="small" tertiary @click="refresh()">重试</NButton>
      </template>
    </BaseTable>

    <!-- 行内启停用示例（演示 NSwitch） -->
    <NCard2 v-if="false" />

    <BaseDialog
      v-model:show="dialogVisible"
      :title="dialogMode === 'create' ? '新增用户' : '编辑用户'"
      :width="620"
      :loading="submitting"
      @confirm="submitUser"
    >
      <BaseForm
        ref="formRef"
        v-model="userModel"
        :fields="userFields"
        :cols="2"
        :label-width="80"
      />
    </BaseDialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/variables.scss' as *;

.user-page {
  display: flex;
  flex-direction: column;
  gap: $gap-md;

  &__error-body {
    display: flex;
    gap: $gap-sm;
    align-items: center;
    justify-content: space-between;
  }
}
</style>
