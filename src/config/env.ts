/**
 * 环境变量统一读取与校验。
 *
 * 设计目标：
 *  1. 业务组件不允许直接散落读取 `import.meta.env`，一律从这里取；
 *  2. 关键变量缺失时抛出**可执行的**错误信息，而不是让页面在运行时莫名白屏；
 *  3. 区分「构建时配置」与「运行时配置」——前者被打包进产物，后者可覆盖前者。
 *
 * 构建时 vs 运行时
 * ----------------
 * - 构建时：`import.meta.env.VITE_*`，Vite 在打包阶段静态替换，产物换环境需重新构建。
 * - 运行时：`/config.json`，部署后可直接修改，**不需要重新构建**同一份产物即可换后端地址。
 *   仅允许覆盖 `apiBaseUrl` 与 `cesiumBaseUrl`，避免运行时配置被滥用为后门。
 */

export type AppEnvName = 'development' | 'test' | 'production'

/** 认证模式，详见 src/types/auth.ts 的取舍说明 */
export type AuthModeOption = import('@/types/auth').AuthMode

export interface AppEnvConfig {
  /** 认证模式：bearer=仅AccessToken；refresh=AccessToken+RefreshToken；cookie=服务端会话 */
  authMode: AuthModeOption
  /** 应用标题 */
  appTitle: string
  /** 环境标识 */
  appEnv: AppEnvName
  /** 部署基础路径，末尾必带斜杠 */
  baseUrl: string
  /** API 基础地址 */
  apiBaseUrl: string
  /** 是否启用 Mock */
  useMock: boolean
  /** Cesium 静态资源前缀，末尾必带斜杠 */
  cesiumBaseUrl: string
  /** 是否输出调试日志 */
  enableConsole: boolean
  /** 请求超时时间（毫秒） */
  requestTimeout: number
  /** Mock 响应延迟（毫秒） */
  mockDelay: number
}

/** 可被运行时配置覆盖的字段 */
type RuntimeOverridableProps = 'apiBaseUrl' | 'cesiumBaseUrl'

/** 运行时覆盖层 */
const runtimeOverrides: Partial<Pick<AppEnvConfig, RuntimeOverridableProps>> = {}

/** 缺失变量收集 */
const validationErrors: string[] = []

function readString(value: string | undefined, field: string, fallback: string): string {
  if (value === undefined || value.trim() === '') {
    validationErrors.push(`环境变量 ${field} 缺失，请检查 .env 文件（可复制 .env.example）`)
    return fallback
  }
  return value
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') {
    return fallback
  }
  return value === 'true' || value === '1'
}

function readNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    validationErrors.push(`环境变量数值非法：${value}，已回退为 ${fallback}`)
    return fallback
  }
  return parsed
}

/** 统一补齐路径末尾的斜杠，避免出现 /cesiumWorkers/xxx 这类拼接事故 */
function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

/** 去掉路径首尾多余斜杠后再补一个，处理用户误填 `//cesium//` 的情况 */
function normalizePathPrefix(value: string): string {
  const collapsed = value.replace(/\/{2,}/g, '/')
  return collapsed.endsWith('/') ? collapsed : `${collapsed}/`
}

const raw = import.meta.env

const rawAppEnv = raw.VITE_APP_ENV ?? 'production'

const detectedAppEnv: AppEnvName =
  rawAppEnv === 'development' || rawAppEnv === 'test' ? rawAppEnv : 'production'

const appTitle = readString(raw.VITE_APP_TITLE, 'VITE_APP_TITLE', '企业后台管理系统')
const baseUrl = normalizePathPrefix(readString(raw.VITE_BASE_URL, 'VITE_BASE_URL', '/'))
const apiBaseUrl = readString(raw.VITE_API_BASE_URL, 'VITE_API_BASE_URL', '/api')
const cesiumBaseUrl = ensureTrailingSlash(
  normalizePathPrefix(readString(raw.VITE_CESIUM_BASE_URL, 'VITE_CESIUM_BASE_URL', '/cesium/')),
)

