/**
 * 运行时配置加载
 *
 * 解决的问题：同一份构建产物需要部署到多个环境时，
 * 重新为每个环境跑一次构建既低效又容易出错。
 *
 * 方案：应用启动阶段（挂载之前）尝试读取站点根目录下的 `config.json`，
 * 用其中的字段覆盖构建期配置。
 *
 * 约束：
 *  - 只允许覆盖白名单字段（API 地址、Cesium 资源地址），
 *    不允许运行时改写任意配置，否则相当于给页面开了个后门；
 *  - 必须在挂载前完成，否则先发出的请求用的还是旧地址；
 *  - 加载失败要静默降级：本地开发没有这个文件是正常情况，不能阻断启动；
 *  - config.json 必须允许被短期篡改 CDN 缓存（Nginx 侧设置 Cache-Control: no-cache）。
 */

import { applyRuntimeConfig, type RuntimeConfigFile } from '@/config/env'
import { createLogger } from '@/utils/logger'

const logger = createLogger('runtime-config')

/** 运行时配置文件名（相对于部署基础路径） */
export const RUNTIME_CONFIG_FILE = 'config.json'

/** 允许出现的字段白名单 */
const ALLOWED_KEYS: ReadonlyArray<keyof RuntimeConfigFile> = ['apiBaseUrl', 'cesiumBaseUrl']

function pickAllowed(raw: unknown): RuntimeConfigFile {
  if (raw === null || typeof raw !== 'object') {
    return {}
  }
  const source = raw as Record<string, unknown>
  const result: RuntimeConfigFile = {}
  for (const key of ALLOWED_KEYS) {
    const value = source[key]
    if (typeof value === 'string' && value.trim() !== '') {
      // 只接受字符串，避免运行时把地址改成非预期类型
      Object.assign(result, { [key]: value.trim() })
    }
  }
  return result
}

/**
 * 加载并应用运行时配置。
 * 必须在应用挂载前 await。
 */
export async function loadRuntimeConfig(): Promise<void> {
  const url = `${import.meta.env.BASE_URL ?? '/'}${RUNTIME_CONFIG_FILE}`.replace(/\/{2,}/g, '/')

  try {
    const response = await fetch(url, {
      cache: 'no-cache',
      headers: { Accept: 'application/json' },
    })

    // 404 属于「没启用运行时配置」，静默跳过
    if (!response.ok) {
      logger.debug(`未检测到运行时配置 ${url}，沿用构建期配置`)
      return
    }

    const raw: unknown = await response.json()
    const config = pickAllowed(raw)
    if (Object.keys(config).length === 0) {
      return
    }
    applyRuntimeConfig(config)
    logger.info('运行时配置已应用', config)
  } catch {
    // 任何异常都不应阻断启动 —— 构建期配置仍然是有效的兜底
    logger.debug('运行时配置加载失败，沿用构建期配置')
  }
}
