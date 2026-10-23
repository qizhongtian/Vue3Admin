/**
 * Vite 构建配置
 *
 * 重要说明
 * --------
 * 本项目使用 **Vite 8**，其底层打包器是 **Rolldown**（不是 Rollup）。
 * 因此这里使用的是 Vite 8 的正式配置项 `build.rolldownOptions`：
 *   - `build.rollupOptions` 在 Vite 8 中已标记为 deprecated，仅为兼容别名；
 *   - Rolldown 的手动分包字段是 `output.codeSplitting`，
 *     而非 Rollup 的 `output.manualChunks`（Rolldown 中 manualChunks /
 *     advancedChunks 均已废弃，且 manualChunks 只支持函数形式）。
 * 不要把两套配置混用。
 */

import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
/**
 * 导入来源说明（这是一个真实的踩坑点）：
 *  - `defineConfig` 必须从 `vitest/config` 取，才能给 `test` 字段提供类型；
 *    它是 Vite `UserConfig` 的超集。
 *  - 但 `vitest/config` **不导出** `loadEnv`、`UserConfig`，
 *    这些必须仍然从 `vite` 导入，否则运行期会报
 *    “does not provide an export named 'loadEnv'”。
 */
import { loadEnv, type UserConfig } from 'vite'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { visualizer } from 'rollup-plugin-visualizer'
import { cesiumAssetsPlugin } from './build/cesium-assets-plugin.ts'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

/** 读取为布尔值，'true' / '1' 视为 true */
function toBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') {
    return fallback
  }
  return value === 'true' || value === '1'
}

/** 去掉 target 结尾多余的斜杠，避免代理时出现双斜杠 */
function normalizeTarget(target: string): string {
  return target.replace(/\/+$/, '')
}