/** 受支持的认证模式 */
const SUPPORTED_AUTH_MODES: readonly AuthModeOption[] = ['bearer', 'refresh', 'cookie']

function readAuthMode(value: string | undefined): AuthModeOption {
  const mode = (value ?? 'refresh') as AuthModeOption
  if (!SUPPORTED_AUTH_MODES.includes(mode)) {
    validationErrors.push(
      `环境变量 VITE_AUTH_MODE 取值非法：${String(value)}，可选值为 ${SUPPORTED_AUTH_MODES.join(' / ')}`,
    )
    return 'refresh'
  }
  return mode
}

/** 构建时确定的配置快照 */
const buildTimeConfig: AppEnvConfig = {
  authMode: readAuthMode(raw.VITE_AUTH_MODE),
  appTitle,
  appEnv: detectedAppEnv,
  baseUrl,
  apiBaseUrl,
  useMock: readBoolean(raw.VITE_USE_MOCK, detectedAppEnv === 'development'),
  cesiumBaseUrl,
  enableConsole: readBoolean(raw.VITE_ENABLE_CONSOLE, detectedAppEnv !== 'production'),
  requestTimeout: readNumber(raw.VITE_REQUEST_TIMEOUT, 20_000),
  mockDelay: readNumber(raw.VITE_MOCK_DELAY, detectedAppEnv === 'development' ? 300 : 0),
}

/**
 * 运行时感知的配置对象。
 *
 * 通过 getter 暴露可被 `/config.json` 覆盖的字段，
 * 其余字段在构建时固定，避免意外的运行时抖动。
 */
export const envConfig: AppEnvConfig = {
  get authMode() {
    return buildTimeConfig.authMode
  },
  get appTitle() {
    return buildTimeConfig.appTitle
  },
  get appEnv() {
    return buildTimeConfig.appEnv
  },
  get baseUrl() {
    return buildTimeConfig.baseUrl
  },
  get apiBaseUrl() {
    return runtimeOverrides.apiBaseUrl ?? buildTimeConfig.apiBaseUrl
  },
  get useMock() {
    return buildTimeConfig.useMock
  },
  get cesiumBaseUrl() {
    return runtimeOverrides.cesiumBaseUrl ?? buildTimeConfig.cesiumBaseUrl
  },
  get enableConsole() {
    return buildTimeConfig.enableConsole
  },
  get requestTimeout() {
    return buildTimeConfig.requestTimeout
  },
  get mockDelay() {
    return buildTimeConfig.mockDelay
  },
}

/**
 * 抛出累积的校验错误。
 * 由应用入口在挂载前调用，把「配置缺失」暴露在最前面，而不是等到某个请求失败。
 */
export function assertEnvValid(): void {
  if (validationErrors.length > 0) {
    throw new Error(
      `[config/env] 环境变量配置不完整：\n- ${validationErrors.join('\n- ')}\n` +
        `请复制 .env.example 为 .env.${buildTimeConfig.appEnv} 并补齐上述变量。`,
    )
  }
}

/** 运行时配置文件结构 */
export interface RuntimeConfigFile {
  apiBaseUrl?: string
  cesiumBaseUrl?: string
}

/**
 * 应用运行时配置覆盖。
 * 仅接受白名单字段，且必须作用于我们知道用途的关键地址。
 */
export function applyRuntimeConfig(config: RuntimeConfigFile): void {
  if (typeof config.apiBaseUrl === 'string' && config.apiBaseUrl.trim() !== '') {
    runtimeOverrides.apiBaseUrl = config.apiBaseUrl.trim()
  }
  if (typeof config.cesiumBaseUrl === 'string' && config.cesiumBaseUrl.trim() !== '') {
    runtimeOverrides.cesiumBaseUrl = ensureTrailingSlash(config.cesiumBaseUrl.trim())
  }
}
