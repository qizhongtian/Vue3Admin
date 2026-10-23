<script setup lang="ts">
/**
 * ECharts 基础图表组件
 *
 * 按需引入（而不是整包 import 'echarts'）：
 * 全量引入会带来数 MB 的体积，本项目只需要折线/柱状/饼图三种图元。
 *
 * 生命周期处理：
 *  - 使用 ResizeObserver 而非 window.resize：能正确处理「侧边栏折叠」这类
 *    容器尺寸变化（window 尺寸没变但容器变了的情况）；
 *  - 卸载时必须 dispose，否则会残留 Canvas 与事件监听导致内存泄漏。
 */
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'

// 注册按需使用的图元与组件
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
])

const props = withDefaults(
  defineProps<{
    /** 图表配置 */
    option: EChartsOption
    height?: string
    loading?: boolean
  }>(),
  {
    height: '320px',
    loading: false,
  },
)

const containerRef = ref<HTMLDivElement | null>(null)
const chartInstance = shallowRef<echarts.ECharts | null>(null)
let observer: ResizeObserver | null = null

function render(): void {
  if (!chartInstance.value) {
    return
  }
  chartInstance.value.setOption(props.option, true)
}

function resize(): void {
  chartInstance.value?.resize()
}

onMounted(() => {
  if (!containerRef.value) {
    return
  }
  chartInstance.value = echarts.init(containerRef.value)
  render()

  // 观察容器尺寸变化，比 window.resize 更准确
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      resize()
    })
    observer.observe(containerRef.value)
  }
})

watch(
  () => props.option,
  () => {
    render()
  },
  { deep: true },
)

watch(
  () => props.loading,
  (value) => {
    if (!chartInstance.value) {
      return
    }
    if (value) {
      chartInstance.value.showLoading('default', { text: '加载中', color: '#2f6fed' })
    } else {
      chartInstance.value.hideLoading()
    }
  },
)

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  // 销毁实例，释放 Canvas 与内部事件监听
  chartInstance.value?.dispose()
  chartInstance.value = null
})
</script>

<template>
  <div class="base-chart">
    <div ref="containerRef" class="base-chart__canvas" :style="{ height }" />
  </div>
</template>

<style scoped lang="scss">
.base-chart {
  width: 100%;

  &__canvas {
    width: 100%;
    min-height: 200px;
  }
}
</style>
