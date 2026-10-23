# 后端接入说明

本文面向后端同学 / 首次对接本框架的人。目标只有一个：

> **改 `.env` 里的 3 个变量 + 后端按本文约定返回数据，业务页面零改动。**

框架已经内置了一套完整的 Mock（见 `src/mock/`），它和真实后端共用**同一套类型**与**同一套调用入口**。因此接入时不需要重写页面，只需要把 Mock 换成真实服务。

---

## 1. 最小上线步骤

```bash
# 1) 关闭 mock
# .env.production
VITE_USE_MOCK=false
VITE_API_BASE_URL=/api

# 2) 选择鉴权模式（见 §3）
VITE_AUTH_MODE=refresh      # 推荐；也可 bearer / cookie

# 3) 让后端实现下列接口
#    POST /auth/login
#    POST /auth/refresh      (VITE_AUTH_MODE=refresh 时必需)
#    POST /auth/logout       (可选，前端已兜底本地清理)
#    GET  /auth/profile
#    GET  /auth/menus
#    GET  /system/users      分页
#    POST /system/users
#    PUT  /system/users/:id
#    DELETE /system/users/:id
```

开发期若想连真实后端但不改 `.env`，可复制一份 `.env.local`（已被 `.gitignore` 忽略）：

```bash
cp .env.example .env.local
# 然后修改 .env.local 里的 VITE_USE_MOCK=false / VITE_API_BASE_URL=https://xxx/api
```

---

## 2. 统一响应结构

所有非下载类接口都使用同一个信封：

```jsonc
{
  "code": 0, // 业务码，0 表示成功（也兼容 200 / "SUCCESS" / "OK"）
  "message": "success", // 失败时的中文提示，前端会直接展示
  "data": {}, // 业务数据，可以是任意类型；失败时为 null
}
```

对应类型：`src/types/api.ts` 的 `ApiResponse<T>`。

### 2.1 HTTP 状态码 vs 业务 `code`

这两者**必须区分**，框架的容错策略如下：

| 组合                                 | 框架行为                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| HTTP 2xx + `code === 0`              | 成功，返回 `data`                                                             |
| HTTP 2xx + `code !== 0`              | 视为业务失败，构造 `ApiError{kind:'business'}`，**不重试**，弹出 `message`    |
| HTTP 401                             | 进入 Token 刷新流程（见 §4）；无刷新令牌则触发统一登出                        |
| HTTP 403                             | `ApiError{kind:'http'}`，**不重试**，不做登出（403 是权限不足，不是身份失效） |
| HTTP 408/409/425/429/500/502/503/504 | 网络层重试（仅 GET，或显式标记幂等的写请求），退避后重放                      |
| 无 HTTP 状态码（断网/DNS 失败）      | `ApiError{kind:'network'}`，按重试策略重放                                    |

> 关键点：**HTTP 状态码决定要不要重试，业务 `code` 决定要不要提示用户**。
> 请不要把「参数错误」做成 HTTP 500 + `code:400`，那样会被当成服务端抖动自动重试。

### 2.2 推荐的错误响应

```jsonc
// HTTP 401 + 业务码 401：身份失效
{ "code": 401, "message": "登录状态已失效", "data": null }

// HTTP 400：参数校验失败
{ "code": 400, "message": "用户名不能为空", "data": null }

// HTTP 403：权限不足（注意不要和 401 混用，403 不会触发登出）
{ "code": 403, "message": "没有该操作权限", "data": null }
```

`src/types/api.ts` 中的 `SUCCESS_CODES` 允许这些值表示成功：`0`、`'0'`、`200`、`'200'`、`'SUCCESS'`、`'success'`、`'OK'`。
`BackendErrorCodeMap` 定义了框架已知的业务码；出现未知 `code` 时仍会按 `message` 提示，只是不会走专门的分支。

---

## 3. 鉴权模式

通过 `VITE_AUTH_MODE` 选择，取值见下表（配置错误会在 `src/config/env.ts` 的 `assertEnvValid()` 中抛出可读的错误）。

| 模式      | 说明                                | 前端存储       | 注意事项                            |
| --------- | ----------------------------------- | -------------- | ----------------------------------- |
| `bearer`  | 只有 Access Token                   | `localStorage` | 过期即登出，体验最差，但也最简单    |
| `refresh` | Access + Refresh Token **（推荐）** | `localStorage` | 见 §4 的无感刷新协议                |
| `cookie`  | HttpOnly Cookie 会话                | 浏览器管理     | 需要后端配合 SameSite/CSRF，见 §3.2 |

