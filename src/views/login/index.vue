<script setup lang="ts">
/**
 * 登录页
 *
 * 覆盖的要求：
 *  - 账号 / 密码输入、密码显示与隐藏、表单必填校验；
 *  - 登录按钮加载态、失败错误提示、**防止重复提交**；
 *  - 登录成功后跳转「用户原本访问的页面」，否则走默认首页；
 *  - 响应式布局（桌面 / 平板 / 移动）；
 *  - 背景、Logo、标题均可配置。
 *
 * 防重复提交的实现：
 *   submitting 作为唯一真源，发起请求前置 true，finally 置 false；
 *   按钮的 loading 与禁用都由它驱动，而不是靠 setTimeout。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NCard, NForm, NFormItem, NInput, NAlert, NSpace } from 'naive-ui'
import type { FormInst, FormRules } from 'naive-ui'
import { AppIcon } from '@/components/AppIcon'
import { LoginPageConfig } from '@/config/app'
import { envConfig } from '@/config/env'
import { useUserStore, resolveLoginErrorMessage } from '@/stores/user'
import { usePermissionStore } from '@/stores/permission'
import { notifySuccess } from '@/utils/notify'

defineOptions({ name: 'LoginPage' })

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const permissionStore = usePermissionStore()

const formRef = ref<FormInst | null>(null)

const model = reactive({
  username: 'admin',
  password: 'admin123',
  remember: true,
})

/** 密码是否明文显示 */
const showPassword = ref(false)
/** 是否正在提交，防重复提交的关键标志 */
const submitting = ref(false)
/** 表单内联错误提示 */
const errorMessage = ref('')

const rules: FormRules = {
  username: [{ required: true, message: '请输入账号', trigger: ['blur', 'input'] }],
  password: [
    { required: true, message: '请输入密码', trigger: ['blur', 'input'] },
    { min: 6, message: '密码长度不能少于 6 位', trigger: ['blur'] },
  ],
}

/** 原始访问地址，登录后回跳 */
const redirectPath = computed(() => {
  const redirect = route.query.redirect
  if (typeof redirect === 'string' && redirect.startsWith('/')) {
    return redirect
  }
  return ''
})

async function handleSubmit(): Promise<void> {
  if (submitting.value) {
    return
  }

  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  submitting.value = true
  errorMessage.value = ''

  try {
    await userStore.login({
      username: model.username.trim(),
      password: model.password,
      remember: model.remember,
    })

    /**
     * 登录成功后先初始化动态路由，再跳转。
     * 显式做一次的意义：即使目标页面在菜单权限之外，
     * 也不会因为路由还没注册而被判成 404。
     */
    await permissionStore.initPermission(router)

    notifySuccess(`欢迎回来，${userStore.nickname || userStore.username}`)

    await router.replace(redirectPath.value || '/')
  } catch (error) {
    // 登录失败场景统一交给 resolveLoginErrorMessage，避免各处文案不一致
    errorMessage.value = resolveLoginErrorMessage(error)
    // 失败后清理可能残留的半初始化状态
    if (!userStore.token) {
      permissionStore.resetPermission()
    }
  } finally {
    submitting.value = false
  }
}

function fillDemoAccount(username: string, password: string): void {
  model.username = username
  model.password = password
  errorMessage.value = ''
}

/** 回车提交 */
function handleKeyup(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    void handleSubmit()
  }
}

onMounted(() => {
  // 已经登录的用户不应停留在登录页（例如手动输入 /login）
  void permissionStore.isInitialized
})
</script>

