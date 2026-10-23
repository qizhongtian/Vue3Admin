/**
 * 业务实体类型
 *
 * 与后端接口的字段命名保持一致。
 * 当后端字段名发生变化时，只需改动 api 层与这里的映射，不要污染页面组件。
 */

/** 用户状态 */
export type UserStatus = 'enabled' | 'disabled'

/** 系统用户 */
export interface SystemUser {
  id: number
  username: string
  nickname: string
  email: string
  phone: string
  status: UserStatus
  roles: string[]
  createdAt: string
}

/** 新增用户请求参数 */
export interface CreateUserParams {
  username: string
  password: string
  nickname: string
  email?: string
  phone?: string
  status?: UserStatus
  roles?: string[]
}

/** 编辑用户请求参数 */
export interface UpdateUserParams extends Partial<Omit<CreateUserParams, 'password' | 'username'>> {
  id: number
}

/** 用户分页查询参数 */
export interface QueryUserParams {
  pageNum: number
  pageSize: number
  keyword?: string
  status?: UserStatus | ''
}

/** 首页概览数据 */
export interface DashboardOverview {
  totalUsers: number
  activeUsers: number
  onlineCount: number
  todayVisits: number
  userTrend: Array<{ date: string; value: number }>
  roleDistribution: Array<{ name: string; value: number }>
}

/** ------------------------------------------------------------------ */
/** 角色                                                               */
/** ------------------------------------------------------------------ */

/** 角色状态，与 UserStatus 复用同一套取值，避免前后端翻译成本 */
export type RoleStatus = 'enabled' | 'disabled'

/** 系统角色 */
export interface SystemRole {
  id: number
  /** 角色标识，例如 admin / editor，创建后不建议修改 */
  code: string
  name: string
  description: string
  status: RoleStatus
  /** 该角色持有的权限码列表 */
  permissions: string[]
  sort: number
  createdAt: string
}

/** 新增角色参数 */
export interface CreateRoleParams {
  code: string
  name: string
  description?: string
  status?: RoleStatus
  permissions?: string[]
  sort?: number
}

/** 编辑角色参数 */
export interface UpdateRoleParams extends Partial<Omit<CreateRoleParams, 'code'>> {
  id: number
}

/** 角色分页查询参数 */
export interface QueryRoleParams {
  pageNum: number
  pageSize: number
  keyword?: string
  status?: RoleStatus | ''
}
