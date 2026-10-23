<script setup lang="ts">
/**
 * 403 无权限页
 *
 * 触发场景：
 *  - 路由 meta 声明了 roles / permissions，当前用户不满足；
 *  - 后端返回 403 后由守卫跳转至此。
 *
 * 注意：前端只做「看得见 / 看不见」的体验层控制，
 * 真正的鉴权必须由后端在接口侧独立完成，否则只是掩耳盗铃。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace } from 'naive-ui'
import { AppIcon } from '@/components/AppIcon'
import { useUserStore } from '@/stores/user'

defineOptions({ name: 'ForbiddenPage' })

const router = useRouter()
const userStore = useUserStore()

/** 展示当前账号，方便用户判断是不是登错账号了 */
const currentAccount = computed(() => userStore.profile?.username ?? '未知账号')

function goHome(): void {
  void router.replace('/')
}

function switchAccount(): void {
  void userStore.logout('manual-logout')
  void router.replace({ name: 'Login' })
}
</script>

<template>
  <div class="forbidden">
    <div class="forbidden__art" aria-hidden="true">
      <AppIcon name="ShieldAlert" :size="96" />
    </div>

    <h1 class="forbidden__code">403</h1>
    <p class="forbidden__title">抱歉，你没有访问该页面的权限</p>
    <p class="forbidden__desc">
      当前登录账号：
      <strong>{{ currentAccount }}</strong>
      。如需访问，请联系管理员为该账号分配对应角色或权限点。
    </p>

    <NSpace justify="center" :size="12">
      <NButton type="primary" @click="goHome">
        <template #icon><AppIcon name="Home" /></template>
        返回首页
      </NButton>
      <NButton tertiary @click="switchAccount">
        <template #icon><AppIcon name="UserRoundCog" /></template>
        切换账号
      </NButton>
    </NSpace>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/variables.scss' as v;
@use '@/assets/styles/mixins.scss' as m;

.forbidden {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: v.$gap-xl v.$gap-md;
  text-align: center;

  &__art {
    color: var(--app-color-warning);
    opacity: 0.9;
  }

  &__code {
    margin: v.$gap-md 0 v.$gap-sm;
    font-size: 56px;
    font-weight: 700;
    line-height: 1;
    color: var(--app-color-text);
  }

  &__title {
    margin: 0 0 v.$gap-sm;
    font-size: v.$font-size-lg;
    color: var(--app-color-text);
  }

  &__desc {
    max-width: 520px;
    margin: 0 0 v.$gap-lg;
    color: var(--app-color-text-secondary);
    line-height: 1.7;
  }

  @include m.respond-to('sm') {
    &__code {
      font-size: 44px;
    }
  }
}
</style>
