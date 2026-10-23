/**
 * Cesium Viewer 销毁
 *
 * ============================ 为什么销毁要单独成文件 ============================
 *
 * `viewer.destroy()` 之后如果还残留引用，会同时造成三类问题：
 *   1. **内存泄漏**：Cesium 内部持有大量对象（Entity、DataSource、材质、贴图），
 *      不释放就会一直留在堆里，页面来回切几次内存就涨上去；
 *   2. **WebGL 上下文泄漏**：浏览器对同时存在的 WebGL 上下文数量有上限
 *      （通常 16 个左右），不销毁会报 “Too many active WebGL contexts”；
 *   3. **事件与定时器泄漏**：Camera 监听、Clock 的 tick、DataSource 的异步加载
 *      在 destroy 之后仍可能回调到已卸载的组件。
 *
 * 所以销毁必须是一个明确、集中、可复查的动作，而不是散落在页面里各写一遍。
 */

import type { Viewer } from 'cesium'
import { createLogger } from '@/utils/logger'

const logger = createLogger('cesium')

/**
 * 销毁 Viewer 及其附属资源。
 *
 * 顺序很重要：先停时钟与数据源，再清事件，最后 destroy。
 * 直接 destroy 也能工作，但先停掉 Clock 可以避免销毁过程中还有 tick 在跑。
 *
 * @param viewer 待销毁的 Viewer，允许传 null/undefined（便于在 unmount 里无脑调用）
 */
export function destroyViewer(viewer: Viewer | null | undefined): void {
  if (!viewer || viewer.isDestroyed()) {
    return
  }

  try {
    // 1. 停止时钟，避免销毁过程中仍有动画帧回调
    viewer.clock.shouldAnimate = false

    // 2. 移除所有数据源（3D Tiles、GeoJSON、CZML 等）
    //    这一步会触发各 DataSource 释放自己持有的资源与监听
    const dataSources = viewer.dataSources
    for (let i = dataSources.length - 1; i >= 0; i -= 1) {
      const dataSource = dataSources.get(i)
      if (dataSource) {
        dataSources.remove(dataSource, true)
      }
    }

    // 3. 清空实体
    viewer.entities.removeAll()

    // 4. 移除影像图层（自定义 ImageryProvider 的监听在这里解绑）
    const imageryLayers = viewer.imageryLayers
    imageryLayers.removeAll()

    // 5. 真正销毁：释放 WebGL 上下文、DOM 事件、内部缓存
    viewer.destroy()
  } catch (error) {
    // 销毁失败不应阻断页面卸载流程，记录后继续
    logger.warn('销毁 Cesium Viewer 时发生异常', error)
  }
}