export default defineConfig(({ mode }): UserConfig => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  const appEnv = env.VITE_APP_ENV ?? mode
  const baseUrl = env.VITE_BASE_URL ?? '/'
  const apiBaseUrl = env.VITE_API_BASE_URL ?? '/api'
  const cesiumBaseUrl = env.VITE_CESIUM_BASE_URL ?? '/cesium/'
  const useMock = toBoolean(env.VITE_USE_MOCK, mode === 'development')
  // VITE_ENABLE_CONSOLE / VITE_REQUEST_TIMEOUT / VITE_MOCK_DELAY 只由运行时
  // （src/utils/logger.ts、src/utils/http-client.ts、src/mock）通过 import.meta.env 读取，
  // 构建配置不参与，因此这里不再重复解析。
  const proxyTarget = normalizeTarget(env.VITE_PROXY_TARGET ?? 'http://127.0.0.1:8080')
  const proxyRewrite = toBoolean(env.VITE_PROXY_REWRITE, true)
  const isProduction = appEnv === 'production'
  const analyze = mode === 'analyze' || process.env.ANALYZE === 'true'
  /**
   * 生产环境 sourcemap 改为**按需开启**（默认关闭）。
   *
   * 之前是固定 `'hidden'`：浏览器不加载，但 .map 文件仍会被写进 dist 并随静态
   * 站点一起发布 —— 本项目 dist 约 57 MB，其中 41 MB 是 sourcemap（占 72%），
   * 而且 nginx.conf 没有拦截 *.map，等于把完整源码挂在公网路径下。
   *
   * 需要错误监控还原堆栈时（CI 里）显式设置 VITE_BUILD_SOURCEMAP=true，
   * 构建后把 *.map 上传到监控平台，再从部署目录中删除即可。
   */
  const buildSourceMap: boolean | 'hidden' = isProduction
    ? toBoolean(env.VITE_BUILD_SOURCEMAP)
      ? 'hidden'
      : false
    : true

  return {
    base: baseUrl,

    plugins: [
      vue(),
      cesiumAssetsPlugin({ baseUrl: cesiumBaseUrl }),
      // 仅在显式执行 pnpm build:analyze 时挂载，避免影响常规构建
      ...(analyze
        ? [
            visualizer({
              filename: 'dist/stats.html',
              title: '构建产物体积分析',
              template: 'treemap',
              gzipSize: true,
              brotliSize: true,
            }),
          ]
        : []),
    ],

    resolve: {
      alias: {
        '@': path.resolve(rootDir, 'src'),
      },
      // 避免同一个依赖被打包多份
      dedupe: ['vue', 'vue-router', 'pinia'],
    },

    define: {
      // 把少量构建期元信息注入运行时，便于线上排障时确认产物版本
      __APP_ENV__: JSON.stringify(appEnv),
      __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      __APP_USE_MOCK__: JSON.stringify(useMock),
    },

    css: {
      devSourcemap: !isProduction,
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
          /**
           * 说明：这里**刻意没有**使用 additionalData 全局注入 `@use`。
           * additionalData 会被拼到每一个 scss 文件头部，包括 variables.scss 自身，
           * 一旦打开就会形成 Sass 循环依赖导致构建失败。
           * 因此改为在需要的组件里显式 `@use '@/assets/styles/variables.scss' as v;`。
           */
        },
      },
      modules: {
        generateScopedName: '[local]_[hash:base64:5]',
      },
    },

    server: {
      port: 5173,
      strictPort: false,
      host: true,
      open: false,
      proxy: useMock
        ? undefined
        : {
            [apiBaseUrl]: {
              target: proxyTarget,
              changeOrigin: true,
              // 默认剥掉前端前缀再转发，避免后端收到重复前缀 /api/api/**
              rewrite: proxyRewrite
                ? (p: string) => p.replace(new RegExp(`^${apiBaseUrl}`), '')
                : undefined,
            },
          },
    },

    preview: {
      port: 4173,
      host: true,
    },

    optimizeDeps: {
      // 注意：不要把 cesium 加入 exclude。
      // 排除预构建后，cesium 的 CommonJS 依赖（如 mersenne-twister）无法被
      // 转换成 ESM，开发环境会报 "does not provide an export named 'default'"。
      // cesium 只被动态 import 引用，预构建不会影响「不进首屏」的目标。
      include: ['vue', 'vue-router', 'pinia', 'ofetch', 'echarts'],
    },

    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      // 小于 4KB 的资源内联；避免大量小文件请求，同时不把大图塞进 JS
      assetsInlineLimit: 4096,
      // 生产默认不出 sourcemap（见上方 buildSourceMap 说明），需要时用
      // VITE_BUILD_SOURCEMAP=true 打开；开发环境始终生成便于调试
      sourcemap: buildSourceMap,
      cssCodeSplit: true,
      cssMinify: 'lightningcss',
      minify: 'oxc',
      // Rolldown 不会产生过多碎片，这里放宽警告阈值到 700KB
      chunkSizeWarningLimit: 700,
      reportCompressedSize: false,
      emptyOutDir: true,

      rolldownOptions: {
        output: {
          /**
           * 手动分包（Rolldown 原生写法）。
           * 注意：分组依据应当来自真实依赖关系，而不是机械地按包名罗列。
           */
          codeSplitting: {
            // 小于此体积的 chunk 会被合并，抑制碎片化
            minSize: 20 * 1024,
            groups: [
              /**
               * 这里**刻意没有**给 cesium 建 manualChunk 分组。
               *
               * 实测教训（Vite 8 + Rolldown）：
               * 一旦把 cesium 配成 minSize: 0 的独立分组，Rolldown 会把入口与
               * cesium 共享的 preload 辅助模块塞进这个分组 chunk，
               * 于是入口对它产生了**静态 import**，index.html 里就出现
               *   <link rel="modulepreload" href="/assets/cesium-*.js">
               * 结果是首屏白下载 4.9 MB，恰好破坏了「Cesium 不进首屏」的目标。
               *
               * 而 cesium 本身只被 `import('cesium')` 动态引用，
               * 打包器天然会把它切成独立 chunk、只在进入三维页时才请求，
               * 根本不需要手动分组。**分包配置并不能让 Cesium 变小，
               * 能不让它变小的是「不加载」。**
               */
              {
                name: 'naive-ui',
                test: /node_modules[\\/](naive-ui|css-render|@css-render|seemly|treemate|vdirs|vooks|date-fns)[\\/]/,
                priority: 30,
              },
              {
                name: 'echarts',
                test: /node_modules[\\/](echarts|zrender)[\\/]/,
                priority: 30,
              },
              {
                name: 'vue-vendor',
                test: /node_modules[\\/](vue|@vue|vue-router|pinia|@vueuse)[\\/]/,
                priority: 20,
              },
              {
                name: 'icons',
                test: /node_modules[\\/]lucide-vue-next[\\/]/,
                priority: 20,
              },
              /**
               * 这里**刻意没有**建立 `/node_modules/` 的兜底分组。
               *
               * 踩过的坑：兜底分组会把 Cesium 的**传递依赖**（@zip.js/zip.js、
               * autolinker、meshoptimizer、urijs、topojson-client、
               * @spz-loader/core、nosleep.js 等，合计约 1 MB）吸进来，
               * 而入口本身因为 lucide 静态依赖这个分组 —— 结果 index.html 里出现
               *   <link rel="modulepreload" href="/assets/vendor-*.js">
               * 首屏白白下载 1 MB 与三维毫无关系的代码。
               *
               * 只用上面的**白名单式**分组（naive-ui / echarts / vue-vendor /
               * icons），其余依赖交给 Rolldown 默认分包：
               *  - 被入口静态引用的依赖会并入 index 或它的同步依赖；
               *  - 只被动态 import 引用的（如 cesium 及其传递依赖）天然落进
               *    异步 chunk，只在真正进入三维页时才请求。
               * 这样既不需要维护一份「Cesium 依赖黑名单」（随 cesium 版本递增极易腐化），
               * 也避免了入口对无关 chunk 产生静态导入。
               */
            ],
          },
        },
      },
    },

    test: {
      environment: 'jsdom',
      // 不使用 globals，统一从 vitest 显式导入，避免类型污染
      globals: false,
      include: ['tests/**/*.spec.ts'],
      exclude: ['node_modules/**', 'dist/**'],
      setupFiles: ['./tests/setup.ts'],
      clearMocks: true,
      restoreMocks: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        reportsDirectory: './dist/coverage',
        include: ['src/**/*.{ts,vue}'],
        exclude: [
          'src/main.ts',
          'src/mock/**',
          'src/modules/cesium/**',
          'src/types/**',
          'src/**/*.d.ts',
        ],
      },
    },

    // 让单元测试与业务代码共享同一份环境变量
    envPrefix: 'VITE_',
  }
})
