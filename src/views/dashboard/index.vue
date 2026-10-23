<script setup lang="ts">
/**
 * 首页仪表盘
 *
 * 展示：概览卡片 + 两个按需引入的 ECharts 图表。
 * 接口失败时展示错误态并提供重试，而不是静默空白。
 */
import { computed } from 'vue'
import { NAlert, NButton, NCard, NGrid, NGi, NSkeleton, NStatistic } from 'naive-ui'
import type { EChartsOption } from 'echarts'
import BaseChart from '@/components/BaseChart/BaseChart.vue'
import { AppIcon } from '@/components/AppIcon'
import { fetchDashboardOverview } from '@/api/system'
import { useRequest } from '@/composables/useRequest'

defineOptions({ name: 'Dashboard' })

/**
 * useRequest 的 service 签名为 (params, signal)。
 * 首页概览没有查询参数，这里用 void 作为参数类型。
 */
const overview = useRequest<void, Awaited<ReturnType<typeof fetchDashboardOverview>>>(
  (_params, signal) => fetchDashboardOverview({ signal }),
  { immediate: true },
)

const trendOption = computed<EChartsOption>(() => {
  const trend = overview.data.value?.userTrend ?? []
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: trend.map((item) => item.date),
      boundaryGap: false,
    },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'line',
        smooth: true,
        name: '活跃用户',
        data: trend.map((item) => item.value),
        areaStyle: { opacity: 0.15 },
        itemStyle: { color: '#2f6fed' },
      },
    ],
  }
})

const roleOption = computed<EChartsOption>(() => {
  const distribution = overview.data.value?.roleDistribution ?? []
  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6 },
        label: { formatter: '{b}: {c}' },
        data: distribution.map((item) => ({ name: item.name, value: item.value })),
      },
    ],
  }
})

const statCards = computed(() => [
  { key: 'total', label: '用户总数', icon: 'Users', value: overview.data.value?.totalUsers ?? 0 },
  {
    key: 'active',
    label: '启用用户',
    icon: 'ShieldCheck',
    value: overview.data.value?.activeUsers ?? 0,
  },
  { key: 'online', label: '在线人数', icon: 'Globe', value: overview.data.value?.onlineCount ?? 0 },
  {
    key: 'visits',
    label: '今日访问',
    icon: 'LayoutDashboard',
    value: overview.data.value?.todayVisits ?? 0,
  },
])

const errorMessage = computed(() => overview.error.value?.message ?? '')
</script>

<template>
  <div class="dashboard">
    <NAlert v-if="errorMessage" type="error" :bordered="false" class="dashboard__error">
      <span>概览数据加载失败：{{ errorMessage }}</span>
      <NButton size="tiny" tertiary @click="overview.run()">重试</NButton>
    </NAlert>

    <NGrid :x-gap="16" :y-gap="16" cols="1 s:2 m:2 l:4" responsive="screen">
      <NGi v-for="card in statCards" :key="card.key">
        <NCard size="small">
          <NSkeleton v-if="overview.loading.value" height="48" />
          <NStatistic v-else :label="card.label" :value="card.value">
            <template #prefix>
              <AppIcon :name="card.icon" />
            </template>
          </NStatistic>
        </NCard>
      </NGi>
    </NGrid>

    <NGrid :x-gap="16" :y-gap="16" cols="1 l:2" responsive="screen">
      <NGi>
        <NCard title="近 7 日活跃趋势" size="small">
          <BaseChart :option="trendOption" :loading="overview.loading.value" height="300px" />
        </NCard>
      </NGi>
      <NGi>
        <NCard title="角色分布" size="small">
          <BaseChart :option="roleOption" :loading="overview.loading.value" height="300px" />
        </NCard>
      </NGi>
    </NGrid>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/variables.scss' as *;

.dashboard {
  display: flex;
  flex-direction: column;
  gap: $gap-lg;

  &__error {
    display: flex;
    gap: $gap-sm;
    align-items: center;
    justify-content: space-between;
  }
}
</style>
