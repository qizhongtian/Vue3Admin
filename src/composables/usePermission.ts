/**
 * 权限组合式函数
 *
 * 把「权限判定」（src/utils/permission.ts 的纯函数）
 * 与「权限来源」（user store）粘合起来，供组件使用。
 *
 * 再次强调：这里的结果只用于**界面呈现**（隐藏 / 禁用），
 * 后端必须对每一次 API 调用独立完成授权校验，前端判定可以被任意绕过。
 */

import { computed, type ComputedRef } from 'vue'
import { useUserStore } from '@/stores/user'
import { checkAccess, hasPermission, hasRole, type PermissionMode } from '@/utils/permission'

export interface UsePermissionReturn {
  /** 当前用户拥有的权限码 */
  permissions: ComputedRef<readonly string[]>
  /** 当前用户拥有的角色 */
  roles: ComputedRef<readonly string[]>
  /** 是否超级管理员 */
  isSuperAdmin: ComputedRef<boolean>
  /** 判断是否具备某个/某些权限 */
  hasPermission: (code: string | string[], mode?: PermissionMode) => boolean
  /** 判断是否具备某个/某些角色 */
  hasRole: (role: string | string[], mode?: PermissionMode) => boolean
  /** 综合判断（角色 + 权限） */
  can: (options?: {
    roles?: string | string[]
    permissions?: string | string[]
    mode?: PermissionMode
  }) => boolean
}

export function usePermission(): UsePermissionReturn {
  const userStore = useUserStore()

  const permissions = computed<readonly string[]>(() => userStore.permissions)
  const roles = computed<readonly string[]>(() => userStore.roles)
  const isSuperAdmin = computed<boolean>(() => userStore.isSuperAdmin)

  const checkPermission = (code: string | string[], mode: PermissionMode = 'some'): boolean => {
    if (isSuperAdmin.value) {
      return true
    }
    return hasPermission(permissions.value, code, mode)
  }

  const checkRole = (role: string | string[], mode: PermissionMode = 'some'): boolean => {
    if (isSuperAdmin.value) {
      return true
    }
    return hasRole(roles.value, role, mode)
  }

  const can = (
    options: {
      roles?: string | string[]
      permissions?: string | string[]
      mode?: PermissionMode
    } = {},
  ): boolean =>
    checkAccess({
      roles: roles.value,
      permissions: permissions.value,
      requiredRoles: options.roles,
      requiredPermissions: options.permissions,
      mode: options.mode,
      superAdmin: isSuperAdmin.value,
    })

  return {
    permissions,
    roles,
    isSuperAdmin,
    hasPermission: checkPermission,
    hasRole: checkRole,
    can,
  }
}