> ⚠️ **所有以 `VITE_` 开头的变量都会被打包进产物、暴露给浏览器。**
> 严禁在 `.env*` 中放置密钥、第三方 Secret、内部地址白名单等敏感信息。

### 3.1 Token 注入方式

`token` / `refresh` 模式下，前端在每个请求的 Header 中加入：

```
Authorization: Bearer <accessToken>
```

**绝不会**把 Token 拼到 URL 里。日志模块（`src/utils/logger.ts`）对
`password` / `token` / `authorization` / `secret` / `captcha` / `credential` 等键做脱敏，输出为 `[REDACTED]`。

哪些请求会被注入？除了明确声明 `skipAuth: true` 的（登录、刷新自身），其余全部注入（详见 `src/utils/http.ts`）。

### 3.2 Cookie 模式的安全要求

如果选择 `cookie` 模式，后端必须满足：

```
Set-Cookie: SESSION=xxxx; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400
```

- `HttpOnly`：JS 读不到，XSS 无法直接窃取会话；
- `Secure`：仅 HTTPS 传输；
- `SameSite=Lax`（或 `Strict`）：缓解 CSRF；
- 跨域部署时前端会带上 `credentials: 'include'`，此时 `Access-Control-Allow-Origin` **不能**是 `*`，必须显式指定来源并加 `Access-Control-Allow-Credentials: true`；
- 写操作建议仍然要求 CSRF Token（前后端同源也没必要例外）。

> **前端权限控制永远不能替代后端鉴权。**
> 菜单、按钮、路由都由前端可见数据计算出来，攻击者可以直接构造请求。
> 每一个接口都必须在服务端独立完成身份校验与授权判定。

---

## 4. 登录 / 刷新 / 登出协议

### 4.1 登录 `POST /auth/login`

请求：

```jsonc
{ "username": "admin", "password": "admin123" }
```

响应（`refresh` 模式）：

```jsonc
{
  "code": 0,
  "message": "success",
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "9f0c...", // bearer 模式可省略
    "tokenType": "Bearer",
    "expiresIn": 600, // 秒，可选，用于前端提前判断
  },
}
```

对应类型 `src/types/auth.ts` 的 `AuthTokens`。
字段名不叫这个也没关系，在 `src/api/auth.ts` 里做一次映射即可——**不要**把映射散落到页面。

错误：

| HTTP    | code | 前端表现                                               |
| ------- | ---- | ------------------------------------------------------ |
| 401     | 401  | 「账号或密码错误」（登录页自行提示，不弹全局 Message） |
| 403     | 403  | 「账号已被禁用，请联系管理员」                         |
| 422/400 | 同左 | 直接展示后端 `message`                                 |

### 4.2 刷新 `POST /auth/refresh`（仅 `refresh` 模式）

请求：

```jsonc
{ "refreshToken": "9f0c..." }
```

成功：同登录的 `data` 结构。**建议同时返回新的 refreshToken**（轮换），前端会整体替换。
失败：返回 **HTTP 401**，前端随即清理会话并要求重新登录。

### 4.3 登出 `POST /auth/logout`

前端登出时**先**请求本接口做服务端撤销（可选），再清理本地。即便本接口失败，本地状态也一定会被清掉。
本接口不应抛非 401 错误；若返回 401，说明会话已失效，前端视为"已登出"而非错误。

---

## 5. 无感刷新约定（`refresh` 模式）

框架用**会话代号（generation）**解决并发 401，不依赖任何"永不重置的全局布尔量"。请你按以下约定实现，避免双方语义打架：

1. **刷新接口自身不能返回 401 触发二次刷新**。前端用不带拦截器的裸客户端调用它，天然不会递归；
2. access token 过期时，业务接口统一返回 **HTTP 401**，不要在 200 里用 `code:401` 表达过期（那会被当成业务错误而不是身份失效）；
3. refresh token 支持轮换就轮换，前端会把新旧两个一起替换；返回体中若省略 `refreshToken`，前端保留旧的；
4. Refresh token 一旦失效（过期/被撤销/异地登录），请返回 **HTTP 401**，前端会清空全部凭证、权限菜单、动态路由与页签缓存。

