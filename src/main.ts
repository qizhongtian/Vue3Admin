/**
 * 应用入口
 *
 * 启动顺序很重要：
 *   1. 校验环境变量 —— 配置问题应该立刻暴露，而不是等到某个请求失败才被发现；
 *   2. 加载运行时配置 —— 必须在挂载前完成，否则早期请求会用到旧地址；
 *   3. 初始化 Pinia —— store 之间没有关系依赖，但 guard 会用到，必须先装；
 *   4. 注册路由守卫 —— 必须在 router 首次解析之前；
 *   5. await router.isReady() —— 等首次导航（含动态路由初始化）结束再挂载，
 *      避免受保护页面出现「闪现后跳登录」的现象。
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { setupRouterGuards } from './router/guards'
import { directives } from './directives/permission'
import { assertEnvValid, envConfig } from './config/env'
import { loadRuntimeConfig } from './config/runtime-config'
import { configureSession } from './utils/auth-session'
import './assets/styles/index.scss'

/**
 * 凭据持久化位置的选择：
 *  - local：刷新浏览器后仍然有效，体验最好，但 XSS 风险面更大；
 *  - session：关闭标签页即失效，安全性更好，代价是刷新页面需要重新登录。
 * 这里默认选择 local 并在文档中说明取舍；对安全敏感的项目建议改为 session
 * 或改用 HttpOnly Cookie 模式（VITE_AUTH_MODE=cookie）。
 */
const AUTH_STORAGE_TYPE: 'local' | 'session' = 'local'

async function bootstrap(): Promise<void> {
  assertEnvValid()
  await loadRuntimeConfig()

  configureSession(envConfig.authMode, AUTH_STORAGE_TYPE)

  const app = createApp(App)

  app.use(createPinia())

  // 守卫要在任何导航发生之前注册
  setupRouterGuards(router)

  app.use(router)

  Object.entries(directives).forEach(([name, directive]) => {
    app.directive(name, directive)
  })

  app.config.errorHandler = (error) => {
    // 统一兜底，避免单个组件异常导致整页白屏
    console.error('[app] 未捕获的组件异常', error)
  }

  // 等待首次导航完成（含动态路由初始化），避免受保护页面闪现
  await router.isReady()

  app.mount('#app')

  // 移除 index.html 中的首屏骨架
  const bootLoading = document.getElementById('app-boot-loading')
  bootLoading?.remove()
}

void bootstrap()
