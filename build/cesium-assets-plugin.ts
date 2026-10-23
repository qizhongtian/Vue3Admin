/**
 * Cesium 静态资源处理插件
 *
 * 背景
 * ----
 * Cesium 运行时除了 JS 之外，还需要在运行期按相对路径去请求一批静态资源：
 *   Workers/      Web Worker 脚本（含地形/模型解码）
 *   Assets/       近似大地水准面、投影查找表等数据
 *   Widgets/      控件样式与图片
 *   ThirdParty/   draco 解码器等第三方运行时
 *
 * Cesium 内部通过 `CESIUM_BASE_URL + 相对路径` 拼接这些资源的地址。
 * 若该基础路径在部署产物中并不真实存在，页面就会大量出现 Worker / Asset 404。
 *
 * 本插件负责两件事：
 *   1. 开发态：把 node_modules 里的 Cesium 静态资源挂载到 VITE_CESIUM_BASE_URL 上直接提供服务；
 *   2. 构建态：把这些资源拷贝到产物目录下的对应位置，支持根目录与子目录部署。
 *
 * 设计约束
 * --------
 * - 不依赖第三方 copy 插件，避免与其构建工具（此处为 Rolldown）出现兼容性问题；
 * - 当 VITE_CESIUM_BASE_URL 指向完整 CDN 地址（http/https）时，跳过拷贝；
 * - cesium 是可选依赖，未安装时静默降级为空插件，不影响普通后台页面构建。
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { createRequire } from 'node:module'
import type { Plugin } from 'vite'

/** Cesium 运行期需要按相对路径请求的目录 */
const CESIUM_ASSET_DIRS = ['Workers', 'Assets', 'Widgets', 'ThirdParty'] as const

/** 常见扩展名到 MIME 的映射，避免 Nginx / dev server 返回错误类型导致 Worker 无法加载 */
const MIME_MAP: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ktx2': 'application/octet-stream',
  '.drc': 'application/octet-stream',
  '.terrain': 'application/octet-stream',
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

function guessMime(filePath: string): string {
  return MIME_MAP[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

/** 递归拷贝目录 */
function copyDir(src: string, dest: string): number {
  let copied = 0
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copied += copyDir(srcPath, destPath)
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath)
      copied += 1
    }
  }
  return copied
}

/**
 * 解析 cesium 包内的静态资源根目录。
 * 现代 Cesium 发布包内置预构建产物，位于 <pkg>/Build/Cesium。
 */
function resolveCesiumStaticDir(root: string): string | null {
  try {
    const require = createRequire(path.join(root, 'package.json'))
    const pkgJsonPath = require.resolve('cesium/package.json')
    const candidates = [
      path.join(path.dirname(pkgJsonPath), 'Build', 'Cesium'),
      path.join(path.dirname(pkgJsonPath), 'Build'),
    ]
    for (const dir of candidates) {
      if (fs.existsSync(path.join(dir, 'Workers'))) {
        return dir
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * 把 `/cesium/` 这样的 URL 前缀转换成产物内的相对路径 `cesium`。
 * 完整 CDN 地址返回 null，表示无需拷贝。
 */
function toRelativeOutDir(cesiumBaseUrl: string): string | null {
  if (/^https?:\/\//i.test(cesiumBaseUrl)) {
    return null
  }
  const normalized = cesiumBaseUrl.replace(/^\/+/, '').replace(/\/+$/, '')
  return normalized.length > 0 ? normalized : ''
}

export interface CesiumAssetsOptions {
  /** Cesium 静态资源前缀，取自 VITE_CESIUM_BASE_URL */
  baseUrl: string
}

export function cesiumAssetsPlugin(options: CesiumAssetsOptions): Plugin {
  const { baseUrl } = options
  let cesiumDir: string | null = null
  let resolvedRoot = process.cwd()
  let outDir = path.resolve(process.cwd(), 'dist')
  let warned = false

  return {
    name: 'app:cesium-assets',

    enforce: 'post',

    configResolved(config) {
      resolvedRoot = config.root ?? process.cwd()
      outDir = path.resolve(resolvedRoot, config.build.outDir ?? 'dist')
      cesiumDir = resolveCesiumStaticDir(resolvedRoot)
      if (!cesiumDir && !warned) {
        warned = true
        config.logger.warn(
          '[cesium-assets] 未检测到 cesium 包，已跳过 Cesium 静态资源处理。' +
            '如需使用三维页面，请执行 pnpm add cesium 后重启开发服务器。',
        )
      }
    },

    /**
     * 开发态：注册静态资源中间件。
     *
     * 注意必须**直接**在 configureServer 里注册（前置），
     * 而不是通过返回函数注册到 Vite 内部中间件之后：
     * appType 为 spa 时，Vite 的 htmlFallback / indexHtml 中间件会把
     * 所有未被前面中间件命中的 GET 请求兜底成 index.html，
     * 后置注册的中间件永远拿不到 /cesium/** 请求，
     * 导致影像与 Worker 资源全部返回 HTML（表现为图片无法解码、Worker 加载失败）。
     *
     * 这里按前缀精确匹配且要求文件真实存在，不会影响普通页面请求。
     */
    configureServer(server) {
      if (!cesiumDir) {
        return
      }
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url ?? ''
        if (!rawUrl.startsWith(baseUrl)) {
          next()
          return
        }
        if (!cesiumDir) {
          next()
          return
        }
        const relative = decodeURIComponent(rawUrl.slice(baseUrl.length).split('?')[0] ?? '')
        if (!relative) {
          next()
          return
        }
        const filePath = path.resolve(cesiumDir, relative)
        // 防目录穿越
        if (!filePath.startsWith(path.resolve(cesiumDir))) {
          next()
          return
        }
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          next()
          return
        }
        res.setHeader('Content-Type', guessMime(filePath))
        res.setHeader('Cache-Control', 'no-cache')
        fs.createReadStream(filePath).pipe(res)
      })
    },

    /** 构建态：把静态资源拷贝到产物目录 */
    writeBundle() {
      if (!cesiumDir) {
        return
      }
      const relativeOut = toRelativeOutDir(baseUrl)
      if (relativeOut === null) {
        this.warn(
          `[cesium-assets] Cesium 资源前缀是 CDN 地址（${baseUrl}），已跳过本地拷贝，请确认 CDN 上已同步 Workers/Assets/Widgets/ThirdParty。`,
        )
        return
      }

      const targetRoot = relativeOut ? path.join(outDir, relativeOut) : outDir
      let total = 0

      for (const dir of CESIUM_ASSET_DIRS) {
        const src = path.join(cesiumDir, dir)
        if (!fs.existsSync(src)) {
          continue
        }
        total += copyDir(src, path.join(targetRoot, dir))
      }

      if (total > 0) {
        this.info(
          `[cesium-assets] 已拷贝 ${total} 个 Cesium 静态资源到 ${path.relative(resolvedRoot, targetRoot) || '.'}`,
        )
      }
    },
  }
}
