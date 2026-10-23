/**
 * 按钮级权限指令
 *
 * 用法：
 *   <n-button v-permission="'system:user:create'">新增</n-button>
 *   <n-button v-permission="['system:user:update', 'system:user:delete']">批量操作</n-button>
 *   <n-button v-permission.every="['a:create', 'b:create']">同时具备</n-button>
 *   <n-button v-permission.disable="'system:user:delete'">保留但禁用</n-button>
 *
 * 行为：
 *  - 默认模式下无权限会**从 DOM 中移除**元素；
 *  - `.disable` 修饰符下保留元素并置灰禁用（适合需要向用户说明「有此能力但无权限」的场景）；
 *  - 权限集合变化（例如切换账号）时会重新计算，见 updated 钩子。
 *
 * 安全说明：这只是界面层控制，后端必须独立校验。
 */

import type { Directive, DirectiveBinding } from 'vue'
import { useUserStore } from '@/stores/user'
import { hasPermission, type PermissionMode } from '@/utils/permission'

type PermissionValue = string | string[]

interface PermissionElement extends HTMLElement {
  __permissionOriginalDisplay__?: string
}

function isEveryMode(binding: DirectiveBinding<PermissionValue>): boolean {
  return binding.modifiers.every === true
}

function resolveMode(binding: DirectiveBinding<PermissionValue>): PermissionMode {
  return isEveryMode(binding) ? 'every' : 'some'
}

function checkPermission(binding: DirectiveBinding<PermissionValue>): boolean {
  const value = binding.value
  if (!value || (Array.isArray(value) && value.length === 0)) {
    // 没有声明权限要求，视为不限制
    return true
  }
  const userStore = useUserStore()
  if (userStore.isSuperAdmin) {
    return true
  }
  return hasPermission(userStore.permissions, value, resolveMode(binding))
}

/** 保存原始 display，便于禁用模式下还原 */
function rememberDisplay(el: PermissionElement): void {
  if (el.__permissionOriginalDisplay__ === undefined) {
    el.__permissionOriginalDisplay__ = el.style.display
  }
}

function hide(el: PermissionElement): void {
  rememberDisplay(el)
  el.style.display = 'none'
}

function show(el: PermissionElement): void {
  el.style.display = el.__permissionOriginalDisplay__ ?? ''
}

function disable(el: PermissionElement): void {
  el.setAttribute('disabled', 'disabled')
  el.classList.add('is-permission-disabled')
  el.setAttribute('title', '暂无操作权限')
  el.style.pointerEvents = 'none'
  el.style.opacity = '0.5'
}

function enable(el: PermissionElement): void {
  el.removeAttribute('disabled')
  el.classList.remove('is-permission-disabled')
  el.removeAttribute('title')
  el.style.pointerEvents = ''
  el.style.opacity = ''
}

function apply(el: PermissionElement, binding: DirectiveBinding<PermissionValue>): void {
  const allowed = checkPermission(binding)
  const useDisable = binding.modifiers.disable === true

  if (allowed) {
    if (useDisable) {
      enable(el)
    } else {
      show(el)
    }
    return
  }

  if (useDisable) {
    disable(el)
  } else {
    hide(el)
  }
}

export const permission: Directive<PermissionElement, PermissionValue> = {
  mounted(el, binding) {
    apply(el, binding)
  },
  updated(el, binding) {
    // 权限集合可能因「切换账号」或「重新拉取用户信息」而变化
    apply(el, binding)
  },
  unmounted(el) {
    el.__permissionOriginalDisplay__ = undefined
  },
}

/** 统一导出，便于 app.use 批量注册 */
export const directives = {
  permission,
} as const

export default permission
