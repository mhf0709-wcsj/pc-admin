<template>
  <div class="dashboard-page">
    <div class="page-header">
      <h1 class="page-title">监管概览</h1>
      <p class="page-subtitle">网页端和小程序端共用同一套云开发数据。这里聚焦风险总览、重点企业和最近检定记录，方便监管快速研判。</p>
    </div>

    <section class="summary-grid">
      <div class="summary-card card-shell">
        <span class="summary-label">检定记录</span>
        <strong>{{ dashboard.summary.totalRecords }}</strong>
      </div>
      <div class="summary-card card-shell danger">
        <span class="summary-label">已过期</span>
        <strong>{{ dashboard.summary.expiredCount }}</strong>
      </div>
      <div class="summary-card card-shell warning">
        <span class="summary-label">30天内到期</span>
        <strong>{{ dashboard.summary.expiringCount }}</strong>
      </div>
      <div class="summary-card card-shell">
        <span class="summary-label">重点企业</span>
        <strong>{{ dashboard.summary.enterpriseCount }}</strong>
      </div>
    </section>

    <section class="content-grid">
      <article class="panel chart-panel card-shell">
        <div class="panel-head">
          <div>
            <h3>辖区记录分布</h3>
            <p>按当前账号可见范围统计检定记录分布。</p>
          </div>
        </div>
        <div ref="districtChartRef" class="chart-slot"></div>
      </article>

      <article class="panel chart-panel card-shell">
        <div class="panel-head">
          <div>
            <h3>检定结论分布</h3>
            <p>用于快速查看合格与不合格结构。</p>
          </div>
        </div>
        <div ref="conclusionChartRef" class="chart-slot"></div>
      </article>
    </section>

    <section class="content-grid bottom">
      <article class="panel card-shell">
        <div class="panel-head">
          <div>
            <h3>重点企业</h3>
            <p>按过期数量与即将到期数量优先排序。</p>
          </div>
          <el-button type="primary" link @click="goToEnterprises">查看全部</el-button>
        </div>

        <div v-if="dashboard.focusEnterprises.length" class="focus-list">
          <button
            v-for="item in dashboard.focusEnterprises"
            :key="item.enterpriseName"
            class="focus-item"
            type="button"
            @click="goToEnterprise(item.enterpriseName)"
          >
            <div class="focus-main">
              <strong>{{ item.enterpriseName }}</strong>
              <span>{{ item.district || '未分配辖区' }}</span>
            </div>
            <div class="focus-risk">
              <span class="risk-chip expired">{{ item.expiredCount }} 已过期</span>
              <span class="risk-chip expiring">{{ item.expiringCount }} 即将到期</span>
            </div>
          </button>
        </div>
        <el-empty v-else description="当前没有需要优先跟进的风险企业" />
      </article>

      <article class="panel card-shell">
        <div class="panel-head">
          <div>
            <h3>最近检定记录</h3>
            <p>保留监管常用字段，快速进入台账核查。</p>
          </div>
          <el-button type="primary" link @click="goToRecords">进入台账中心</el-button>
        </div>

        <el-table :data="dashboard.recentRecords" stripe>
          <el-table-column prop="certNo" label="证书编号" min-width="150" />
          <el-table-column prop="factoryNo" label="出厂编号" min-width="120" />
          <el-table-column prop="enterpriseName" label="企业" min-width="180" />
          <el-table-column prop="district" label="辖区" width="100" />
          <el-table-column prop="conclusion" label="结论" width="90">
            <template #default="{ row }">
              <el-tag :type="row.conclusion === '合格' ? 'success' : 'danger'" size="small">
                {{ row.conclusion || '未知' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="expiryDate" label="到期日期" width="120" />
        </el-table>
      </article>
    </section>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import { getDashboardData } from '@/api/regulator'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

const districtChartRef = ref()
const conclusionChartRef = ref()
let districtChart = null
let conclusionChart = null

const dashboard = reactive({
  summary: {
    totalRecords: 0,
    expiredCount: 0,
    expiringCount: 0,
    enterpriseCount: 0
  },
  focusEnterprises: [],
  recentRecords: [],
  districtStats: [],
  conclusionStats: []
})

const loadDashboard = async () => {
  const result = await getDashboardData(userStore.user)
  dashboard.summary = result.summary
  dashboard.focusEnterprises = result.focusEnterprises || []
  dashboard.recentRecords = result.recentRecords || []
  dashboard.districtStats = result.districtStats || []
  dashboard.conclusionStats = result.conclusionStats || []
  await nextTick()
  initCharts()
}

const initCharts = () => {
  if (districtChartRef.value) {
    districtChart?.dispose()
    districtChart = echarts.init(districtChartRef.value)
    districtChart.setOption({
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'],
          itemStyle: {
            borderRadius: 14,
            borderColor: '#fff',
            borderWidth: 3
          },
          label: { formatter: '{b}' },
          data: dashboard.districtStats
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
          radius: ['42%', '68%'],
          data: (dashboard.conclusionStats || []).map((item) => ({
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

const handleResize = () => {
  districtChart?.resize()
  conclusionChart?.resize()
}

const goToRecords = () => {
  router.push('/records')
}

const goToEnterprises = () => {
  router.push('/enterprises')
}

const goToEnterprise = (enterpriseName) => {
  router.push({
    path: '/records',
    query: {
      enterprise: enterpriseName,
      filter: 'risk'
    }
  })
}

onMounted(async () => {
  await loadDashboard()
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

.focus-list {
  display: grid;
  gap: 12px;
}

.focus-item {
  border: 0;
  width: 100%;
  text-align: left;
  padding: 18px;
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.86);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  cursor: pointer;

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-float);
  }
}

.focus-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;

  strong {
    color: var(--text-main);
    font-size: 16px;
  }

  span {
    color: var(--text-sub);
  }
}

.focus-risk {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.risk-chip {
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;

  &.expired {
    background: rgba(229, 72, 77, 0.12);
    color: #d03050;
  }

  &.expiring {
    background: rgba(245, 158, 11, 0.14);
    color: #b45309;
  }
}
</style>
