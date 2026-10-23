/**
 * Mock 服务端实现
 *
 * 设计约束：
 *  1. 与真实接口遵守**同一套** `/src/types` 响应协议，切换真实后端时业务页面零改动；
 *  2. 通过给 ofetch 注入自定义 fetch 实现来接管请求，业务代码完全无感知；
 *  3. 必须能模拟这些真实场景：登录失败、Token 过期、Refresh 失败、
 *     并发 401、不同角色菜单差异、按钮权限差异、分页搜索、服务端错误、网络异常。
 *
 * 下面是用于验证各种边界的「开关」，方便在 UI 与测试中复现问题：
 *  - 请求头 `x-mock-scenario: server-error`   -> 返回 500
 *  - 请求头 `x-mock-scenario: network-error`  -> 抛出网络异常
 *  - 请求头 `x-mock-scenario: timeout`        -> 无限延迟（配合外部超时）
 *  - 密码中包含 `short`                        -> 签发短时效 Token（3 秒），用于演示无感刷新
 */

import {
  MOCK_ACCOUNTS,
  ROLE_MENUS,
  ROLE_PERMISSIONS,
  createInitialRoles,
  createInitialUsers,
  type MockUser,
} from './data'
import { envConfig } from '@/config/env'

/** Mock 数据引用，避免服务端与表格-row 类型重复定义 */
import type { SystemRole } from '@/types/entity'

/** Token 前缀 */
const ACCESS_PREFIX = 'mock-at-'
const REFRESH_PREFIX = 'mock-rt-'

/** 默认 Token 有效期（毫秒） */
const DEFAULT_ACCESS_TTL = 10 * 60 * 1000
/** 短时效 Token，用于演示过期与自动刷新 */
const SHORT_ACCESS_TTL = 3 * 1000
const DEFAULT_REFRESH_TTL = 24 * 60 * 60 * 1000

interface TokenRecord {
  username: string
  expiresAt: number
}

const accessTokens = new Map<string, TokenRecord>()
const refreshTokens = new Map<string, TokenRecord>()

/**
 * Mock Token 持久化。
 *
 * Mock 运行在浏览器主线程里，模块级 Map 会随页面刷新被清空，
 * 导致「localStorage 里明明有 token，刷新后却全部失效、被踢回登录页」。
 * 这里把已签发的 token 同步写入 localStorage，刷新后仍可校验通过，
 * 用于模拟真实后端（token 存在数据库/Redis，不随客户端刷新丢失）。
 */
const TOKEN_STORE_KEY = 'vue3-admin:mock-tokens'

type PersistedTokenKind = 'access' | 'refresh'

interface PersistedTokenRecord extends TokenRecord {
  kind: PersistedTokenKind
}

function readPersistedTokens(): Record<string, PersistedTokenRecord> {
  try {
    const raw = globalThis.localStorage?.getItem(TOKEN_STORE_KEY)
    if (!raw) {
      return {}
    }
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, PersistedTokenRecord>)
      : {}
  } catch {
    return {}
  }
}

function writePersistedTokens(store: Record<string, PersistedTokenRecord>): void {
  try {
    globalThis.localStorage?.setItem(TOKEN_STORE_KEY, JSON.stringify(store))
  } catch {
    // 存储不可用（隐私模式等）时退化为纯内存行为，只影响刷新后的体验
  }
}

function persistToken(kind: PersistedTokenKind, token: string, record: TokenRecord): void {
  const store = readPersistedTokens()
  store[token] = { ...record, kind }
  // 顺带清理过期项，避免长期使用后无限膨胀
  const now = Date.now()
  for (const [key, value] of Object.entries(store)) {
    if (value.expiresAt <= now) {
      delete store[key]
    }
  }
  writePersistedTokens(store)
}

function removePersistedToken(token: string): void {
  const store = readPersistedTokens()
  if (token in store) {
    delete store[token]
    writePersistedTokens(store)
  }
}

