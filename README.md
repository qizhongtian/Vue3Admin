# Vue3Admin — 企业级 Vue 3 后台管理基础框架

开箱即用的企业级中后台前端基础框架，内置**真实可用**（非演示桩代码）的：

- 登录认证（AccessToken + RefreshToken 无感刷新，可选 bearer / cookie 模式）
- 基于 `ofetch` 的请求层（自动 Token 附加、401 重试、请求去重、统一错误提示、超时/取消）
- 动态路由 + 按钮级权限（菜单由后端/Mock 下发，`v-permission` 指令控制按钮显隐）
- 通用业务组件（BaseTable 分页表格 / BaseSearch 搜索 / BaseForm 表单 / BaseDialog 弹窗 / BaseChart 图表）
- 布局体系（侧边栏、头部、TagsView 多标签页、面包屑）
- 可选 Cesium 三维模块（动态 import 异步加载，按需打包，不进主包）
- 多环境配置（development / test / production / analyze）与内置 Mock 服务

## 技术栈

| 类别     | 选型                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------- |
| 框架     | Vue 3.5（Composition API + `<script setup>`）、TypeScript 5.9（strict）                                   |
| 构建     | Vite 8（Rolldown 引擎）                                                                                   |
| 状态管理 | Pinia 4                                                                                                   |
| 路由     | Vue Router 5                                                                                              |
| UI       | Naive UI 2.45、lucide-vue-next 图标                                                                       |
| 请求     | ofetch                                                                                                    |
| 图表     | ECharts 6                                                                                                 |
| 三维     | Cesium 1.146（可选依赖，异步加载）                                                                        |
| 测试     | Vitest 5 + @vue/test-utils（jsdom 环境）                                                                  |
| 代码规范 | ESLint 10（typescript-eslint + eslint-plugin-vue）、Stylelint、Prettier、Husky + lint-staged + commitlint |

## 环境要求

- Node.js **>= 22.19**
  （真实下限来自 `jsdom@30 → undici@8`，后者声明 `engines.node >= 22.19.0`；
  Vite 8 自身只要求 `^20.19.0 || >=22.12.0`。
  在 Node 20 上运行会因缺少 `zlib.createZstdDecompress` 导致测试 worker 直接崩溃。）
- pnpm **>= 9**（本项目锁定 `packageManager: pnpm@12`）

## 快速启动

```bash
# 1. 安装依赖
pnpm install

# 2. 启动开发服务器（默认 Mock 模式，无需后端）
pnpm dev
```

打开 http://localhost:5173 ，使用内置 Mock 演示账号登录：

| 账号     | 密码        | 说明                             |
| -------- | ----------- | -------------------------------- |
| `admin`  | `admin123`  | 超级管理员，拥有全部菜单与权限   |
| `editor` | `editor123` | 普通编辑，仅有部分菜单与只读权限 |

> 登录后可通过**系统管理 → 用户管理 / 角色管理**体验分页 CRUD、角色权限勾选、按钮级权限等完整功能。

### 本机安装排障提示（Windows / 沙箱环境）

如果在某些受限环境（如企业受限磁盘、沙箱）下 `pnpm install` 出现以下两类问题，可用如下方式绕过：

```bash
# 问题 1：pnpm 12 忽略项目 .npmrc 中的 store-dir，默认全局仓库盘符无写权限
# 问题 2：沙箱文件系统不支持符号链接，导致 isolated linker 安装失败
pnpm install --store-dir=./.pnpm-store --node-linker=hoisted
```

普通开发环境直接 `pnpm install` 即可，无需上述参数。

## 常用脚本

| 命令                                              | 说明                                                        |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `pnpm dev`                                        | 启动开发服务器（development 模式）                          |
| `pnpm dev:test`                                   | 以 test 环境配置启动开发服务器                              |
| `pnpm dev:prod`                                   | 以 production 环境配置启动开发服务器（连生产 API 时调试用） |
| `pnpm build`                                      | 类型检查 + 生产环境构建（产物输出到 `dist/`）               |
| `pnpm build:test`                                 | 类型检查 + test 环境构建                                    |
| `pnpm build:analyze`                              | 构建并生成打包体积分析报告（`dist/stats.html`）             |
| `pnpm preview`                                    | 本地预览构建产物（端口 4173）                               |
| `pnpm typecheck`                                  | 仅执行 vue-tsc 全量类型检查                                 |
| `pnpm test` / `pnpm test:watch` / `pnpm test:cov` | 运行单测 / 监听模式 / 覆盖率报告                            |
| `pnpm lint` / `pnpm lint:fix`                     | ESLint 检查 / 自动修复                                      |
| `pnpm lint:style` / `pnpm lint:style:fix`         | Stylelint 样式检查 / 修复                                   |
| `pnpm format` / `pnpm format:check`               | Prettier 格式化 / 校验                                      |

