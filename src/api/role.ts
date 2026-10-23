/**
 * 角色管理接口
 *
 * 与 user.ts 保持同样的写法：
 *  - 分页接口统一接收「查询参数 + AbortSignal」，方便 usePagination 做取消；
 *  - 分页响应统一交给 normalizePagination 做字段兼容，页面不重复解析。
 */

import { http } from '@/utils/http'
import { normalizePagination } from '@/utils/response-adapter'
import type { PaginationResult } from '@/types/pagination'
import type {
  CreateRoleParams,
  QueryRoleParams,
  SystemRole,
  UpdateRoleParams,
} from '@/types/entity'

/** 角色分页列表 */
export async function fetchRolePage(
  params: QueryRoleParams,
  signal?: AbortSignal,
): Promise<PaginationResult<SystemRole>> {
  const raw = await http.get<unknown>('/system/roles', {
    query: {
      pageNum: params.pageNum,
      pageSize: params.pageSize,
      keyword: params.keyword,
      status: params.status,
    },
    signal,
  })
  return normalizePagination<SystemRole>(raw, {
    pageNum: params.pageNum,
    pageSize: params.pageSize,
  })
}

/** 新增角色 */
export function createRole(params: CreateRoleParams): Promise<SystemRole> {
  return http.post<SystemRole>('/system/roles', { body: params })
}

/** 编辑角色 */
export function updateRole(params: UpdateRoleParams): Promise<SystemRole> {
  const { id, ...rest } = params
  return http.put<SystemRole>(`/system/roles/${id}`, { body: rest })
}

/** 删除角色 */
export function deleteRole(id: number): Promise<null> {
  return http.delete<null>(`/system/roles/${id}`)
}
