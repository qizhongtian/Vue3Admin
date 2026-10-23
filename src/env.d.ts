/// <reference types="vite/client" />

/**
 * 环境变量类型定义
 *
 * 所有 VITE_ 前缀变量都会被静态替换进前端产物，
 * 因此这里只是类型声明，不代表它们是保密数据。
 */
interface ImportMetaEnv {
  /** 应用标题 */
  readonly VITE_APP_TITLE: string
  /** 环境标识：development | test | production */
  readonly VITE_APP_ENV: string
  /** 部署基础路径 */
  readonly VITE_BASE_URL: string
  /** API 基础地址 */
  readonly VITE_API_BASE_URL: string
  /** 是否启用 Mock */
  readonly VITE_USE_MOCK: string
  /** Cesium 静态资源前缀 */
  readonly VITE_CESIUM_BASE_URL: string
  /** 是否输出调试日志 */
  readonly VITE_ENABLE_CONSOLE: string
  /** 请求超时时间（毫秒） */
  readonly VITE_REQUEST_TIMEOUT: string
  /** Mock 响应延迟（毫秒） */
  readonly VITE_MOCK_DELAY: string
  /** 认证模式：bearer | refresh | cookie */
  readonly VITE_AUTH_MODE?: string
  /** 开发代理目标地址（可选，不参与运行时） */
  readonly VITE_PROXY_TARGET?: string
  /** 转发时是否剥离 API 前缀（可选，不参与运行时） */
  readonly VITE_PROXY_REWRITE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** vite.config.ts 中通过 define 注入的构建期常量 */
declare const __APP_ENV__: string
declare const __APP_BUILD_TIME__: string
declare const __APP_USE_MOCK__: boolean

/**
 * Cesium 约定的全局静态资源基础地址。
 *
 * 本文件没有顶层 import/export，属于「全局脚本」，
 * 因此直接声明 interface Window 即可完成全局增强；
 * 写成 `declare global { ... }` 反而无效（它只允许出现在模块里）。
 */
interface Window {
  CESIUM_BASE_URL?: string
}