## 环境变量

项目使用 `.env.development` / `.env.test` / `.env.production` / `.env.analyze` 多环境文件，模板见 `.env.example`。核心变量：

| 变量                   | 说明                                                                    | 默认值                |
| ---------------------- | ----------------------------------------------------------------------- | --------------------- |
| `VITE_APP_TITLE`       | 应用标题（标签页 / 登录页）                                             | 企业后台管理系统      |
| `VITE_APP_ENV`         | 环境标识                                                                | development           |
| `VITE_BASE_URL`        | 部署基础路径（需与 vite.config.ts `base` 一致，子目录部署填 `/admin/`） | `/`                   |
| `VITE_API_BASE_URL`    | API 基础地址，推荐 `/api` 走代理                                        | `/api`                |
| `VITE_USE_MOCK`        | 是否启用内置 Mock 数据                                                  | true                  |
| `VITE_AUTH_MODE`       | 认证模式：`refresh` / `bearer` / `cookie`                               | refresh               |
| `VITE_REQUEST_TIMEOUT` | 请求超时（毫秒）                                                        | 20000                 |
| `VITE_CESIUM_BASE_URL` | Cesium 静态资源路径（结尾斜杠不可省略）                                 | `/cesium/`            |
| `VITE_PROXY_TARGET`    | 开发代理目标（仅关闭 Mock 时生效）                                      | http://127.0.0.1:8080 |

> ⚠️ 所有 `VITE_` 前缀变量都会被打进前端产物，**严禁**写入数据库密码、第三方 Secret 等敏感信息。

### 运行时配置（免重新构建换环境）

除构建期环境变量外，框架还支持部署后通过根目录下的 `config.json` 覆盖部分配置，**同一份产物可直接部署到多个环境**：

```bash
# 部署目录下（与 index.html 同级）
cp public/config.json.example dist/config.json
```

```json
{
  "apiBaseUrl": "/api",
  "cesiumBaseUrl": "/cesium/"
}
```

- 只允许覆盖白名单字段（`apiBaseUrl`、`cesiumBaseUrl`），避免运行时被塞入任意配置；
- 在应用挂载前加载完成，加载失败/文件不存在时静默沿用构建期配置；
- Nginx 需对该文件设置 `Cache-Control: no-cache`（`nginx.conf` 已包含该配置）。

## 单元测试

```bash
pnpm test        # 单次运行
pnpm test:cov    # 生成覆盖率报告（dist/coverage）
```

测试位于 `tests/`，使用 Vitest + jsdom，当前覆盖核心纯逻辑（共 108 个用例）：

| 测试文件                   | 覆盖内容                                                   |
| -------------------------- | ---------------------------------------------------------- |
| `storage.spec.ts`          | 前缀隔离、脏数据容错、localStorage 不可用时降级内存存储    |
| `http-error.spec.ts`       | ApiError 分类、`isRetryable`/`isCanceled` 判定、异常归一化 |
| `permission.spec.ts`       | 权限码匹配、逐级通配、角色/权限组合判定、超管绕过          |
| `request-dedupe.spec.ts`   | 并发共享、TTL 缓存、`cancelPrevious` 中断、清理            |
| `response-adapter.spec.ts` | 信封拆解、分页字段别名兼容、字符串数字转换                 |
| `auth-session.spec.ts`     | 会话代次模型、并发 401 只处理一次、刷新结果过期代次丢弃    |
| `use-pagination.spec.ts`   | 翻页/搜索、竞态丢弃、删除回退、错误态、缓存命中            |
| `route-utils.spec.ts`      | 菜单打平/过滤/路径拼接/面包屑/首个可访问页                 |

## 代码检查

```bash
pnpm lint         # ESLint（扁平配置 eslint.config.js，含 Vue + TS 规则）
pnpm lint:style   # Stylelint（独立 .scss/.css 文件）
pnpm format:check # Prettier 格式校验
```