前端侧的保证：

- 并发的多个 401 **只触发一次**刷新，其余请求共享同一个 Promise 排队等待；
- 刷新成功后重放原请求（受 `MAX_AUTH_RETRY=1` 限制，不会无限重放）；
- 刷新过程中如果用户已经登出（generation 已变），新 token **不会**被写回，杜绝"旧请求把登出状态又复活"；
- 过期提示在**一次过期事件内只弹一次**；重新登录后恢复提示能力，下一次独立过期事件仍会提示；
- **手动登出不会显示"会话已过期"**。

---

## 6. 当前用户信息 `GET /auth/profile`

```jsonc
{
  "code": 0,
  "data": {
    "id": 1,
    "username": "admin",
    "nickname": "超级管理员",
    "avatar": "https://.../a.png", // 可空
    "email": "admin@example.com",
    "phone": "13800000000",
    "roles": ["admin"],
    "permissions": ["system:user:create", "system:user:delete"],
    "superAdmin": true, // 可选，true 表示跳过权限校验
  },
}
```

对应类型 `UserProfile`。

> `permissions` 用于"按钮级 / 页面级"控制，是**体验层**数据；服务端仍需在每个接口独立鉴权。

---

## 7. 菜单 `GET /auth/menus`

返回一棵菜单树：

```jsonc
{
  "code": 0,
  "data": [
    {
      "id": 1, // 唯一 id（数字或字符串均可）
      "parentId": null,
      "name": "Dashboard", // 路由 name，**全局唯一**
      "path": "/dashboard", // 子菜单可用相对路径 "user"，前端会拼接
      "component": "dashboard/index", // ← 关键：必须是双方约定的标识
      "title": "首页",
      "icon": "LayoutDashboard", // 必须在前端图标映射表中已登记
      "type": "menu", // directory | menu | button
      "sort": 1,
      "hidden": false, // true 则不出现在菜单、也不注册路由
      "keepAlive": true,
      "externalUrl": "", // 非空则渲染成外链 <a target="_blank">
      "permissions": [], // 访问该页面所需权限码
      "roles": [], // 访问该页面所需角色
      "children": [],
    },
  ],
}
```

对应类型 `src/types/route.ts` 的 `MenuNode`。

### 7.1 `component` 字段的安全约定（非常重要）

**`component` 只能是枚举标识，前后端必须事先约定这张表：**

| 后端下发            | 前端实际加载                      |
| ------------------- | --------------------------------- |
| `dashboard/index`   | `src/views/dashboard/index.vue`   |
| `system/user/index` | `src/views/system/user/index.vue` |
| `system/role/index` | `src/views/system/role/index.vue` |
| `cesium-demo/index` | `src/views/cesium-demo/index.vue` |

映射表位于 `src/router/dynamic-routes.ts` 的 `componentMap`。

> 前端**永远不会**执行 `import(后端字符串)`。未登记的标识会降级到
> `src/views/error/Exception.vue` 并在控制台告警，而不是白屏或任意加载。
> 新增页面时：前端在 `componentMap` 里加一行，后端在菜单配置里使用该标识。

### 7.2 图标字段

`icon` 只能取前端 `src/components/AppIcon/icon-map.ts` 中已登记的键名；未命中时回退到默认图标（`FileSearch`），不会报错。

### 7.3 按钮（`type: "button"`）

按钮节点不生成路由、不出现在菜单，仅作为权限点的载体便于后端管理。前端真正使用的是 `GET /auth/profile` 里的 `permissions`。

---

## 8. 分页协议

请求：`GET /system/users?pageNum=1&pageSize=20&keyword=xxx&status=enabled`

响应 `data`：

```jsonc
{
  "records": [ { "id": 1, "username": "admin", ... } ],
  "total": 68,
  "pageNum": 1,
  "pageSize": 20
}
```

### 8.1 字段名兼容

不同后端命名习惯不同，框架在 `src/utils/response-adapter.ts` 中**一次性**适配，**页面从不自己解析响应**：

| 语义     | 兼容的字段名（按顺序探测）                                  |
| -------- | ----------------------------------------------------------- |
| 列表主体 | `records` → `list` → `items` → `rows` → `content`           |
| 总数     | `total` → `totalCount` → `count` → `totalElements`          |
| 页码     | `pageNum` → `page` → `current` → `pageNumber` → `pageIndex` |
| 每页条数 | `pageSize` → `size` → `limit` → `rows`                      |

