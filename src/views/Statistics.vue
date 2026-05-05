<template>
  <div class="statistics-page">
    <div class="page-header">
      <h1 class="page-title">统计分析</h1>
      <p class="page-subtitle">
        基于当前监管账号可见范围，按辖区、企业、月份、风险状态交叉筛选风险分布和重点企业。
      </p>
    </div>

    <section class="filter-panel card-shell">
      <el-select v-model="filters.district" placeholder="全部辖区" clearable>
        <el-option v-for="item in districts" :key="item" :label="item" :value="item" />
      </el-select>
      <el-select v-model="filters.enterpriseName" placeholder="全部企业" clearable filterable>
        <el-option v-for="item in enterpriseOptions" :key="item" :label="item" :value="item" />
      </el-select>
      <el-date-picker v-model="filters.month" type="month" value-format="YYYY-MM" placeholder="选择月份" />
      <el-select v-model="filters.riskStatus" placeholder="全部处置状态" clearable>
        <el-option label="未处理" value="pending" />
        <el-option label="已通知" value="notified" />
        <el-option label="已复检" value="rechecked" />
        <el-option label="已关闭" value="closed" />
      </el-select>
      <el-button @click="resetFilters">重置</el-button>
      <el-button type="primary" :loading="loading" @click="loadStatistics">应用筛选</el-button>
    </section>

    <section class="summary-grid">
      <div class="summary-card card-shell"><span class="summary-label">检定记录</span><strong>{{ summary.totalRecords }}</strong></div>
      <div class="summary-card card-shell danger"><span class="summary-label">已过期</span><strong>{{ summary.expiredCount }}</strong></div>
      <div class="summary-card card-shell warning"><span class="summary-label">30 天内到期</span><strong>{{ summary.expiringCount }}</strong></div>
      <div class="summary-card card-shell"><span class="summary-label">企业总数</span><strong>{{ summary.enterpriseCount }}</strong></div>
    </section>

    <section class="content-grid">
      <article class="panel chart-panel card-shell">
        <div class="panel-head"><div><h3>辖区记录分布</h3><p>按筛选条件展示各辖区记录量。</p></div></div>
        <div ref="districtChartRef" class="chart-slot"></div>
      </article>

      <article class="panel chart-panel card-shell">
        <div class="panel-head"><div><h3>风险处置状态</h3><p>观察未处理、已通知、已复检、已关闭的占比。</p></div></div>
        <div ref="riskStatusChartRef" class="chart-slot"></div>
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
        <div class="panel-head"><div><h3>风险结构</h3><p>判断当前工作重点是存量过期风险还是临期风险。</p></div></div>

        <div class="risk-metric-list">
          <div class="risk-metric"><span>风险记录总量</span><strong>{{ summary.expiredCount + summary.expiringCount }}</strong></div>
          <div class="risk-metric"><span>过期占风险比</span><strong>{{ expiredRate }}</strong></div>
          <div class="risk-metric"><span>到期占风险比</span><strong>{{ expiringRate }}</strong></div>
          <div class="risk-metric"><span>重点企业数</span><strong>{{ focusEnterprises.length }}</strong></div>
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
import { districts } from '@/api/config'
import { getDashboardData } from '@/api/regulator'
import { useUserStore } from '@/stores/user'
import EnterpriseDetailDrawer from '@/components/EnterpriseDetailDrawer.vue'

const router = useRouter()
const userStore = useUserStore()

const districtChartRef = ref()
const riskStatusChartRef = ref()
const detailVisible = ref(false)
const selectedEnterprise = ref(null)
const loading = ref(false)
let districtChart = null
let riskStatusChart = null

const filters = reactive({
  district: '',
  enterpriseName: '',
  month: '',
  riskStatus: ''
})

const summary = reactive({
  totalRecords: 0,
  expiredCount: 0,
  expiringCount: 0,
  enterpriseCount: 0
})

const districtStats = ref([])
const riskStatusStats = ref([])
const focusEnterprises = ref([])
const enterpriseOptions = ref([])

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
  if (!summary.expiredCount && !summary.expiringCount) return '当前筛选条件下没有明显风险记录，可继续关注新增企业和后续到期趋势。'
  if (summary.expiredCount >= summary.expiringCount) return '当前以已过期风险为主，建议优先处理重点企业的存量问题，再回看即将到期台账。'
  return '当前以即将到期风险为主，建议提前通知重点企业，减少过期记录继续累积。'
})

async function loadStatistics() {
  loading.value = true
  try {
    const result = await getDashboardData(userStore.user, { ...filters })
    Object.assign(summary, result.summary || {})
    districtStats.value = result.districtStats || []
    riskStatusStats.value = result.riskStatusStats || []
    focusEnterprises.value = result.focusEnterprises || []
    enterpriseOptions.value = result.enterpriseOptions || []
    await nextTick()
    initCharts()
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.district = ''
  filters.enterpriseName = ''
  filters.month = ''
  filters.riskStatus = ''
  loadStatistics()
}

function riskStatusLabel(value) {
  return {
    pending: '未处理',
    notified: '已通知',
    rechecked: '已复检',
    closed: '已关闭',
    normal: '正常'
  }[value || 'pending'] || '未处理'
}

function initCharts() {
  if (districtChartRef.value) {
    districtChart?.dispose()
    districtChart = echarts.init(districtChartRef.value)
    districtChart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, top: 30, bottom: 30 },
      xAxis: { type: 'category', data: districtStats.value.map((item) => item.name), axisLabel: { color: '#64748b' } },
      yAxis: { type: 'value', axisLabel: { color: '#64748b' }, splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.16)' } } },
      series: [{ type: 'bar', data: districtStats.value.map((item) => item.value), barMaxWidth: 34, itemStyle: { borderRadius: [10, 10, 0, 0], color: '#3b82f6' } }]
    })
  }

  if (riskStatusChartRef.value) {
    riskStatusChart?.dispose()
    riskStatusChart = echarts.init(riskStatusChartRef.value)
    riskStatusChart.setOption({
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie',
        radius: ['46%', '72%'],
        label: { formatter: '{b} {d}%' },
        itemStyle: { borderColor: '#fff', borderWidth: 4 },
        data: riskStatusStats.value.map((item) => ({
          name: riskStatusLabel(item.name),
          value: item.value
        }))
      }]
    })
  }
}

function handleResize() {
  districtChart?.resize()
  riskStatusChart?.resize()
}

function openEnterpriseDetail(row) {
  selectedEnterprise.value = row
  detailVisible.value = true
}

function goToEnterprises() {
  router.push('/enterprises')
}

function goToRiskRecords(enterpriseName) {
  router.push({ path: '/records', query: { enterprise: enterpriseName, filter: 'risk' } })
}

function goToEnterpriseRecords(enterpriseName) {
  router.push({ path: '/records', query: { enterprise: enterpriseName } })
}

onMounted(async () => {
  await loadStatistics()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  districtChart?.dispose()
  riskStatusChart?.dispose()
})
</script>

<style lang="scss" scoped>
.filter-panel {
  padding: 18px;
  margin-bottom: 18px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) auto auto;
  gap: 12px;
  align-items: center;

  :deep(.el-date-editor) {
    width: 100%;
  }
}

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
  .filter-panel,
  .summary-grid,
  .content-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 768px) {
  .filter-panel,
  .summary-grid,
  .content-grid,
  .risk-metric-list {
    grid-template-columns: 1fr;
  }
}
</style>