<template>
  <div class="login">
    <!-- 背景：使用 public/ 下的固定路径资源，便于配置长期缓存 -->
    <div class="login__bg" />

    <div class="login__content">
      <section class="login__intro">
        <div class="login__brand">
          <span class="login__logo">
            <AppIcon name="Globe" :size="28" />
          </span>
          <h1 class="login__title">{{ LoginPageConfig.TITLE }}</h1>
        </div>
        <p class="login__subtitle">{{ LoginPageConfig.SUBTITLE }}</p>
        <ul class="login__features">
          <li>Vue 3 + TypeScript + Vite 8（Rolldown）</li>
          <li>ofetch 请求层与无感刷新 Token</li>
          <li>动态路由 / 菜单 / 按钮三级权限</li>
          <li>Cesium 三维模块按需异步加载</li>
        </ul>
      </section>

      <NCard class="login__card" :bordered="false" size="large">
        <h2 class="login__form-title">账号登录</h2>

        <NAlert v-if="errorMessage" type="error" :bordered="false" class="login__error">
          {{ errorMessage }}
        </NAlert>

        <NForm ref="formRef" :model="model" :rules="rules" label-placement="left" :label-width="0">
          <NFormItem path="username">
            <NInput
              v-model:value="model.username"
              size="large"
              placeholder="请输入账号"
              :disabled="submitting"
              autocomplete="username"
              @keyup="handleKeyup"
            >
              <template #prefix>
                <AppIcon name="Users" :size="18" />
              </template>
            </NInput>
          </NFormItem>

          <NFormItem path="password">
            <NInput
              v-model:value="model.password"
              size="large"
              :type="showPassword ? 'text' : 'password'"
              placeholder="请输入密码"
              :disabled="submitting"
              autocomplete="current-password"
              show-password-on="click"
              @keyup="handleKeyup"
            >
              <template #prefix>
                <AppIcon name="KeyRound" :size="18" />
              </template>
              <template #suffix>
                <NButton
                  text
                  type="default"
                  :focusable="false"
                  :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                  @click="showPassword = !showPassword"
                >
                  <AppIcon :name="showPassword ? 'EyeOff' : 'Eye'" :size="18" />
                </NButton>
              </template>
            </NInput>
          </NFormItem>

          <NButton
            type="primary"
            size="large"
            block
            :loading="submitting"
            :disabled="submitting"
            @click="handleSubmit"
          >
            {{ submitting ? '登录中…' : '登录' }}
          </NButton>
        </NForm>

        <div class="login__demo">
          <span class="login__demo-label">演示账号</span>
          <NSpace vertical :size="4">
            <button
              v-for="account in LoginPageConfig.DEMO_ACCOUNTS"
              :key="account.username"
              type="button"
              class="login__demo-item"
              :disabled="submitting"
              @click="fillDemoAccount(account.username, account.password)"
            >
              <strong>{{ account.username }}</strong>
              <span>{{ account.desc }}</span>
            </button>
          </NSpace>
        </div>

        <p class="login__env">
          当前环境：{{ envConfig.appEnv }}
          <template v-if="envConfig.useMock">· Mock 已启用</template>
        </p>
      </NCard>
    </div>

    <footer class="login__footer">© 2026 企业后台管理系统 · 基于 Vue 3 + TypeScript 构建</footer>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/variables.scss' as *;
@use '@/assets/styles/mixins.scss' as *;

.login {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  overflow: hidden;

  &__bg {
    position: absolute;
    inset: 0;
    // 固定路径资源：部署后由 Nginx 配置长期缓存
    background: url('/login-bg.svg') center / cover no-repeat;
    background-color: var(--app-color-surface-secondary);
  }

  &__content {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: 1fr 420px;
    gap: $gap-xl;
    align-items: center;
    width: min(1200px, 92vw);
  }

  &__brand {
    display: flex;
    gap: $gap-sm;
    align-items: center;
  }

  &__logo {
    @include flex-center;

    width: 48px;
    height: 48px;
    color: #fff;
    background: linear-gradient(135deg, var(--app-color-primary), #7aa2ff);
    border-radius: $radius-lg;
  }

  &__title {
    margin: 0;
    font-size: 30px;
    font-weight: 700;
    color: var(--app-color-text);
  }

  &__subtitle {
    margin: $gap-sm 0 $gap-lg;
    color: var(--app-color-text-secondary);
  }

  &__features {
    padding: 0;
    margin: 0;
    list-style: none;
    color: var(--app-color-text-secondary);

    li {
      display: flex;
      align-items: center;
      margin-bottom: $gap-sm;

      &::before {
        display: inline-block;
        width: 6px;
        height: 6px;
        margin-right: $gap-sm;
        content: '';
        background: var(--app-color-primary);
        border-radius: 50%;
      }
    }
  }

  &__card {
    border-radius: $radius-lg;
    box-shadow: var(--app-shadow-card);
  }

  &__form-title {
    margin: 0 0 $gap-lg;
    font-size: 20px;
    font-weight: 600;
  }

  &__error {
    margin-bottom: $gap-md;
  }

  &__demo {
    margin-top: $gap-lg;
    padding-top: $gap-md;
    border-top: 1px dashed var(--app-color-border);
  }

  &__demo-label {
    display: block;
    margin-bottom: $gap-sm;
    font-size: $font-size-xs;
    color: var(--app-color-text-tertiary);
  }

  &__demo-item {
    display: flex;
    gap: $gap-sm;
    align-items: baseline;
    width: 100%;
    padding: $gap-xs $gap-sm;
    font-size: $font-size-sm;
    text-align: left;
    cursor: pointer;
    background: transparent;
    border: none;
    border-radius: $radius-sm;
    transition: background $transition-fast;

    &:hover:not(:disabled) {
      background: var(--app-color-hover);
    }

    span {
      color: var(--app-color-text-tertiary);
    }
  }

  &__env {
    margin: $gap-md 0 0;
    font-size: $font-size-xs;
    color: var(--app-color-text-tertiary);
  }

  &__footer {
    position: absolute;
    bottom: $gap-md;
    z-index: 1;
    font-size: $font-size-xs;
    color: var(--app-color-text-tertiary);
  }

  // 平板
  @include respond-to('lg') {
    &__content {
      grid-template-columns: 1fr;
      gap: $gap-lg;
    }

    &__intro {
      text-align: center;
    }

    &__features {
      display: none;
    }
  }

  // 移动端
  @include respond-to('sm') {
    padding: $gap-md;

    &__title {
      font-size: 24px;
    }
  }
}
</style>