## Mock 与真实后端切换

框架内置基于 Service Worker 思路的本地 Mock 服务，覆盖登录、用户、角色、菜单、工作台统计等接口：

- **纯前端开发 / 演示**：保持 `VITE_USE_MOCK=true`，无需任何后端。
- **对接真实后端**：将 `.env.development`（或对应环境文件）中的 `VITE_USE_MOCK` 改为 `false`，并在 `.env` 中配置：
  - `VITE_API_BASE_URL=/api`：由 Vite 开发代理转发到 `VITE_PROXY_TARGET`（默认 `http://127.0.0.1:8080`）；
  - 或直接填写后端域名（如 `https://api.example.com`），此时后端需正确配置 CORS。
- 接口约定（路径、入参、响应结构、Token 刷新协议）详见 **[docs/backend-api.md](docs/backend-api.md)**，后端按该文档实现即可无缝接入。

## 目录结构

```
Vue3Admin
├─ build/                    # Vite 构建辅助插件（Cesium 资源拷贝）
├─ docs/                     # 后端对接文档（backend-api.md）
├─ eslint.config.js          # ESLint 扁平配置
├─ stylelint.config.js       # Stylelint 配置
├─ nginx.conf                # 生产部署 Nginx 参考配置（含 /api 反代与缓存策略）
├─ public/                   # 静态资源（含 config.json.example 运行时配置模板）
├─ tests/                    # 单元测试（Vitest + jsdom）
├─ src/
│  ├─ api/                   # 接口层（auth / user / role / system）
│  ├─ assets/                # 全局样式（variables.scss / theme.scss 等）
│  ├─ components/            # 通用组件（BaseTable / BaseForm / BaseSearch / BaseDialog / BaseChart / AppIcon）与 layout 布局组件
│  ├─ composables/           # 组合式函数（usePagination 等）
│  ├─ config/                # 应用常量与权限码
│  ├─ directives/            # 自定义指令（v-permission 按钮级权限）
│  ├─ layouts/               # 布局骨架
│  ├─ mock/                  # 内置 Mock 数据与服务
│  ├─ modules/cesium/        # Cesium 异步加载模块（loadCesium / createViewer / destroyViewer）
│  ├─ router/                # 路由（静态路由 / 动态路由生成 / 守卫 / 工具）
│  ├─ stores/                # Pinia（user / permission / app / tags-view）
│  ├─ types/                 # 全局类型（entity / request / form 等）
│  ├─ utils/                 # 工具（http 请求层 / auth 会话 / 权限 / 存储等）
│  └─ views/                 # 页面（login / dashboard / system/user / system/role / cesium-demo / error）
├─ vite.config.ts            # Vite 配置（含分包策略说明）
└─ tsconfig.json             # TypeScript 配置
```

## Cesium 三维模块（可选）

- Cesium 声明为 `optionalDependencies`，通过 `import('cesium')` **动态引用**，未访问相关页面前不会加载（不占用主包体积）。
- 构建时由 `build/cesium-assets-plugin.ts` 自动拷贝 Workers / Assets / Widgets / ThirdParty 到 `dist/cesium/`。
- 本地体验：登录后进入「三维可视化（Cesium Demo）」页面；默认使用本地离线影像，可通过 `VITE_CESIUM_BASE_URL` 切换 CDN。
- 若不需要三维能力，直接删除 `src/modules/cesium`、`src/views/cesium-demo` 与 `src/router` 中对应路由即可，不影响其余功能。

## 生产部署

1. 执行 `pnpm build`，产物在 `dist/`。
2. 参考 **`nginx.conf`** 部署，其中已包含：
   - SPA history 路由回退（`try_files ... /index.html`）；
   - `/api` 反向代理到后端服务；
   - 静态资源长缓存（hashed 文件名）与 `index.html` 不缓存；
   - gzip 压缩。
3. 子目录部署时，同步修改 `VITE_BASE_URL=/admin/` 后重新构建，并在 Nginx 中对应调整 location。

## 开发约定

- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)（commitlint 强制校验），如 `feat: 新增角色管理页面`。
- Husky + lint-staged 会在提交前自动执行 ESLint / Stylelint / Prettier。
- 新增页面流程：在 `src/views` 创建组件 → 后端/Mock 菜单配置 `component` 路径 → 动态路由自动生成，无需手写路由表。

## License

MIT
