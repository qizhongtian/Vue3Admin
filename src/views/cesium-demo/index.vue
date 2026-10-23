<script setup lang="ts">
/**
 * Cesium 演示页
 *
 * 这个页面同时承担两个职责：
 *  1. 功能演示：创建 Viewer、添加实体、相机飞行、内存/资源统计；
 *  2. **验收证据**：进入本页之前，网络面板里不应该出现 cesium 的 chunk。
 *     验证方式见 docs/deployment.md 与 README 的「Cesium 按需加载」一节。
 *
 * 生命周期处理是关键：
 *  - 首次进入：onMounted 触发异步加载 + 创建 Viewer；
 *  - keep-alive 切走：onDeactivated 销毁 Viewer（释放 WebGL 上下文），
 *    否则来回切几次就会撞上浏览器的上下文数量上限；
 *  - 切回来：onActivated 重新创建；
 *  - 路由离开/组件卸载：onBeforeUnmount 再兜一次（destroy 是幂等的）。
 */
import {
  computed,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  shallowRef,
} from 'vue'
import { NAlert, NButton, NSpace, NSpin, NTag } from 'naive-ui'
import type { Viewer } from 'cesium'
import { loadCesium, type CesiumModule } from '@/modules/cesium/loadCesium'
import { createCesiumViewer, unregisterViewer } from '@/modules/cesium/createViewer'
import { destroyViewer } from '@/modules/cesium/destroyViewer'
import { DEFAULT_CAMERA, resolveCesiumBaseUrl } from '@/modules/cesium/cesium-config'
import { AppIcon } from '@/components/AppIcon'

defineOptions({ name: 'CesiumDemoPage' })

const containerRef = ref<HTMLDivElement | null>(null)
/**
 * Viewer 用 shallowRef 保存：
 * Cesium 内部对象层级极深，用 ref 做深度响应式会造成巨量代理与性能问题。
 */
const viewer = shallowRef<Viewer | null>(null)
const cesiumModule = shallowRef<CesiumModule | null>(null)

const loading = ref(false)
const errorMessage = ref('')

/** 演示用实体计数（由我们自己维护，避免去读 Cesium 内部结构） */
const markerCount = ref(0)
const elapsed = ref(0)

const cesiumBaseUrl = computed(() => resolveCesiumBaseUrl())
const loadState = computed(() => {
  if (loading.value) return '加载中'
  if (errorMessage.value) return '加载失败'
  return viewer.value ? '已就绪' : '未初始化'
})

