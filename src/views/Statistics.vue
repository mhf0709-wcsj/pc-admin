<template>
  <div class="statistics-page">
    <div class="page-header">
      <h1 class="page-title">统计分析</h1>
      <p class="page-subtitle">
        基于当前监管账号可见范围，集中查看到期风险、辖区分布和重点企业排名，并支持直接展开企业详情。
      </p>
    </div>

    <section class="summary-grid">
      <div class="summary-card card-shell">
        <span class="summary-label">检定记录</span>
        <strong>{{ summary.totalRecords }}</strong>
      </div>
      <div class="summary-card card-shell danger">
        <span class="summary-label">已过期</span>
        <strong>{{ summary.expiredCount }}</strong>
      </div>
      <div class="summary-card card-shell warning">
        <span class="summary-label">30 天内到期</span>
        <strong>{{ summary.expiringCount }}</strong>
      </div>
      <div class="summary-card card-shell">
        <span class="summary-label">企业总数</span>
        <strong>{{ summary.enterpriseCount }}</strong>
      </div>
    </section>

    <section class="content-grid">
      <article class="panel chart-panel card-shell">
        <div class="panel-head">
          <div>
            <h3>辖区记录分布</h3>
            <p>快速识别当前辖区内记录量高的区域。</p>
          </div>
        </div>
        <div ref="districtChartRef" class="chart-slot"></div>
      </article>

      <article class="panel chart-panel card-shell">
        <div class="panel-head">
          <div>
            <h3>检定结论结构</h3>
            <p>观察合格与不合格记录占比，辅助判断近期质量风险。</p>
          </div>
        </div>
        <div ref="conclusionChartRef" class="chart-slot"></div>
      </article>
    </section>

    <section class="content-grid bottom">
      <article class="panel card-shell">
        <div class="panel-head">
          <div>
            <h3>重点企业排名</h3>
            <p>按过期数量和即将到期数量排序，可直接展开企业详情。</p>
          </div>
          <el-button link type="primary" @click="goToEnterprises">查看全部</el-button>
        </div>

        <el-table :data="focusEnterprises" stripe @row-click="openEnterpriseDetail">
          <el-table-column prop="enterpriseName" label="企业" min-width="180" />
          <el-table-column prop="district" label="辖区" width="100" />
          <el-table-column prop="expiredCount" label="已过期" width="90" />
          <el-table-column prop="expiringCount" label="30 天内到期" width="120" />
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button link type="primary" @click.stop="openEnterpriseDetail(row)">查看详情</el-button>
            </template>
          </el-table-column>
        </el-table>
      </article>

      <article class="panel card-shell">
        <div class="panel-head">
          <div>
            <h3>风险结构</h3>
            <p>帮助监管人员判断当前工作重点是存量风险还是即将到期风险。</p>
          </div>
        </div>

        <div class="risk-metric-list">
          <div class="risk-metric">
            <span>风险记录总量</span>
            <strong>{{ summary.expiredCount + summary.expiringCount }}</strong>
          </div>
          <div class="risk-metric">
            <span>过期占风险比</span>
            <strong>{{ expiredRate }}</strong>
          </div>
          <div class="risk-metric">
            <span>到期占风险比</span>
            <strong>{{ expiringRate }}</strong>
          </div>
          <div class="risk-metric">
            <span>重点企业数</span>
            <strong>{{ focusEnterprises.length }}</strong>
          </div>
        </div>

        <div class="risk-tip-box">
          <h4>建议动作</h4>
          <p>{{ riskSuggestion }}</p>
        </div>
      </article>
    </section>

    <EnterpriseDetailDrawer
      v-model="detailVisible"
      :enterprise="selectedEnterprise"
      @records="goToEnterpriseRecords"
      @risk-records="goToRiskRecords"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import { getDashboardData } from '@/api/regulator'
import { useUserStore } from '@/stores/user'
import EnterpriseDetailDrawer from '@/components/EnterpriseDetailDrawer.vue'

const router = useRouter()
const userStore = useUserStore()

const districtChartRef = ref()
const conclusionChartRef = ref()
const detailVisible = ref(false)
const selectedEnterprise = ref(null)
let districtChart = null
let conclusionChart = null

const summary = reactive({
  totalRecords: 0,
  expiredCount: 0,
  expiringCount: 0,
  enterpriseCount: 0
})

const districtStats = ref([])
const conclusionStats = ref([])
const focusEnterprises = ref([])

const expiredRate = computed(() => {
  const total = summary.expiredCount + summary.expiringCount
  if (!total) return '0%'
  return `${Math.round((summary.expiredCount / total) * 100)}%`
})

