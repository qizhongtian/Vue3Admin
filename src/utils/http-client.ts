/**
 * 底层 HTTP 客户端工厂
 *
 * 为什么要把这一层单独拆出来：
 *   主实例 `src/utils/http.ts` 带有完整的拦截器（注入 Token、刷新、错误提示……）。
 *   而「刷新 Token」这个请求本身绝对不能走这套拦截器 —— 否则一旦刷新返回 401，
 *   就会再次尝试刷新，形成死循环。
 *
 * 因此这里提供一个**不带任何业务拦截器**的裸客户端，
 * 供 Token 刷新等基础设施场景使用，同时它也是主实例的基础。
 *
 * 已核实的 ofetch 1.5.1 行为（不要凭印象改动这里的代码）：
 *   1. `onRequest` 钩子在 baseURL 拼接**之前**执行，因此可以在钩子里动态改写 baseURL；
 *   2. baseURL 使用 ufo.withBase 拼接，当 url 已带 baseURL 前缀时不会重复拼接；
 *   3. `query` 通过 ufo.withQuery 追加到 url 之后；
 *   4. FormData / URLSearchParams / 带 buffer 的 Blob 不会被序列化成 JSON；
 *   5. **仅当 options.signal 为空时** ofetch 才会启用内置超时，二者不能同时生效。
 */

import { createFetch, type $Fetch, type CreateFetchOptions, type Fetch } from 'ofetch'
import { envConfig } from '@/config/env'
import { createMockFetch } from '@/mock'
import { getAuthMode } from './auth-session'

/**
 * 是否启用 Mock。
 *
 * 这里刻意使用 `import.meta.env` 上的**编译期常量**：
 * Vite 会把它替换成字面量，因此生产构建的 `false` 分支会被整体摇掉，
 * 从而不会把 Mock 数据打包进产物。
 * 若改用 `envConfig.useMock` 这种运行时取值，则无法被静态优化。
 */
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

/** 认证模式为 cookie 时需要带上凭证，否则服务端会话不生效 */
function resolveCredentials(): RequestCredentials {
  return getAuthMode() === 'cookie' ? 'include' : 'same-origin'
}

/** 构造创建参数：启用 Mock 时注入自定义 fetch 实现 */
function buildCreateFetchOptions(): CreateFetchOptions {
  if (!USE_MOCK) {
    return {}
  }
  const mockFetch: Fetch = createMockFetch()
  return { fetch: mockFetch }
}

/**
 * 创建一个裸客户端实例。
 *
 * @param extraOptions 追加的默认配置
 */
export function createRawClient(extraOptions: CreateFetchOptions['defaults'] = {}): $Fetch {
  return createFetch(buildCreateFetchOptions()).create({
    // 默认超时，可被请求级配置覆盖
    timeout: envConfig.requestTimeout,
    credentials: resolveCredentials(),
    headers: {
      Accept: 'application/json',
    },
    ...extraOptions,
    onRequest({ options }) {
      /**
       * 每次请求动态读取 baseURL。
       * 这样运行时配置（/config.json）覆盖后才不需要重建实例。
       */
      options.baseURL = envConfig.apiBaseUrl
    },
  })
}

/** 默认共享的裸客户端 */
export const rawClient: $Fetch = createRawClient()

/**
 * 合并外部 signal 与超时控制。
 *
 * 由于 ofetch 在检测到外部 signal 时会放弃内置超时，
 * 这里需要自己实现组合控制，否则传入 signal 的请求会失去超时保护。
 */
export function composeSignalAndTimeout(
  // 允许传 null：RequestInit.signal 的类型就是 AbortSignal | null | undefined
  externalSignal: AbortSignal | null | undefined,
  timeout: number | undefined,
): { signal: AbortSignal | undefined; dispose: () => void } {
  if (!externalSignal && !timeout) {
    return { signal: undefined, dispose: () => {} }
  }
  // 只有超时：交给 ofetch 内置实现即可，避免出现多余控制器
  if (!externalSignal) {
    return { signal: undefined, dispose: () => {} }
  }
  if (!timeout) {
    return { signal: externalSignal, dispose: () => {} }
  }

  const controller = new AbortController()
  const onExternalAbort = (): void => {
    controller.abort(externalSignal.reason)
  }
  externalSignal.addEventListener('abort', onExternalAbort, { once: true })

  const timer = setTimeout(() => {
    controller.abort(new DOMException('请求超时', 'TimeoutError'))
  }, timeout)

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      externalSignal.removeEventListener('abort', onExternalAbort)
    },
  }
}
