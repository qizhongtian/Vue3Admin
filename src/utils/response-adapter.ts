/**
 * 后端响应适配器
 *
 * 唯一职责：把千奇百怪的后端结构翻译成本项目内部约定。
 *
 * 之所以单独成文件：
 *  - 纯函数、零副作用、零依赖，方便单元测试；
 *  - 不被 http 的错误处理逻辑污染，登录/刷新等旁路通道也能复用；
 *  - 避免在每个业务页面里重复解析 `res.data.list ?? res.data.records`。
 */

import { isSuccessCode, type ApiResponse } from '@/types/api'
import {
  calcTotalPages,
  LIST_FIELD_ALIASES,
  PAGE_NUM_FIELD_ALIASES,
  PAGE_SIZE_FIELD_ALIASES,
  TOTAL_FIELD_ALIASES,
  type PaginationParams,
  type PaginationResult,
} from '@/types/pagination'

/** 成功时后端返回的业务数据 */
interface UnwrapResult<T> {
  /** 是否业务成功 */
  success: boolean
  /** 业务数据（失败时为 undefined） */
  data: T | undefined
  /** 业务错误码 */
  code: string | number | undefined
  /** 业务提示语 */
  message: string
  /** 原始响应体，便于排查 */
  raw: unknown
}

function readAlias(source: Record<string, unknown>, aliases: readonly string[]): unknown {
  for (const alias of aliases) {
    const value = source[alias]
    if (value !== undefined) {
      return value
    }
  }
  return undefined
}

/**
 * 拆信封：把 `ApiResponse<T>` 解析为统一结构。
 *
 * 兼容两种情况：
 *  - 标准信封：{ code, message, data }
 *  - 裸数据：后端直接返回数据本体（此时视为成功）
 */
export function unwrapResponse<T>(raw: unknown): UnwrapResult<T> {
  if (raw === null || raw === undefined) {
    return { success: false, data: undefined, code: undefined, message: '响应数据为空', raw }
  }

  if (typeof raw !== 'object') {
    return { success: true, data: raw as unknown as T, code: undefined, message: '', raw }
  }

  const candidate = raw as Record<string, unknown>

  // 判断是否标准信封：必须同时具备 code 且 data 存在（或明确为 null）
  if ('code' in candidate && 'data' in candidate) {
    const response = raw as unknown as ApiResponse<T>
    const success = isSuccessCode(response.code)
    return {
      success,
      data: success ? response.data : undefined,
      code: response.code,
      message: typeof response.message === 'string' ? response.message : '',
      raw,
    }
  }

  // 裸数据，视为成功
  return { success: true, data: raw as unknown as T, code: undefined, message: '', raw }
}

/**
 * 把任意来源的分页响应翻译成本项目约定结构。
 *
 * 兼容的字段名见 `src/types/pagination.ts` 中的别名表。
 */
export function normalizePagination<T>(
  raw: unknown,
  fallbackParams: Pick<PaginationParams, 'pageNum' | 'pageSize'>,
): PaginationResult<T> {
  const pageNumDefault = fallbackParams.pageNum
  const pageSizeDefault = fallbackParams.pageSize

  const empty: PaginationResult<T> = {
    records: [],
    total: 0,
    pageNum: pageNumDefault,
    pageSize: pageSizeDefault,
    totalPages: 0,
  }

  if (raw === null || raw === undefined) {
    return empty
  }

  // 直接就是数组的情况
  if (Array.isArray(raw)) {
    return {
      records: raw as T[],
      total: raw.length,
      pageNum: pageNumDefault,
      pageSize: pageSizeDefault,
      totalPages: 1,
    }
  }

  if (typeof raw !== 'object') {
    return empty
  }

  const source = raw as Record<string, unknown>

  const recordsRaw = readAlias(source, LIST_FIELD_ALIASES)
  const records = Array.isArray(recordsRaw) ? (recordsRaw as T[]) : []

  const totalRaw = readAlias(source, TOTAL_FIELD_ALIASES)
  const total = typeof totalRaw === 'number' ? totalRaw : Number(totalRaw ?? 0) || 0

  const pageNumRaw = readAlias(source, PAGE_NUM_FIELD_ALIASES)
  const pageNum =
    typeof pageNumRaw === 'number'
      ? pageNumRaw
      : Number(pageNumRaw ?? pageNumDefault) || pageNumDefault

  const pageSizeRaw = readAlias(source, PAGE_SIZE_FIELD_ALIASES)
  const pageSize =
    typeof pageSizeRaw === 'number'
      ? pageSizeRaw
      : Number(pageSizeRaw ?? pageSizeDefault) || pageSizeDefault

  return {
    records,
    total,
    pageNum,
    pageSize,
    totalPages: calcTotalPages(total, pageSize),
  }
}
