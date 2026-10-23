/**
 * Vitest 全局环境准备
 *
 * 说明：
 *  - 环境使用 jsdom（见 vite.config.ts 的 test.environment），
 *    localStorage / sessionStorage / DOMException 均由 jsdom 提供；
 *  - 本项目测试以纯函数与组合式函数为主，暂不需要 mock 浏览器 API；
 *    后续如引入组件级测试，可在此统一 stub matchMedia、ResizeObserver。
 */
export {}