function clearPersistedTokens(): void {
  try {
    globalThis.localStorage?.removeItem(TOKEN_STORE_KEY)
  } catch {
    // 忽略存储异常
  }
}

/** 从持久化存储中查找 token（内存 Map 未命中时的兜底） */
function lookupPersistedToken(token: string, kind: PersistedTokenKind): TokenRecord | null {
  const record = readPersistedTokens()[token]
  if (!record || record.kind !== kind) {
    return null
  }
  if (record.expiresAt <= Date.now()) {
    removePersistedToken(token)
    return null
  }
  return { username: record.username, expiresAt: record.expiresAt }
}

let users: MockUser[] = createInitialUsers()
let nextUserId = users.length + 1

let roles: SystemRole[] = createInitialRoles()
let nextRoleId = Math.max(...roles.map((item) => item.id)) + 1

/** 已签发 Token 的计数，保证 token 唯一 */
let tokenSeq = 0

function issueAccessToken(username: string, ttl: number): string {
  tokenSeq += 1
  const token = `${ACCESS_PREFIX}${username}-${Date.now()}-${tokenSeq}`
  const record = { username, expiresAt: Date.now() + ttl }
  accessTokens.set(token, record)
  persistToken('access', token, record)
  return token
}

function issueRefreshToken(username: string): string {
  tokenSeq += 1
  const token = `${REFRESH_PREFIX}${username}-${Date.now()}-${tokenSeq}`
  const record = { username, expiresAt: Date.now() + DEFAULT_REFRESH_TTL }
  refreshTokens.set(token, record)
  persistToken('refresh', token, record)
  return token
}

function resolveAccessToken(token: string | null): string | null {
  if (!token) {
    return null
  }
  const record = accessTokens.get(token)
  if (record) {
    // 过期即视为无效，模拟真实后端校验
    if (record.expiresAt <= Date.now()) {
      accessTokens.delete(token)
      removePersistedToken(token)
      return null
    }
    return record.username
  }
  // 页面刷新后内存 Map 已清空，从持久化存储兜底恢复
  const persisted = lookupPersistedToken(token, 'access')
  if (!persisted) {
    return null
  }
  // 回填内存，后续校验不再反复读 localStorage
  accessTokens.set(token, persisted)
  return persisted.username
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

interface MockResponseInit {
  status?: number
  headers?: Record<string, string>
}

function json(data: unknown, init: MockResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...init.headers },
  })
}

/** 成功信封 */
function ok<T>(data: T): Response {
  return json({ code: 0, message: 'success', data })
}

/** 失败：HTTP 状态码 + 业务码保持一致，便于前端区分来源 */
function fail(status: number, message: string, code: number = status): Response {
  return json({ code, message, data: null }, { status })
}

function unauthorized(message = '身份认证已失效'): Response {
  return fail(401, message, 401)
}

/** 解析请求体 */
async function parseBody(init?: RequestInit): Promise<Record<string, unknown>> {
  const body = init?.body
  if (!body) {
    return {}
  }
  if (typeof body === 'string') {
    try {
      const parsed: unknown = JSON.parse(body)
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return Object.fromEntries(body.entries())
  }
  return {}
}

/** 提取 Authorization 中的 token */
function extractToken(init?: RequestInit): string | null {
  const headers = init?.headers
  if (!headers) {
    return null
  }
  let raw: string | null = null
  if (headers instanceof Headers) {
    raw = headers.get('Authorization')
  } else if (Array.isArray(headers)) {
    const found = headers.find(([key]) => key.toLowerCase() === 'authorization')
    raw = found?.[1] ?? null
  } else {
    const record = headers as Record<string, string>
    raw = record.Authorization ?? record.authorization ?? null
  }
  if (!raw) {
    return null
  }
  return raw.replace(/^Bearer\s+/i, '').trim() || null
}

function getScenario(init?: RequestInit): string | null {
  const headers = init?.headers
  if (headers instanceof Headers) {
    return headers.get('x-mock-scenario')
  }
  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => key.toLowerCase() === 'x-mock-scenario')
    return found?.[1] ?? null
  }
  if (headers && typeof headers === 'object') {
    const record = headers as Record<string, string>
    return record['x-mock-scenario'] ?? null
  }
  return null
}

