/**
 * Mock 入口
 *
 * 只在 `VITE_USE_MOCK=true` 时被 `src/utils/http-client.ts` 引用。
 * 引用处使用的是 `import.meta.env.VITE_USE_MOCK === 'true'` 这类**编译期常量**，
 * 因此生产环境构建时整棵 Mock 子树会被摇掉，不会进入产物。
 */

export { createMockFetch, __resetMockState, __issueTokenForTest } from './server'
