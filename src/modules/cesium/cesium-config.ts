/**
 * Cesium 运行时配置
 *
 * ============================ 资源路径说明 ============================
 *
 * Cesium 除了 JS 之外，还依赖四类**静态资源**：
 *   Workers/     —— 地形、影像、3D Tiles 解析用的 Web Worker（数量最多）
 *   Assets/      —— 内置影像贴图、星图、IAU 数据等
 *   Widgets/     —— 控件样式与图标
 *   ThirdParty/  —— draco 解码器等第三方 wasm/js
 *
 * 这些资源**不能**被打包进 JS bundle，必须作为独立静态文件部署，
 * 并在运行时通过 `window.CESIUM_BASE_URL` 告诉 Cesium 去哪里取。
 *
 * 本项目采用「构建期复制 + 运行时前缀」的方案（见 build/cesium-assets-plugin.ts）：
 *   1. 构建时把 node_modules/cesium/Build/Cesium 下的四个目录复制到 dist/<cesium 前缀>；
 *   2. 开发时由插件的中间件直接以该前缀提供文件，不需要先复制；
 *   3. 运行时在动态 import('cesium') **之前**设置 window.CESIUM_BASE_URL。
 *
 * 这样做的原因：
 *   - 换成 CDN 只需把 VITE_CESIUM_BASE_URL 改成完整 URL，插件会自动跳过复制；
 *   - 子路径部署时，前缀会与 VITE_BASE_URL 拼接，不会出现 /app/cesium 却请求 /cesium 的 404；
 *   - 只复制一次，不会出现「多个插件各自复制一份」的重复产物。
 */

import { envConfig } from '@/config/env'

/** 拼接后的 Cesium 静态资源基地址（带结尾斜杠） */
export function resolveCesiumBaseUrl(): string {
  const raw = envConfig.cesiumBaseUrl

  // 完整 URL（CDN）直接使用，不做任何拼接
  if (/^https?:\/\//i.test(raw)) {
    return raw.endsWith('/') ? raw : `${raw}/`
  }

  const base = envConfig.baseUrl
  const assetPath = raw.replace(/^\/+/, '')
  const joined = `${base}${assetPath}`
  return joined.endsWith('/') ? joined : `${joined}/`
}

/**
 * 默认 Viewer 选项。
 *
 * 关闭的项都有实际原因，不是随手关的：
 *  - animation / timeline / geocoder / homeButton 等控件在演示页无用，减少首屏 DOM；
 *  - `baseLayerPicker: false` 必须关掉，否则它在初始化时要请求 Ion 服务；
 *  - `requestRenderMode: true` 让 Cesium 只在需要时渲染，静态场景下 GPU 占用大幅下降，
 *    代价是主动改场景后需要调用 `scene.requestRender()`。
 */
export const DEFAULT_VIEWER_OPTIONS = {
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  infoBox: true,
  selectionIndicator: false,
  shouldAnimate: false,
  requestRenderMode: true,
  maximumRenderTimeChange: Number.POSITIVE_INFINITY,
} as const

/**
 * 离线可用的内置影像。
 *
 * Cesium 自带一套低分辨率 NaturalEarthII 瓦片（就在 Assets 目录里），
 * 使用它可以让演示页在**完全无网络**的情况下正常出图；
 * 生产环境换成自己的影像服务时，替换这个描述即可。
 */
export const LOCAL_IMAGERY = {
  /** TMS 瓦片的相对路径（相对 CESIUM_BASE_URL） */
  url: 'Assets/Textures/NaturalEarthII',
  /** 瓦片等级上限，内置瓦片只到 2 级 */
  maximumLevel: 2,
} as const

/** 相机初始位置：中国区域概览 */
export const DEFAULT_CAMERA = {
  longitude: 104.0,
  latitude: 31.0,
  height: 12_000_000,
} as const