特殊情况也做了兜底：

- `data` 直接是数组（无外层分页对象）→ 视为单页数据，`total = data.length`；
- 缺少 `total` → 退化为当前返回条数，并保留上层传入的分页参数；
- `pageSize === 0` 或缺失 → 回落到请求时的 `pageSize`。

### 8.2 排序

查询参数追加 `sortBy` / `sortOrder`：`sortBy=id&sortOrder=asc|desc`。
前端 `remote` 模式下由服务端负责排序。

---

## 9. 增删改响应式约定

框架不要求特定结构，但**建议**：

| 操作 | 推荐 HTTP                  | 成功返回            |
| ---- | -------------------------- | ------------------- |
| 新增 | `POST /system/users`       | `data` 为新建实体   |
| 修改 | `PUT /system/users/:id`    | `data` 为更新后实体 |
| 删除 | `DELETE /system/users/:id` | `data` 为 `null`    |

前端依赖的只是**业务码成功与否**，拿到实体也只是为了回显。返回 `null` 同样可用。

错误码建议：

| 场景                           | HTTP       | code |
| ------------------------------ | ---------- | ---- |
| 参数缺失 / 格式错误            | 400 或 422 | 同左 |
| 资源不存在                     | 404        | 404  |
| 唯一键冲突                     | 409        | 409  |
| 业务规则拒绝（如删除内置角色） | 403        | 403  |

> 写请求默认**不自动重试**（`WRITE_RETRY_COUNT=0`）。
> 如果你的某个写接口是幂等的，在调用处显式传 `{ idempotent: true }` 才会进入重试。

---

## 10. 文件上传 / 下载

### 上传 `POST /system/upload`

前端发送 `multipart/form-data`，字段名由后端指定（默认 `file`）：

```ts
const fd = new FormData()
fd.append('file', file)
await http.upload<{ url: string }>('/system/upload', fd)
```

**注意：`fetch` / `ofetch` 无法提供上传进度。**
需要进度条时请使用 `http.uploadWithProgress(...)`，它内部走 XHR（详见 `src/utils/http.ts`）。

### 下载

```ts
await http.downloadFile('/system/users/export', { fileName: 'users.xlsx' })
```

- 响应建议带 `Content-Disposition: attachment; filename*=UTF-8''%E7%94%A8%E6%88%B7.xlsx`，
  前端会按 RFC 5987 解析；缺失时用调用方传入的文件名兜底；
- 下载期间同样会注入鉴权头，并处理 401（会触发统一登出流程）。

---

## 11. CORS

跨域直连（开发期常见）时，后端需返回：

```
Access-Control-Allow-Origin: <具体来源>       # cookie 模式下不能是 *
Access-Control-Allow-Credentials: true        # 携带凭证时必须
Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With
Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS
```

> 开发期更推荐的做法是**用 Vite 代理**（见 `.env.development` 的 `VITE_PROXY_TARGET`），
> 让浏览器始终同源，从根上避免 CORS 与 cookie 跨域问题。

---

## 12. 如何自测对接是否成功

按下面顺序逐项验证，任一项不符即可定位到具体层：

1. `pnpm dev` 打开 `/login`，用真实账号登录 → 能拿到 token 并跳转首页；
2. 在 `/system/user` 刷新页面（F5）→ 不跳登录、不白屏（验证动态路由已在守卫内初始化）；
3. 直接访问一个深层路由 URL → 能正常进入，不是 404；
4. 等待 access token 过期（或用"短时效 token"技巧）后触发任意请求 → 自动刷新、无感继续；
5. 删除数据库中的 refresh token 后再发请求 → 弹一次过期提示并回登录页；
6. 用缺少权限的账号登录 → 菜单相应缺失、操作按钮隐藏；
7. 手动退出后再直接访问受保护页 → 跳回登录且**不显示**"会话已过期"；
8. 搜索 → 翻页 → 改每页条数 → 删除最后一条 → 校验是否自动回到上一页且不出现空白页。

Mock 层（`src/mock/server.ts`）已经把这些场景全部实现了，把它的返回值当作协议参考文档来对齐即可。
