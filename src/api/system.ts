/**
 * 系统级接口
 *
 * 用于首页概览、字典、系统配置等非业务实体的读取场景。
 */

import { http } from '@/utils/http'
import type { DashboardOverview } from '@/types/entity'

/** 首页概览数据 */
export function fetchDashboardOverview(options?: {
  signal?: AbortSignal
}): Promise<DashboardOverview> {
  return http.get<DashboardOverview>('/system/overview', { signal: options?.signal })
}
