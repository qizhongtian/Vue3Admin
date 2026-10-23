<script setup lang="ts">
/**
 * 顶部导航栏
 * 包含：侧边栏开关、面包屑、主题切换、用户下拉菜单（修改密码 / 退出登录）
 */
import { computed, h, ref, type VNodeChild } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NBreadcrumb, NBreadcrumbItem, NButton, NDropdown, useDialog } from 'naive-ui'
import type { DropdownOption } from 'naive-ui'
import { AppIcon } from '@/components/AppIcon'
import BaseDialog from '@/components/BaseDialog/BaseDialog.vue'
import BaseForm from '@/components/BaseForm/BaseForm.vue'
import type { FormField } from '@/types/form'
import { changePassword } from '@/api/auth'
import { ApiError } from '@/utils/http-error'
import { notifyError, notifySuccess } from '@/utils/notify'
import { buildBreadcrumb } from '@/router/route-utils'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'
import { usePermissionStore } from '@/stores/permission'

const appStore = useAppStore()
const userStore = useUserStore()
const permissionStore = usePermissionStore()
const route = useRoute()
const router = useRouter()
const dialog = useDialog()

/** 面包屑数据 */
const breadcrumbs = computed(() => buildBreadcrumb(permissionStore.menus, route.path))

/** ---------- 修改密码 ---------- */
const passwordDialogVisible = ref(false)
const passwordSubmitting = ref(false)
const passwordFormRef = ref<InstanceType<typeof BaseForm> | null>(null)

const passwordFields: FormField[] = [
  { key: 'oldPassword', label: '原密码', widget: 'password', required: true },
  { key: 'newPassword', label: '新密码', widget: 'password', required: true },
  { key: 'confirmPassword', label: '确认密码', widget: 'password', required: true },
]

const passwordModel = ref<Record<string, unknown>>({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

function openChangePassword(): void {
  passwordModel.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
  passwordFormRef.value?.restoreValidation()
  passwordDialogVisible.value = true
}

async function submitChangePassword(): Promise<void> {
  if (passwordModel.value.newPassword !== passwordModel.value.confirmPassword) {
    notifyError('两次输入的新密码不一致')
    return
  }
  try {
    await passwordFormRef.value?.validate()
  } catch {
    return
  }

  passwordSubmitting.value = true
  try {
    await changePassword({
      oldPassword: String(passwordModel.value.oldPassword ?? ''),
      newPassword: String(passwordModel.value.newPassword ?? ''),
    })
    notifySuccess('密码修改成功，请重新登录')
    passwordDialogVisible.value = false
    // 密码变更属于「需要强制重新认证」的场景，但不应显示「登录已过期」
    await userStore.logout('forced-reauth')
    await router.replace({ name: 'Login' })
  } catch (error) {
    notifyError(error instanceof ApiError ? error.message : '修改密码失败')
  } finally {
    passwordSubmitting.value = false
  }
}

/** ---------- 退出登录 ---------- */
function handleLogout(): void {
  dialog.warning({
    title: '退出登录',
    content: '确定要退出当前账号吗？',
    positiveText: '退出',
    negativeText: '取消',
    onPositiveClick: async () => {
      await userStore.logout()
      await router.replace({ name: 'Login' })
    },
  })
}

/** 下拉项图标渲染器（Naive UI 的 icon 需要一个返回 VNode 的函数） */
function renderIcon(name: string): () => VNodeChild {
  return () => h(AppIcon, { name, size: 16 })
}

const userOptions = computed<DropdownOption[]>(() => [
  { key: 'header', label: userStore.nickname || userStore.username, disabled: true },
  { key: 'divider', type: 'divider' },
  { key: 'password', label: '修改密码', icon: renderIcon('KeyRound') },
  { key: 'logout', label: '退出登录', icon: renderIcon('LogOut') },
])

function handleSelect(key: string): void {
  if (key === 'password') {
    openChangePassword()
    return
  }
  if (key === 'logout') {
    handleLogout()
  }
}
</script>

<template>
  <header class="app-header">
    <div class="app-header__left">
      <NButton quaternary size="small" @click="appStore.toggleSidebar()">
        <template #icon>
          <AppIcon :name="appStore.collapsed ? 'PanelLeft' : 'Menu'" :size="20" />
        </template>
      </NButton>

      <NBreadcrumb v-if="appStore.showBreadcrumb" class="app-header__breadcrumb">
        <NBreadcrumbItem v-for="item in breadcrumbs" :key="String(item.id)">
          <AppIcon v-if="item.icon" :name="item.icon" :size="14" />
          {{ item.title }}
        </NBreadcrumbItem>
      </NBreadcrumb>
    </div>

    <div class="app-header__right">
      <NButton quaternary size="small" title="切换主题" @click="appStore.toggleTheme()">
        <template #icon>
          <AppIcon :name="appStore.themeMode === 'dark' ? 'Sun' : 'Moon'" :size="18" />
        </template>
      </NButton>

      <NDropdown trigger="click" :options="userOptions" @select="handleSelect">
        <div class="app-header__user">
          <span class="app-header__avatar">
            <AppIcon name="Users" :size="18" />
          </span>
          <span class="app-header__username">{{ userStore.nickname || userStore.username }}</span>
          <AppIcon name="ChevronDown" :size="14" />
        </div>
      </NDropdown>

      <span
        class="app-header__role-icon"
        :title="userStore.isSuperAdmin ? '超级管理员' : '普通用户'"
      >
        <AppIcon v-if="userStore.isSuperAdmin" name="ShieldCheck" :size="18" />
      </span>
    </div>

    <BaseDialog
      v-model:show="passwordDialogVisible"
      title="修改密码"
      :width="480"
      :loading="passwordSubmitting"
      @confirm="submitChangePassword"
    >
      <BaseForm
        ref="passwordFormRef"
        v-model="passwordModel"
        :fields="passwordFields"
        :label-width="90"
      />
    </BaseDialog>
  </header>
</template>

<style scoped lang="scss">
@use '@/assets/styles/variables.scss' as v;
@use '@/assets/styles/mixins.scss' as m;

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: v.$header-height;
  padding: 0 v.$gap-md;
  background: var(--app-header-background);
  border-bottom: 1px solid var(--app-color-border);

  &__left {
    display: flex;
    align-items: center;
    gap: v.$gap-md;
    min-width: 0;
  }

  &__breadcrumb {
    @include m.text-ellipsis;

    display: flex;
    align-items: center;
    min-width: 0;
  }

  &__right {
    display: flex;
    align-items: center;
    gap: v.$gap-sm;
  }

  &__user {
    display: flex;
    align-items: center;
    gap: v.$gap-xs;
    padding: v.$gap-xs v.$gap-sm;
    cursor: pointer;
    border-radius: v.$radius-md;
    transition: background v.$transition-fast;

    &:hover {
      background: var(--app-color-hover);
    }
  }

  &__avatar {
    @include m.flex-center;

    width: 28px;
    height: 28px;
    color: #fff;
    background: var(--app-color-primary);
    border-radius: 50%;
  }

  &__username {
    font-size: v.$font-size-md;

    @include m.respond-to('sm') {
      display: none;
    }
  }

  &__role-icon {
    display: flex;
    align-items: center;
    color: var(--app-color-success);
  }
}
</style>
