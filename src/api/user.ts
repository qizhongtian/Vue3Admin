/**
 * 用户管理接口
 *
 * 返回类型已经是「拆过信封」的业务数据：
 * http 层负责解析 { code, message, data } 并把 data 交回来，
 * 这里只需要把后端结构翻译成 `src/types/entity.ts` 的约定。
 */

import { http } from '@/utils/http'
import { normalizePagination } from '@/utils/response-adapter'
import type { PaginationResult } from '@/types/pagination'
import type {
  CreateUserParams,
  QueryUserParams,
  SystemUser,
  UpdateUserParams,
} from '@/types/entity'

/** 用户分页列表 */
export async function fetchUserPage(
  params: QueryUserParams,
  signal?: AbortSignal,
): Promise<PaginationResult<SystemUser>> {
  const raw = await http.get<unknown>('/system/users', {
    query: {
      pageNum: params.pageNum,
      pageSize: params.pageSize,
      keyword: params.keyword,
      status: params.status,
    },
    // 透传取消信号，页面卸载时才能真正中断而不是只在结果层面丢弃
    signal,
  })
  // 兼容 list / records / total 等命名差异
  return normalizePagination<SystemUser>(raw, {
    pageNum: params.pageNum,
    pageSize: params.pageSize,
  })
}

/** 新增用户 */
export function createUser(params: CreateUserParams): Promise<SystemUser> {
  return http.post<SystemUser>('/system/users', { body: params })
}

/** 编辑用户 */
export function updateUser(params: UpdateUserParams): Promise<SystemUser> {
  const { id, ...rest } = params
  return http.put<SystemUser>(`/system/users/${id}`, { body: rest })
}

/** 删除用户 */
export function deleteUser(id: number): Promise<null> {
  return http.delete<null>(`/system/users/${id}`)
}
