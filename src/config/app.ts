/**
 * 应用级静态常量
 *
 * 这些值不随环境变化，因此不与环境变量混在一起。
 * 集中维护可以避免魔法字符串散落在各个页面里。
 */

/** localStorage 键统一前缀，避免与同域下其它系统冲突 */
export const STORAGE_PREFIX = 'vue3-admin'

/** 存储键 */
export const StorageKeys = {
  ACCESS_TOKEN: `${STORAGE_PREFIX}:access-token`,
  REFRESH_TOKEN: `${STORAGE_PREFIX}:refresh-token`,
  TOKEN_EXPIRES_AT: `${STORAGE_PREFIX}:token-expires-at`,
  USER_PROFILE: `${STORAGE_PREFIX}:user-profile`,
  APP_SETTINGS: `${STORAGE_PREFIX}:app-settings`,
  TAGS_VIEW: `${STORAGE_PREFIX}:tags-view`,
  ACTIVE_MENU: `${STORAGE_PREFIX}:active-menu`,
} as const

/** 注入到请求头的 Token 名称 */
export const AUTH_HEADER = 'Authorization'

/** Token 前缀 */
export const TOKEN_PREFIX = 'Bearer'

/**
 * 按钮级权限码。
 * 统一命名规范：`模块:资源:操作`
 */
export const PermissionCode = {
  USER_CREATE: 'system:user:create',
  USER_UPDATE: 'system:user:update',
  USER_DELETE: 'system:user:delete',
  USER_EXPORT: 'system:user:export',
  USER_VIEW: 'system:user:view',
  ROLE_CREATE: 'system:role:create',
  ROLE_UPDATE: 'system:role:update',
  ROLE_DELETE: 'system:role:delete',
} as const

export type PermissionCodeValue = (typeof PermissionCode)[keyof typeof PermissionCode]

/**
 * 可被分配的全部权限点。
 *
 * 真实项目里这份清单应由后端下发（权限树），前端只负责勾选与回传。
 * 这里集中放在配置层，好处是：
 *  - 页面不依赖 mock 数据，切真实后端时不用改任何 import；
 *  - 新增权限点只需改一处，不需要在多个页面同步字符串。
 */
export const PERMISSION_OPTIONS: ReadonlyArray<{ code: PermissionCodeValue; label: string }> = [
  { code: PermissionCode.USER_VIEW, label: '查看用户' },
  { code: PermissionCode.USER_CREATE, label: '新增用户' },
  { code: PermissionCode.USER_UPDATE, label: '编辑用户' },
  { code: PermissionCode.USER_DELETE, label: '删除用户' },
  { code: PermissionCode.USER_EXPORT, label: '导出用户' },
  { code: PermissionCode.ROLE_CREATE, label: '新增角色' },
  { code: PermissionCode.ROLE_UPDATE, label: '编辑角色' },
  { code: PermissionCode.ROLE_DELETE, label: '删除角色' },
]

/** 分页默认值 */
export const PaginationDefaults = {
  PAGE_NUM: 1,
  PAGE_SIZE: 20,
  /** 可选每页条数 */
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100] as const,
} as const

/** 路由名称常量，避免到处写字符串 */
export const RouteNames = {
  LOGIN: 'Login',
  DASHBOARD: 'Dashboard',
  SYSTEM_USER: 'SystemUser',
  SYSTEM_ROLE: 'SystemRole',
  CESIUM_DEMO: 'CesiumDemo',
  ERROR_403: 'Forbidden',
  ERROR_404: 'NotFound',
} as const

/** 布局常量 */
export const LayoutConfig = {
  /** 侧边栏展开宽度 */
  SIDEBAR_WIDTH: 220,
  /** 侧边栏收起宽度 */
  SIDEBAR_COLLAPSED_WIDTH: 64,
  /** 顶部导航高度 */
  HEADER_HEIGHT: 56,
  /** 标签页高度 */
  TAGS_VIEW_HEIGHT: 40,
  /** 移动端断点 */
  MOBILE_BREAKPOINT: 768,
} as const

/** 请求层默认策略 */
export const RequestPolicy = {
  /** 只读请求的网络重试次数 */
  READ_RETRY_COUNT: 2,
  /** 写请求默认不重试 */
  WRITE_RETRY_COUNT: 0,
  /** 单次请求允许的 Token 刷新重放次数上限 */
  MAX_AUTH_RETRY: 1,
  /** 需要重试的 HTTP 状态码 */
  RETRY_STATUS_CODES: [408, 429, 500, 502, 503, 504],
  /** 基础重试退避时间（毫秒） */
  RETRY_BASE_DELAY: 500,
} as const

/** 全局提示默认时长（毫秒） */
export const NotifyDurations = {
  SUCCESS: 2000,
  WARNING: 3000,
  ERROR: 4000,
} as const

/** 主题模式 */
export type ThemeMode = 'light' | 'dark'

/** 登录页展示配置（后续可改为由接口下发） */
export const LoginPageConfig = {
  TITLE: '企业后台管理系统',
  SUBTITLE: 'Vue 3 + TypeScript + Vite 企业级基础框架',
  /** 演示账号提示，生产环境可通过接口配置隐藏 */
  DEMO_ACCOUNTS: [
    { username: 'admin', password: 'admin123', desc: '超级管理员：全部菜单与权限' },
    { username: 'editor', password: 'editor123', desc: '普通用户：仅有用户查看权限' },
  ],
} as const
