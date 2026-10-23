/**
 * 分页类型定义
 *
 * 不同后端的分页字段命名差异很大：
 *   - 列表主体：records / list / items / rows / content
 *   - 总数：total / totalCount / count / totalElements
 *   - 页码：pageNum / page / current / pageNumber / pageIndex
 *   - 每页条数：pageSize / size / limit / rows
 *
 * 业务层统一使用本项目约定；真实字段名通过 `src/utils/response-adapter.ts`
 * 做一次性适配，禁止在每个页面重复解析。
 */

/** 排序方向 */
export type SortOrder = 'asc' | 'desc'

/** 分页请求参数（本项目内部统一约定） */
export interface PaginationParams {
  /** 页码，从 1 开始 */
  pageNum: number
  /** 每页条数 */
  pageSize: number
  /** 排序字段 */
  sortBy?: string
  /** 排序方向 */
  sortOrder?: SortOrder
}

/** 分页响应结果（本项目内部统一约定） */
export interface PaginationResult<T> {
  /** 当前页数据 */
  records: T[]
  /** 总记录数 */
  total: number
  /** 当前页码 */
  pageNum: number
  /** 每页条数 */
  pageSize: number
  /** 总页数，由适配层补全 */
  totalPages: number
}

/** 列表字段的常见别名，适配层按顺序尝试读取 */
export const LIST_FIELD_ALIASES = ['records', 'list', 'items', 'rows', 'content'] as const

/** 总数字段的常见别名 */
export const TOTAL_FIELD_ALIASES = ['total', 'totalCount', 'count', 'totalElements'] as const

/** 页码字段的常见别名 */
export const PAGE_NUM_FIELD_ALIASES = [
  'pageNum',
  'page',
  'current',
  'pageNumber',
  'pageIndex',
] as const

/** 每页条数字段的常见别名 */
export const PAGE_SIZE_FIELD_ALIASES = ['pageSize', 'size', 'limit', 'rows'] as const

/** 计算总页数 */
export function calcTotalPages(total: number, pageSize: number): number {
  if (pageSize <= 0) {
    return 0
  }
  return Math.ceil(total / pageSize)
}