const expiringRate = computed(() => {
  const total = summary.expiredCount + summary.expiringCount
  if (!total) return '0%'
  return `${Math.round((summary.expiringCount / total) * 100)}%`
})

const riskSuggestion = computed(() => {
  if (!summary.expiredCount && !summary.expiringCount) {
    return '当前没有明显风险记录，可以继续关注新增企业和后续到期趋势。'
  }
  if (summary.expiredCount >= summary.expiringCount) {
    return '当前以已过期风险为主，建议优先处理重点企业的存量问题，再回看即将到期台账。'
  }
  return '当前以即将到期风险为主，建议提前通知重点企业，减少过期记录继续累积。'
})

async function loadStatistics() {
  const result = await getDashboardData(userStore.user)
  Object.assign(summary, result.summary || {})
  districtStats.value = result.districtStats || []
  conclusionStats.value = result.conclusionStats || []
  focusEnterprises.value = result.focusEnterprises || []
  await nextTick()
  initCharts()
}

function initCharts() {
  if (districtChartRef.value) {
    districtChart?.dispose()
    districtChart = echarts.init(districtChartRef.value)
    districtChart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, top: 30, bottom: 30 },
      xAxis: {
        type: 'category',
        data: districtStats.value.map((item) => item.name),
        axisLabel: { color: '#64748b' }
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#64748b' },
        splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.16)' } }
      },
      series: [
        {
          type: 'bar',
          data: districtStats.value.map((item) => item.value),
          barMaxWidth: 34,
          itemStyle: {
            borderRadius: [10, 10, 0, 0],
            color: '#3b82f6'
          }
        }
      ]
    })
  }

  if (conclusionChartRef.value) {
    conclusionChart?.dispose()
    conclusionChart = echarts.init(conclusionChartRef.value)
    conclusionChart.setOption({
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['46%', '72%'],
          label: { formatter: '{b} {d}%' },
          itemStyle: {
            borderColor: '#fff',
            borderWidth: 4
          },
          data: (conclusionStats.value || []).map((item) => ({
            ...item,
            itemStyle: {
              color: item.name === '合格' ? '#18a058' : '#e5484d'
            }
          }))
        }
      ]
    })
  }
}

function handleResize() {
  districtChart?.resize()
  conclusionChart?.resize()
}

function openEnterpriseDetail(row) {
  selectedEnterprise.value = row
  detailVisible.value = true
}

function goToEnterprises() {
  router.push('/enterprises')
}

function goToRiskRecords(enterpriseName) {
  router.push({
    path: '/records',
    query: {
      enterprise: enterpriseName,
      filter: 'risk'
    }
  })
}

function goToEnterpriseRecords(enterpriseName) {
  router.push({
    path: '/records',
    query: { enterprise: enterpriseName }
  })
}

onMounted(async () => {
  await loadStatistics()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  districtChart?.dispose()
  conclusionChart?.dispose()
})
</script>

<style lang="scss" scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin-bottom: 22px;
}

.summary-card {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;

  &.danger {
    background: linear-gradient(180deg, rgba(229, 72, 77, 0.12) 0%, rgba(255, 255, 255, 0.88) 100%);
  }

  &.warning {
    background: linear-gradient(180deg, rgba(245, 158, 11, 0.12) 0%, rgba(255, 255, 255, 0.88) 100%);
  }

  strong {
    font-size: 40px;
    line-height: 1;
    color: var(--text-main);
  }
}

.summary-label {
  color: var(--text-sub);
  font-weight: 600;
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;

  &.bottom {
    margin-top: 18px;
    align-items: start;
  }
}

.panel {
  padding: 24px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;

  h3 {
    font-size: 20px;
    color: var(--text-main);
  }

  p {
    margin-top: 8px;
    color: var(--text-sub);
    line-height: 1.7;
  }
}

.chart-slot {
  height: 320px;
}

.risk-metric-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.risk-metric {
  padding: 18px;
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.82);

  span {
    display: block;
    color: var(--text-sub);
    font-size: 12px;
    margin-bottom: 10px;
  }

  strong {
    color: var(--text-main);
    font-size: 28px;
    line-height: 1;
  }
}

.risk-tip-box {
  margin-top: 18px;
  padding: 18px 20px;
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.08) 0%, rgba(255, 255, 255, 0.86) 100%);

  h4 {
    color: var(--text-main);
    font-size: 16px;
  }

  p {
    margin-top: 10px;
    color: var(--text-sub);
    line-height: 1.8;
  }
}

@media (max-width: 1200px) {
  .summary-grid,
  .content-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 768px) {
  .summary-grid,
  .content-grid,
  .risk-metric-list {
    grid-template-columns: 1fr;
  }
}
</style>
