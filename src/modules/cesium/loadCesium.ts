/**
 * Cesium 按需加载
 *
 * ============================ 为什么必须懒加载 ============================
 *
 * Cesium 的 ESM 体积在**数 MB 级别**（压缩后仍然很大），并且初始化时会创建
 * WebGL 上下文、编译着色器。如果它进入首屏依赖，登录页、列表页都会被拖慢。
 *
 * 因此本项目遵循三条硬约束（都能在构建产物里验证）：
 *   1. 任何位置的 `import 'cesium'` 都**只在动态 import 里出现**，
 *      应用入口、布局、路由表都不静态引用它；
 *   2. `src/views/cesium-demo/index.vue` 本身是路由级懒加载的，
 *      只有真正进入该页面才会触发下面的动态 import；
 *   3. `vite.config.ts` 里把 cesium 单独分成一个 chunk，
 *      保证它不与业务代码混在同一个文件里，方便确认「首屏没有 Cesium」。
 *
 * 注意：**只靠 manualChunks / codeSplitting 并不能让 Cesium 变小**，
 * 它只能改变「打包到哪里」；真正让它不影响首屏的是「不加载」，
 * 也就是这里的动态 import + 路由懒加载组合。
 */

import { resolveCesiumBaseUrl } from './cesium-config'
import { createLogger } from '@/utils/logger'

const logger = createLogger('cesium')

/** Cesium 模块类型（typeof import 不会产生运行时引用） */
export type CesiumModule = typeof import('cesium')

/**
 * 单例 Promise。
 *
 * 多个页面/组件同时调用 loadCesium() 时只会真正 import 一次，
 * 避免重复下载与重复初始化。
 */
let cesiumPromise: Promise<CesiumModule> | null = null

/**
 * 注入 Cesium 控件样式。
 *
 * Cesium 的 ESM 入口**不会**自动引入 widgets.css，
 * 不引入的话 Viewer 能创建但所有控件都是错位的。
 * 这里用动态 import 让样式跟着 Cesium 一起按需加载。
 */
async function loadCesiumStyles(): Promise<void> {
  await import('cesium/Source/Widgets/widgets.css')
}

/**
 * 加载 Cesium。
 *
 * @returns Cesium 命名空间对象
 * @throws 加载失败时抛出带原始错误信息的 Error，由调用方决定如何提示
 */
export async function loadCesium(): Promise<CesiumModule> {
  if (cesiumPromise) {
    return cesiumPromise
  }

  cesiumPromise = (async () => {
    // 必须在 import 之前设置：Cesium 的 Worker 路径在模块初始化阶段就会读取它
    const baseUrl = resolveCesiumBaseUrl()
    window.CESIUM_BASE_URL = baseUrl
    logger.debug('CESIUM_BASE_URL =', baseUrl)

    const [cesium] = await Promise.all([import('cesium'), loadCesiumStyles()])
    // 注意：Cesium 的类型声明并没有导出 VERSION，这里不做版本日志，
    // 需要确认版本请看 package.json 或构建产物文件名。
    logger.debug('Cesium 运行时加载完成')
    return cesium
  })().catch((error: unknown) => {
    // 失败后必须清空单例，否则后续重试会一直拿到同一个 rejected Promise
    cesiumPromise = null
    const message = error instanceof Error ? error.message : String(error)
    logger.error('Cesium 加载失败', message)
    throw new Error(`Cesium 加载失败：${message}`)
  })

  return cesiumPromise
}
