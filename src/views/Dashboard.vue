<template>
  <div class="dashboard-page">
    <div class="page-header">
      <h1 class="page-title">监管概览</h1>
      <p class="page-subtitle">
        汇总当前账号可见范围内的风险记录、重点企业和最近检定记录，适合监管端快速判断和联动处理。
      </p>
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
        <span class="summary-label">30 天内到期</span>
        <strong>{{ dashboard.summary.expiringCount }}</strong>
      </div>
      <div class="summary-card card-shell">
        <span class="summary-label">企业总数</span>
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
            <p>快速对比合格与不合格记录结构。</p>
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
            <p>按过期数量与即将到期数量排序，可直接展开查看企业画像。</p>
          </div>
          <el-button type="primary" link @click="goToEnterprises">查看全部</el-button>
        </div>

        <div v-if="dashboard.focusEnterprises.length" class="focus-list">
          <button
            v-for="item in dashboard.focusEnterprises"
            :key="item.companyName || item.enterpriseName"
            class="focus-item"
            type="button"
            @click="openEnterpriseDetail(item)"
          >
            <div class="focus-main">
              <strong>{{ item.companyName || item.enterpriseName }}</strong>
              <span>{{ item.district || '未分配辖区' }}</span>
            </div>
            <div class="focus-risk">
              <span class="risk-chip expired">{{ item.expiredCount || 0 }} 已过期</span>
              <span class="risk-chip expiring">{{ item.expiringCount || 0 }} 即将到期</span>
            </div>
          </button>
        </div>
        <el-empty v-else description="当前没有需要优先跟进的风险企业" />
      </article>

      <article class="panel card-shell">
        <div class="panel-head">
          <div>
            <h3>最近检定记录</h3>
            <p>保留监管常用字段，可直接展开查看记录详情。</p>
          </div>
          <el-button type="primary" link @click="goToRecords">进入台账中心</el-button>
        </div>

        <el-table :data="dashboard.recentRecords" stripe @row-click="openRecordDetail">
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

    <EnterpriseDetailDrawer
      v-model="enterpriseDrawerVisible"
      :enterprise="selectedEnterprise"
      @records="goToEnterpriseRecords"
      @risk-records="goToEnterpriseRiskRecords"
    />

    <RecordDetailDrawer
      v-model="recordDrawerVisible"
      :record="selectedRecord"
      @records="goToEnterpriseRecords"
    />

    <el-dialog
      v-model="reminderDialogVisible"
      title="30 天内到期提醒"
      width="760px"
      destroy-on-close
    >
      <div class="reminder-summary">
        当前可见范围内有 {{ dashboard.reminders.length }} 条压力表将在 30 天内到期，建议优先跟进。
      </div>

      <el-table :data="dashboard.reminders" stripe>
        <el-table-column prop="enterpriseName" label="企业" min-width="180" />
        <el-table-column prop="instrumentName" label="仪表名称" min-width="150" />
        <el-table-column prop="certNo" label="证书编号" min-width="150" />
        <el-table-column prop="expiryDate" label="到期日期" width="120" />
        <el-table-column prop="statusLabel" label="提醒状态" width="120" />
        <el-table-column label="短信提醒" width="150">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :disabled="!row.phone"
              @click="triggerSmsReminder(row)"
            >
              {{ row.phone ? '预留短信接口' : '未留手机号' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button @click="dismissReminderDialog">我知道了</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import { getDashboardData, sendReminderSms } from '@/api/regulator'
import { useUserStore } from '@/stores/user'
import EnterpriseDetailDrawer from '@/components/EnterpriseDetailDrawer.vue'
import RecordDetailDrawer from '@/components/RecordDetailDrawer.vue'

const router = useRouter()
const userStore = useUserStore()

const districtChartRef = ref()
const conclusionChartRef = ref()
const enterpriseDrawerVisible = ref(false)
const recordDrawerVisible = ref(false)
const reminderDialogVisible = ref(false)
const selectedEnterprise = ref(null)
const selectedRecord = ref(null)
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
  conclusionStats: [],
  reminders: []
})

function getReminderStorageKey() {
  const today = new Date().toLocaleDateString('sv-SE')
  const scope = userStore.user?.username || 'admin'
  return `pc-admin:admin-reminder:${scope}:${today}`
}

function maybeOpenReminderDialog() {
  if (!dashboard.reminders.length) return
  if (localStorage.getItem(getReminderStorageKey())) return
  reminderDialogVisible.value = true
}

function dismissReminderDialog() {
  reminderDialogVisible.value = false
  localStorage.setItem(getReminderStorageKey(), '1')
}

async function triggerSmsReminder(row) {
  try {
    const result = await sendReminderSms('admin', {
      scene: 'admin_expiry_notice',
      recipients: row.phone ? [row.phone] : [],
      message: `${row.enterpriseName || '企业'}的${row.instrumentName || '压力表'}将于 ${row.expiryDate} 到期，请及时安排送检。`
    })
    ElMessage.success(result.message || '短信提醒接口已预留')
  } catch (error) {
    ElMessage.error(error.message || '短信提醒发送失败')
  }
}

async function loadDashboard() {
  const result = await getDashboardData(userStore.user)
  dashboard.summary = result.summary || dashboard.summary
  dashboard.focusEnterprises = result.focusEnterprises || []
  dashboard.recentRecords = result.recentRecords || []
  dashboard.districtStats = result.districtStats || []
  dashboard.conclusionStats = result.conclusionStats || []
  dashboard.reminders = result.reminders || []
  await nextTick()
  initCharts()
  maybeOpenReminderDialog()
}

function initCharts() {
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

function handleResize() {
  districtChart?.resize()
  conclusionChart?.resize()
}

function openEnterpriseDetail(item) {
  selectedEnterprise.value = item
  enterpriseDrawerVisible.value = true
}

function openRecordDetail(row) {
  selectedRecord.value = row
  recordDrawerVisible.value = true
}

function goToRecords() {
  router.push('/records')
}

function goToEnterprises() {
  router.push('/enterprises')
}

function goToEnterpriseRecords(enterpriseName) {
  router.push({
    path: '/records',
    query: { enterprise: enterpriseName }
  })
}

function goToEnterpriseRiskRecords(enterpriseName) {
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
  gap: 18px;

  strong {
    color: var(--text-main);
    font-size: 16px;
  }

  span {
    color: var(--text-sub);
    font-size: 13px;
  }
}

.focus-risk {
  margin-top: 12px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.risk-chip {
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
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

.reminder-summary {
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 247, 237, 0.9);
  color: #9a3412;
  line-height: 1.7;
}

@media (max-width: 1200px) {
  .summary-grid,
  .content-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 768px) {
  .summary-grid,
  .content-grid {
    grid-template-columns: 1fr;
  }

  .focus-main {
    flex-direction: column;
  }
}
</style>
