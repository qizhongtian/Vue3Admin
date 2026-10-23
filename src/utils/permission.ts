/**
 * 权限判定工具（纯函数）
 *
 * 设计要点：
 *  - 这里只做「字符串匹配」，不读取 Pinia，因此可以在任何环境（含测试）中直接使用；
 *  - 权限仅为**界面层**控制，用于隐藏/禁用用户没有资格看到的操作，
 *    绝不能替代后端对 API 的授权校验 —— 前端权限可以被轻易绕过。
 *
 * 权限码规范：`模块:资源:操作`，例如 system:user:create
 * 支持通配：`system:user:*` 表示拥有该资源的全部操作。
 */

/** 多权限组合判断模式 */
export type PermissionMode = 'some' | 'every'

/** 环境（可扩展为自定义 'SuperAdmin' 约定） */
const SUPER_ADMIN_ROLE = 'SUPER_ADMIN'

/**
 * 判断单个权限码是否被 granted 集合覆盖。
 * 支持逐级通配，例如 system:* 可匹配 system:user:create。
 */
export function matchPermission(granted: readonly string[], required: string): boolean {
  if (granted.length === 0) {
    return false
  }
  const target = required.trim()
  if (target === '') {
    return false
  }
  if (granted.includes(target)) {
    return true
  }

  // 展开通配段进行逐级比对
  const targetSegments = target.split(':')
  for (const rule of granted) {
    if (!rule.includes('*')) {
      continue
    }
    const ruleSegments = rule.split(':')
    // 全通配
    if (ruleSegments[0] === '*') {
      return true
    }
    if (ruleSegments.length > targetSegments.length) {
      continue
    }
    let matched = true
    for (let i = 0; i < ruleSegments.length; i += 1) {
      const ruleSegment = ruleSegments[i]
      const targetSegment = targetSegments[i]
      if (ruleSegment === '*') {
        // 通配出现在中间位置时，代表后续任意层级
        if (i === ruleSegments.length - 1) {
          break
        }
        continue
      }
      if (ruleSegment !== targetSegment) {
        matched = false
        break
      }
    }
    if (matched) {
      return true
    }
  }
  return false
}

/**
 * 判断用户是否具备所需权限。
 *
 * @param granted 用户拥有的权限码
 * @param required 需要的权限码（单个或多个）
 * @param mode some=满足其一即可；every=必须全部满足
 */
export function hasPermission(
  granted: readonly string[],
  required: string | readonly string[] | undefined,
  mode: PermissionMode = 'some',
): boolean {
  if (required === undefined) {
    return true
  }
  const list = Array.isArray(required) ? required : [required]
  if (list.length === 0) {
    return true
  }
  return mode === 'every'
    ? list.every((item) => matchPermission(granted, item))
    : list.some((item) => matchPermission(granted, item))
}

/**
 * 判断用户是否具备所需角色。
 */
export function hasRole(
  roles: readonly string[],
  required: string | readonly string[] | undefined,
  mode: PermissionMode = 'some',
): boolean {
  if (roles.includes(SUPER_ADMIN_ROLE)) {
    return true
  }
  if (required === undefined) {
    return true
  }
  const list = Array.isArray(required) ? required : [required]
  if (list.length === 0) {
    return true
  }
  return mode === 'every'
    ? list.every((item) => roles.includes(item))
    : list.some((item) => roles.includes(item))
}

/**
 * 组合判断：角色 + 权限。
 * 未声明任何约束时放行 —— 「没有标注要求」不等于「禁止所有人」。
 */
export function checkAccess(params: {
  roles: readonly string[]
  permissions: readonly string[]
  requiredRoles?: string | readonly string[]
  requiredPermissions?: string | readonly string[]
  mode?: PermissionMode
  superAdmin?: boolean
}): boolean {
  const { superAdmin = false } = params
  if (superAdmin || params.roles.includes(SUPER_ADMIN_ROLE)) {
    return true
  }
  const roleOk = hasRole(params.roles, params.requiredRoles, params.mode)
  const permissionOk = hasPermission(params.permissions, params.requiredPermissions, params.mode)
  return roleOk && permissionOk
}