function toProfile(user: MockUser) {
  const permissions = user.roles.flatMap((role) => ROLE_PERMISSIONS[role] ?? [])
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    email: user.email,
    phone: user.phone,
    roles: user.roles,
    permissions: Array.from(new Set(permissions)),
    superAdmin: user.roles.includes('admin'),
  }
}

function paginate<T>(list: T[], pageNum: number, pageSize: number) {
  const start = (pageNum - 1) * pageSize
  return {
    records: list.slice(start, start + pageSize),
    total: list.length,
    pageNum,
    pageSize,
  }
}

/** 路由处理上下文 */
interface MockContext {
  method: string
  pathname: string
  searchParams: URLSearchParams
  body: Record<string, unknown>
  init?: RequestInit
}

/** 已匹配到具体路由时的上下文：额外带上正则的捕获组 */
interface MockMatchedContext extends MockContext {
  match: RegExpMatchArray
}

type MockHandler = (ctx: MockMatchedContext) => Promise<Response> | Response

/** 路由表：method + 正则路径 + 处理函数 */
const routes: Array<{ method: string; pattern: RegExp; handler: MockHandler }> = [
  {
    method: 'POST',
    pattern: /^\/auth\/login$/,
    handler: async ({ body }) => {
      const username = String(body.username ?? '').trim()
      const password = String(body.password ?? '')
      const account = MOCK_ACCOUNTS[username]
      if (!account) {
        return fail(401, '账号或密码错误')
      }
      if (account.password !== password) {
        return fail(401, '账号或密码错误')
      }
      if (account.status === 'disabled') {
        return fail(403, '账号已被禁用，请联系管理员')
      }
      // 密码含 short 时签发短时效 Token，便于演示「过期 -> 自动刷新」
      const shortLived = password.includes('short')
      return ok({
        accessToken: issueAccessToken(username, shortLived ? SHORT_ACCESS_TTL : DEFAULT_ACCESS_TTL),
        refreshToken: issueRefreshToken(username),
        tokenType: 'Bearer',
        expiresIn: shortLived ? SHORT_ACCESS_TTL / 1000 : DEFAULT_ACCESS_TTL / 1000,
      })
    },
  },
  {
    method: 'POST',
    pattern: /^\/auth\/refresh$/,
    handler: async ({ body }) => {
      const refreshToken = String(body.refreshToken ?? '')
      const record =
        refreshTokens.get(refreshToken) ?? lookupPersistedToken(refreshToken, 'refresh')
      if (!record || record.expiresAt <= Date.now()) {
        // 刷新令牌失效：返回 401，前端应清理会话并要求重新登录
        return unauthorized('刷新令牌已失效')
      }
      return ok({
        accessToken: issueAccessToken(record.username, DEFAULT_ACCESS_TTL),
        refreshToken: issueRefreshToken(record.username),
        tokenType: 'Bearer',
        expiresIn: DEFAULT_ACCESS_TTL / 1000,
      })
    },
  },
  {
    method: 'POST',
    pattern: /^\/auth\/logout$/,
    handler: async ({ init }) => {
      const token = extractToken(init)
      if (token) {
        accessTokens.delete(token)
        removePersistedToken(token)
      }
      return ok(null)
    },
  },
  {
    method: 'GET',
    pattern: /^\/auth\/profile$/,
    handler: async ({ init }) => {
      const username = resolveAccessToken(extractToken(init))
      if (!username) {
        return unauthorized()
      }
      const account = MOCK_ACCOUNTS[username]
      if (!account) {
        return fail(404, '用户不存在')
      }
      return ok(toProfile(account))
    },
  },
  {
    method: 'GET',
    pattern: /^\/auth\/menus$/,
    handler: async ({ init }) => {
      const username = resolveAccessToken(extractToken(init))
      if (!username) {
        return unauthorized()
      }
      const account = MOCK_ACCOUNTS[username]
      if (!account) {
        return fail(404, '用户不存在')
      }
      // 按角色返回不同菜单；多个角色时合并去重
      const merged: Map<string, MenuNodeLike> = new Map()
      account.roles.forEach((role) => {
        ;(ROLE_MENUS[role] ?? []).forEach((item) => merged.set(String(item.id), item))
      })
      return ok(Array.from(merged.values()))
    },
  },
  {
    method: 'GET',
    pattern: /^\/system\/overview$/,
    handler: async ({ init }) => {
      const username = resolveAccessToken(extractToken(init))
      if (!username) {
        return unauthorized()
      }
      const total = users.length
      const active = users.filter((item) => item.status === 'enabled').length
      const trend = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(Date.now() - (6 - index) * 86400000)
        return {
          date: `${date.getMonth() + 1}/${date.getDate()}`,
          value: 20 + index * 6 + (index % 3) * 5,
        }
      })
      const adminCount = users.filter((u) => u.roles.includes('admin')).length
      return ok({
        totalUsers: total,
        activeUsers: active,
        onlineCount: Math.max(1, Math.round(active / 4)),
        todayVisits: 320 + (total % 50),
        userTrend: trend,
        roleDistribution: [
          { name: '管理员', value: Math.max(1, adminCount) },
          { name: '编辑', value: Math.max(1, total - adminCount) },
        ],
      })
    },
  },
  {
    method: 'POST',
    pattern: /^\/auth\/password$/,
    handler: async ({ init }) => {
      const username = resolveAccessToken(extractToken(init))
      if (!username) {
        return unauthorized()
      }
      return ok(null)
    },
  },
  {
    method: 'GET',
    pattern: /^\/system\/users$/,
    handler: async ({ searchParams, init }) => {
      const username = resolveAccessToken(extractToken(init))
      if (!username) {
        return unauthorized()
      }
      const keyword = (searchParams.get('keyword') ?? searchParams.get('username') ?? '')
        .trim()
        .toLowerCase()
      const status = searchParams.get('status')
      const pageNum = Number(searchParams.get('pageNum') ?? 1) || 1
      const pageSize = Number(searchParams.get('pageSize') ?? 20) || 20

      let list = users
      if (keyword) {
        list = list.filter(
          (item) =>
            item.username.toLowerCase().includes(keyword) ||
            item.nickname.toLowerCase().includes(keyword),
        )
      }
      if (status) {
        list = list.filter((item) => item.status === status)
      }

      return ok(paginate(list, pageNum, pageSize))
    },
  },
  {
    method: 'POST',
    pattern: /^\/system\/users$/,
    handler: async ({ body, init }) => {
      const username = resolveAccessToken(extractToken(init))
      if (!username) {
        return unauthorized()
      }
      const newUsername = String(body.username ?? '').trim()
      if (!newUsername) {
        return fail(422, '用户名不能为空')
      }
      if (users.some((item) => item.username === newUsername)) {
        return fail(409, '用户名已存在')
      }
      const created: MockUser = {
        id: nextUserId,
        username: newUsername,
        password: String(body.password ?? '123456'),
        nickname: String(body.nickname ?? newUsername),
        email: String(body.email ?? ''),
        phone: String(body.phone ?? ''),
        status: body.status === 'disabled' ? 'disabled' : 'enabled',
        roles: Array.isArray(body.roles) ? (body.roles as string[]) : ['editor'],
        createdAt: new Date().toISOString(),
      }
      nextUserId += 1
      users = [created, ...users]
      return ok(created)
    },
  },
  {
    method: 'PUT',
    pattern: /^\/system\/users\/(\d+)$/,
    handler: async ({ match, body, init }) => {
      const actor = resolveAccessToken(extractToken(init))
      if (!actor) {
        return unauthorized()
      }
      const id = Number(match[1])
      const index = users.findIndex((item) => item.id === id)
      if (index < 0) {
        return fail(404, '用户不存在')
      }
      const current = users[index]
      if (!current) {
        return fail(404, '用户不存在')
      }
      const updated: MockUser = {
        ...current,
        nickname: String(body.nickname ?? current.nickname),
        email: String(body.email ?? current.email),
        phone: String(body.phone ?? current.phone),
        status: body.status === 'disabled' ? 'disabled' : 'enabled',
        roles: Array.isArray(body.roles) ? (body.roles as string[]) : current.roles,
      }
      users[index] = updated
      return ok(updated)
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/system\/users\/(\d+)$/,
    handler: async ({ match, init }) => {
      const actor = resolveAccessToken(extractToken(init))
      if (!actor) {
        return unauthorized()
      }
      const id = Number(match[1])
      const before = users.length
      users = users.filter((item) => item.id !== id)
      if (users.length === before) {
        return fail(404, '用户不存在')
      }
      return ok(null)
    },
  },
  {
    method: 'GET',
    pattern: /^\/system\/roles\/all$/,
    handler: async ({ init }) => {
      const actor = resolveAccessToken(extractToken(init))
      if (!actor) {
        return unauthorized()
      }
      return ok(roles)
    },
  },
  {
    method: 'GET',
    pattern: /^\/system\/roles$/,
    handler: async ({ searchParams, init }) => {
      const actor = resolveAccessToken(extractToken(init))
      if (!actor) {
        return unauthorized()
      }
      const keyword = (searchParams.get('keyword') ?? '').trim().toLowerCase()
      const status = searchParams.get('status')
      const pageNum = Number(searchParams.get('pageNum') ?? 1) || 1
      const pageSize = Number(searchParams.get('pageSize') ?? 20) || 20

      let list = roles
      if (keyword) {
        list = list.filter(
          (item) =>
            item.code.toLowerCase().includes(keyword) || item.name.toLowerCase().includes(keyword),
        )
      }
      if (status) {
        list = list.filter((item) => item.status === status)
      }

      const sorted = [...list].sort((a, b) => a.sort - b.sort)
      return ok(paginate(sorted, pageNum, pageSize))
    },
  },
  {
    method: 'POST',
    pattern: /^\/system\/roles$/,
    handler: async ({ body, init }) => {
      const actor = resolveAccessToken(extractToken(init))
      if (!actor) {
        return unauthorized()
      }
      const code = String(body.code ?? '').trim()
      if (!code) {
        return fail(422, '角色标识不能为空')
      }
      if (roles.some((item) => item.code === code)) {
        return fail(409, `角色标识 ${code} 已存在`)
      }
      const created: SystemRole = {
        id: nextRoleId,
        code,
        name: String(body.name ?? code),
        description: String(body.description ?? ''),
        status: body.status === 'disabled' ? 'disabled' : 'enabled',
        permissions: Array.isArray(body.permissions) ? (body.permissions as string[]) : [],
        sort: Number(body.sort ?? nextRoleId),
        createdAt: new Date().toISOString(),
      }
      nextRoleId += 1
      roles = [...roles, created]
      return ok(created)
    },
  },
  {
    method: 'PUT',
    pattern: /^\/system\/roles\/(\d+)$/,
    handler: async ({ match, body, init }) => {
      const actor = resolveAccessToken(extractToken(init))
      if (!actor) {
        return unauthorized()
      }
      const id = Number(match[1])
      const index = roles.findIndex((item) => item.id === id)
      if (index < 0) {
        return fail(404, '角色不存在')
      }
      const current = roles[index]
      if (!current) {
        return fail(404, '角色不存在')
      }
      const updated: SystemRole = {
        ...current,
        name: String(body.name ?? current.name),
        description: String(body.description ?? current.description),
        status: body.status === 'disabled' ? 'disabled' : 'enabled',
        permissions: Array.isArray(body.permissions)
          ? (body.permissions as string[])
          : current.permissions,
        sort: Number(body.sort ?? current.sort),
      }
      roles[index] = updated
      return ok(updated)
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/system\/roles\/(\d+)$/,
    handler: async ({ match, init }) => {
      const actor = resolveAccessToken(extractToken(init))
      if (!actor) {
        return unauthorized()
      }
      const id = Number(match[1])
      const target = roles.find((item) => item.id === id)
      if (!target) {
        return fail(404, '角色不存在')
      }
      // 内置角色不允许删除，模拟后端的安全兜底（前端删掉也没用）
      if (target.code === 'admin') {
        return fail(403, '内置超级管理员角色不允许删除')
      }
      roles = roles.filter((item) => item.id !== id)
      return ok(null)
    },
  },
  {
    method: 'POST',
    pattern: /^\/mock\/force-expire$/,
    handler: async () => {
      // 立即让所有已签发的访问令牌失效，用于演示「多请求并发 401」
      accessTokens.clear()
      clearPersistedTokens()
      return ok(null)
    },
  },
]

type MenuNodeLike = (typeof ROLE_MENUS)[string][number]

/** 处理一次请求 */
export async function handleMockRequest(ctx: MockContext): Promise<Response> {
  const scenario = getScenario(ctx.init)

  if (scenario === 'network-error') {
    // 模拟断网：fetch 在网络失败时抛出 TypeError
    throw new TypeError('Failed to fetch')
  }
  if (scenario === 'timeout') {
    // 不做响应，直到外部超时
    await delay(60_000)
    return ok(null)
  }

  await delay(envConfig.mockDelay)

  if (scenario === 'server-error') {
    return fail(500, '服务器开小差了')
  }

  for (const route of routes) {
    if (route.method !== ctx.method) {
      continue
    }
    const match = ctx.pathname.match(route.pattern)
    if (match) {
      return route.handler({ ...ctx, match })
    }
  }

  return fail(404, `Mock 未实现的接口: ${ctx.method} ${ctx.pathname}`)
}

/**
 * 创建一个符合 Fetch 签名的 mock 实现，供 ofetch 注入。
 */
export function createMockFetch(): typeof globalThis.fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const requestUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

    const [pathAndQuery = '', hashFragment = ''] = requestUrl.split('#')
    void hashFragment
    // 剥离 query 后再拆协议/域名
    const [pathnamePart = '', queryPart = ''] = pathAndQuery.split('?')
    const searchParams = new URLSearchParams(queryPart)

    // 只保留路径部分，去掉 http(s)://host 与 api 前缀
    const withoutProtocol = pathnamePart.replace(/^https?:\/\/[^/]+/i, '')
    const pathname = withoutProtocol.replace(/^\/api(?=\/|$)/, '') || '/'

    const method = (init?.method ?? 'GET').toUpperCase()
    const body = await parseBody(init)

    return handleMockRequest({ method, pathname, searchParams, body, init })
  }
}

/** 仅测试使用：重置全部 mock 状态 */
export function __resetMockState(): void {
  accessTokens.clear()
  refreshTokens.clear()
  clearPersistedTokens()
  users = createInitialUsers()
  nextUserId = users.length + 1
  roles = createInitialRoles()
  nextRoleId = Math.max(...roles.map((item) => item.id)) + 1
  tokenSeq = 0
}

/** 仅测试使用：直接构造一个有效 access token（不经过登录） */
export function __issueTokenForTest(username: string, ttl = DEFAULT_ACCESS_TTL): string {
  return issueAccessToken(username, ttl)
}