/** 创建 Viewer（幂等） */
async function initViewer(): Promise<void> {
  if (viewer.value || loading.value) {
    return
  }
  if (!containerRef.value) {
    return
  }

  loading.value = true
  errorMessage.value = ''

  const start = performance.now()
  try {
    const cesium = await loadCesium()
    cesiumModule.value = cesium

    // 等一帧，确保容器已完成布局（否则会拿到 0x0 尺寸）
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    const container = containerRef.value
    if (!container) {
      return
    }

    viewer.value = createCesiumViewer(cesium, container, {
      onReady: (instance) => {
        instance.camera.setView({
          destination: cesium.Cartesian3.fromDegrees(
            DEFAULT_CAMERA.longitude,
            DEFAULT_CAMERA.latitude,
            DEFAULT_CAMERA.height,
          ),
        })
      },
    })
    elapsed.value = Math.round(performance.now() - start)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

/** 销毁 Viewer（幂等，可重复调用） */
function disposeViewer(): void {
  if (containerRef.value) {
    unregisterViewer(containerRef.value)
  }
  destroyViewer(viewer.value)
  viewer.value = null
  markerCount.value = 0
}

/** 在随机位置添加一个点标记 */
function addMarker(): void {
  const cesium = cesiumModule.value
  const instance = viewer.value
  if (!cesium || !instance) {
    return
  }

  // 以默认视角附近为范围内随机取点
  const lon = DEFAULT_CAMERA.longitude + (Math.random() - 0.5) * 40
  const lat = DEFAULT_CAMERA.latitude + (Math.random() - 0.5) * 24

  instance.entities.add({
    position: cesium.Cartesian3.fromDegrees(lon, lat, 0),
    point: {
      pixelSize: 10,
      color: cesium.Color.fromCssColorString('#1677ff'),
      outlineColor: cesium.Color.WHITE,
      outlineWidth: 2,
    },
    label: {
      text: `标记 ${markerCount.value + 1}`,
      font: '12px sans-serif',
      pixelOffset: new cesium.Cartesian2(0, -18),
      fillColor: cesium.Color.fromCssColorString('#1f2937'),
      showBackground: true,
      backgroundColor: cesium.Color.fromCssColorString('rgba(255,255,255,0.85)'),
    },
  })

  markerCount.value += 1
  // requestRenderMode 下修改场景后必须主动请求重绘
  instance.scene.requestRender()
}

/** 相机飞回默认视角 */
function resetCamera(): void {
  const cesium = cesiumModule.value
  const instance = viewer.value
  if (!cesium || !instance) {
    return
  }
  instance.camera.flyTo({
    destination: cesium.Cartesian3.fromDegrees(
      DEFAULT_CAMERA.longitude,
      DEFAULT_CAMERA.latitude,
      DEFAULT_CAMERA.height,
    ),
    duration: 1.2,
  })
}

/** 清空实体 */
function clearMarkers(): void {
  viewer.value?.entities.removeAll()
  viewer.value?.scene.requestRender()
  markerCount.value = 0
}

onMounted(() => {
  void initViewer()
})

onActivated(() => {
  // keep-alive 再次激活时重建（deactivated 里已经销毁）
  if (!viewer.value) {
    void initViewer()
  }
})

onDeactivated(() => {
  disposeViewer()
})

onBeforeUnmount(() => {
  disposeViewer()
})
</script>

<template>
  <div class="cesium-demo">
    <header class="cesium-demo__header">
      <div>
        <h2 class="cesium-demo__title">Cesium 三维场景</h2>
        <p class="cesium-demo__desc">
          CesiumJS 仅在进入本页时才异步加载，普通页面首屏不包含其体积。
        </p>
      </div>
      <NSpace align="center" :size="8">
        <NTag size="small" :bordered="false" type="info">状态：{{ loadState }}</NTag>
        <NTag v-if="elapsed > 0" size="small" :bordered="false">首次加载耗时 {{ elapsed }} ms</NTag>
      </NSpace>
    </header>

    <NAlert
      v-if="errorMessage"
      type="error"
      title="Cesium 初始化失败"
      closable
      @close="errorMessage = ''"
    >
      <p>{{ errorMessage }}</p>
      <p class="cesium-demo__hint">
        常见原因：静态资源前缀配置错误（当前为
        <code>{{ cesiumBaseUrl }}</code>
        ）、Worker 文件 MIME 类型不正确、 或容器尺寸为 0。详见 README「Cesium 按需加载」。
      </p>
      <NButton size="small" type="primary" @click="initViewer">重新加载</NButton>
    </NAlert>

    <div class="cesium-demo__toolbar">
      <NSpace :size="8">
        <NButton size="small" type="primary" :disabled="!viewer" @click="addMarker">
          <template #icon><AppIcon name="MapPin" /></template>
          添加标记
        </NButton>
        <NButton size="small" :disabled="!viewer" @click="resetCamera">
          <template #icon><AppIcon name="Globe" /></template>
          回到默认视角
        </NButton>
        <NButton size="small" :disabled="!viewer || markerCount === 0" @click="clearMarkers">
          <template #icon><AppIcon name="Trash2" /></template>
          清空标记
        </NButton>
      </NSpace>
      <span class="cesium-demo__counter">当前实体：{{ markerCount }}</span>
    </div>

    <div class="cesium-demo__stage">
      <div ref="containerRef" class="cesium-demo__canvas" />
      <div v-if="loading" class="cesium-demo__mask">
        <NSpin size="large" />
        <p>正在加载 Cesium 运行时…</p>
        <p class="cesium-demo__hint">首次加载需要下载数 MB 的三维引擎，之后会走浏览器缓存。</p>
      </div>
    </div>

    <section class="cesium-demo__notes">
      <h3>本页验证了什么</h3>
      <ul>
        <li>Viewer 延迟创建，且同一容器不会出现两个实例（重复进入会先销毁旧的）。</li>
        <li>离开页面时销毁 Viewer，释放 WebGL 上下文、实体、数据源与影像图层。</li>
        <li>底图使用包内置瓦片，不依赖 Cesium Ion，因此离线环境也能出图。</li>
        <li>
          资源前缀来自
          <code>VITE_CESIUM_BASE_URL</code>
          ，支持 CDN 与子路径部署。
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/variables.scss' as v;
@use '@/assets/styles/mixins.scss' as m;

.cesium-demo {
  display: flex;
  flex-direction: column;
  gap: v.$gap-md;
  height: 100%;
  padding: v.$gap-lg;

  &__header {
    display: flex;
    flex-wrap: wrap;
    gap: v.$gap-md;
    align-items: center;
    justify-content: space-between;
  }

  &__title {
    margin: 0;
    font-size: v.$font-size-lg;
    font-weight: 600;
  }

  &__desc {
    margin: v.$gap-xs 0 0;
    font-size: v.$font-size-sm;
    color: var(--app-color-text-secondary);
  }

  &__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: v.$gap-sm;
    align-items: center;
    justify-content: space-between;
  }

  &__counter {
    font-size: v.$font-size-sm;
    color: var(--app-color-text-secondary);
  }

  &__stage {
    position: relative;
    flex: 1;
    min-height: 420px;
    overflow: hidden;
    background: var(--app-color-surface-secondary);
    border: 1px solid var(--app-color-border);
    border-radius: v.$radius-lg;
  }

  &__canvas {
    width: 100%;
    height: 100%;
  }

  &__mask {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    gap: v.$gap-sm;
    align-items: center;
    justify-content: center;
    background: var(--app-color-surface);
  }

  &__hint {
    max-width: 520px;
    font-size: v.$font-size-xs;
    line-height: 1.6;
    color: var(--app-color-text-tertiary);
  }

  &__notes {
    padding: v.$gap-md;
    background: var(--app-color-surface);
    border: 1px solid var(--app-color-border);
    border-radius: v.$radius-lg;

    h3 {
      margin: 0 0 v.$gap-sm;
      font-size: v.$font-size-md;
    }

    ul {
      padding-left: 1.2em;
      margin: 0;
      font-size: v.$font-size-sm;
      line-height: 1.8;
      color: var(--app-color-text-secondary);
    }

    code {
      padding: 0 4px;
      font-size: v.$font-size-xs;
      background: var(--app-color-surface-secondary);
      border-radius: 4px;
    }
  }
}
</style>
