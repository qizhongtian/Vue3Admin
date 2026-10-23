/**
 * 请求层类型定义
 *
 * 这里的类型是「适配层」类型：
 * 业务代码使用它，而 `src/utils/http.ts` 负责把它翻译成 ofetch 真实支持的配置，
 * 因此两者不是同一回事 —— 自定义字段不会被无条件透传给底层 fetch。
 */

import type { FetchOptions, ResponseType } from 'ofetch'

/** 支持的 HTTP 方法 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * 框架自定义请求选项。
 *
 * 这些字段会在传递给 ofetch 之前被剥离，不会进入原生 RequestInit。
 */
export interface HttpRequestExtensions {
  /**
   * 跳过全局错误提示（错误仍然会被抛出，交给调用方自行处理）。
   * 适用于登录校验、批量探测等需要自定义反馈的场景。
   */
  showError?: boolean
  /**
   * 跳过 Token 注入。
   * 登录、刷新 Token 等接口必须设置，否则会带上过期 Token 造成误判。
   */
  skipAuth?: boolean
  /**
   * 允许在收到 401 时触发刷新 Token 并重放原请求。
   * 默认只有幂等读请求（GET）会自动参与刷新重放；
   * 写请求需要显式确认幂等性后才允许。
   */
  allowAuthRetry?: boolean
  /**
   * 该请求是否为幂等写操作。
   * 幂等写请求在业务写重试策略下才允许自动重试。
   */
  idempotent?: boolean
  /**
   * 参与重复请求拦截。开启后相同 key 的并发请求会共享/取消。
   */
  enableDedupe?: boolean
  /**
   * 重复请求标识。缺省时依据 method + url + 序列化参数自动生成。
   */
  dedupeKey?: string
  /**
   * 是否在发起新请求时中断上一个未完成的同 key 请求。
   * 用于搜索、联想等「旧结果必须被丢弃」的场景。
   */
  cancelPrevious?: boolean
  /**
   * 网络/HTTP 层的自动重试次数，`false` 表示关闭由业务控制。
   * 注意：这与 401 的 Token 刷新重试是两套独立机制。
   */
  retryCount?: number | false
  /**
   * 请求级超时（毫秒），覆盖全局配置。
   */
  timeout?: number
  /**
   * 附带元信息，仅用于日志与排查，不会发送给服务端。
   */
  meta?: Record<string, string | number | boolean | undefined>
}

/**
 * 完整的请求配置。
 * FetchOptions 提供了 ofetch 原生能力（query / body / headers / responseType 等），
 * HttpRequestExtensions 提供框架扩展能力。
 */
export interface RequestOptions<R extends ResponseType = ResponseType>
  extends FetchOptions<R>, HttpRequestExtensions {}

/** 文件下载结果 */
export interface DownloadResult {
  blob: Blob
  filename: string
  /** 从响应头解析出的文件名（若存在） */
  rawFilename?: string
}
