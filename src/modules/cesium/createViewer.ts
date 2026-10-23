/**
 * 创建 Cesium Viewer
 *
 * 设计要点：
 *  - **不做隐式单例**：Viewer 的生命周期由调用方（页面组件的 onMounted /
 *    onBeforeUnmount）显式控制，这里只保证「同一个容器上不会出现两个 Viewer」；
 *  - 底图使用包内置的 NaturalEarthII 瓦片，无网络也能出图，
 *    方便在离线环境与 CI 里验证资源路径是否正确；
 *  - 自定义图层/地形通过参数注入，避免模块内部硬编码服务地址。
 *
 * 关于 `baseLayer: false`：
 *  Cesium 1.146 的 Viewer 用 `baseLayer` 控制默认底图（旧版本是 imageryProvider），
 *  它默认是 `ImageryLayer.fromWorldImagery()`，即会去请求 Cesium Ion 在线服务。
 *  这里显式设为 false，改由我们自己 addImageryProvider 挂内置瓦片，
 *  否则内网/离线环境会一直卡在底图请求上并且控制台报 Ion token 错误。
 */

import type { Viewer } from 'cesium'
import type { CesiumModule } from './loadCesium'
import { DEFAULT_VIEWER_OPTIONS, LOCAL_IMAGERY } from './cesium-config'
import { destroyViewer } from './destroyViewer'
import { createLogger } from '@/utils/logger'

const logger = createLogger('cesium')

/**
 * 容器 -> Viewer 的弱引用登记表。
 *
 * 用 WeakMap 而不是普通 Map：容器 DOM 被移除后条目会被自动回收，
 * 不会因为「忘记 delete」而导致 Viewer 引用一直存活。
 */
const viewerRegistry = new WeakMap<HTMLElement, Viewer>()

export interface CreateViewerOptions {
  /** 覆盖 DEFAULT_VIEWER_OPTIONS 中的任意项 */
  viewerOptions?: Viewer.ConstructorOptions
  /**
   * 是否挂载内置离线影像。
   * 设为 false 时由调用方自行通过 viewer.imageryLayers 添加图层。
   */
  useLocalImagery?: boolean
  /** Viewer 创建完成后的回调（此时容器已可交互） */
  onReady?: (viewer: Viewer) => void
}

/**
 * 创建 Viewer。
 *
 * 如果该容器上已经存在 Viewer，会先销毁旧的再创建新的 ——
 * 这解决了 keep-alive 页面反复进入、或组件被复用时出现「画布叠加」的问题。
 */
export function createCesiumViewer(
  cesium: CesiumModule,
  container: HTMLElement,
  options: CreateViewerOptions = {},
): Viewer {
  const { viewerOptions, useLocalImagery = true, onReady } = options

  // 同一容器只允许存在一个 Viewer
  const existing = viewerRegistry.get(container)
  if (existing) {
    logger.debug('容器上已存在 Viewer，先销毁再重建')
    destroyViewer(existing)
    viewerRegistry.delete(container)
  }

  // 容器尺寸为 0 时 Cesium 初始化会得到 0x0 的画布，后续 resize 也可能不生效，
  // 这里提前给出可读的警告，便于排查「布局还没算完就初始化」的问题。
  if (container.clientWidth === 0 || container.clientHeight === 0) {
    logger.warn('容器尺寸为 0，Viewer 可能显示异常', {
      width: container.clientWidth,
      height: container.clientHeight,
    })
  }

  const viewer = new cesium.Viewer(container, {
    ...DEFAULT_VIEWER_OPTIONS,
    // 关闭 Ion 在线底图，改由下面的内置瓦片提供
    baseLayer: false,
    ...viewerOptions,
  })

  if (useLocalImagery) {
    /**
     * Cesium 1.146 里 TileMapServiceImageryProvider 的构造函数**不再接受 url**，
     * 取瓦片地址必须走静态方法 fromUrl()，而它是异步的。
     *
     * 这里用 ImageryLayer.fromProviderAsync() 把 Promise 交给图层托管：
     * 既能保持 createCesiumViewer 同步返回（调用方不用 await 两遍），
     * 又能在 provider 就绪后自动挂载，失败时由 Cesium 的 errorEvent 抛错。
     */
    viewer.imageryLayers.add(
      cesium.ImageryLayer.fromProviderAsync(
        cesium.TileMapServiceImageryProvider.fromUrl(cesium.buildModuleUrl(LOCAL_IMAGERY.url), {
          maximumLevel: LOCAL_IMAGERY.maximumLevel,
        }),
      ),
    )
  }

  // requestRenderMode 下不会自动重绘，主动触发一次让首帧出来
  viewer.scene.requestRender()

  viewerRegistry.set(container, viewer)
  onReady?.(viewer)
  return viewer
}

/** 容器被复用/卸载时，从登记表里移除（不销毁，销毁交给 destroyViewer） */
export function unregisterViewer(container: HTMLElement): void {
  viewerRegistry.delete(container)
}
