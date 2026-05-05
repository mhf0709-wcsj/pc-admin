<template>
  <div class="enterprise-page">
    <div class="page-header">
      <h1 class="page-title">企业首页工作台</h1>
      <p class="page-subtitle">
        {{ userStore.user?.companyName || '当前企业' }} 的压力表、到期任务、识别任务和风险闭环总览。
      </p>
    </div>

    <section class="summary-grid">
      <div v-for="card in cards" :key="card.key" class="summary-card card-shell" :class="card.tone">
        <span>{{ card.label }}</span>
        <strong>{{ card.value }}</strong>
        <small>{{ card.hint }}</small>
      </div>
    </section>

    <section class="calendar-panel card-shell">
      <div class="panel-head">
        <div>
          <h3>到期任务日历</h3>
          <p>按本月、下月、30 天内和已逾期查看检定任务，可按设备或安装位置筛选。</p>
        </div>
        <div class="calendar-filters">
          <el-select v-model="calendarRange" placeholder="时间范围">
            <el-option label="30 天内" value="30" />
            <el-option label="本月" value="thisMonth" />
            <el-option label="下月" value="nextMonth" />
            <el-option label="已逾期" value="expired" />
          </el-select>
          <el-select v-model="calendarEquipment" clearable filterable placeholder="全部设备">
            <el-option v-for="name in equipmentOptions" :key="name" :label="name" :value="name" />
          </el-select>
          <el-input v-model="calendarLocation" clearable placeholder="筛选安装位置" />
        </div>
      </div>

      <div class="calendar-grid">
        <div
          v-for="item in filteredCalendarItems"
          :key="item.recordId || item.certNo"
          class="calendar-card"
          :class="item.statusGroup"
        >
          <div class="calendar-date">{{ item.expiryDate || '-' }}</div>
          <div class="calendar-title">{{ item.instrumentName || item.certNo || '压力表' }}</div>
          <div class="calendar-meta">
            <span>{{ item.equipmentName || '未绑定设备' }}</span>
            <span>{{ item.installLocation || '未填写安装位置' }}</span>
          </div>
          <el-tag size="small" :type="item.statusGroup === 'expired' ? 'danger' : 'warning'">
            {{ item.statusGroup === 'expired' ? '已逾期' : '即将到期' }}
          </el-tag>
        </div>
        <div v-if="!filteredCalendarItems.length" class="empty-block">
          当前筛选下没有到期任务。
        </div>
      </div>
    </section>

    <section class="content-grid">
      <article class="panel card-shell">
        <div class="panel-head">
          <div>
            <h3>整改 / 复检待办</h3>
            <p>逾期、不合格、缺少安装位置、缺少现场照片或证书图片都会进入待办。</p>
          </div>
          <el-button type="primary" link @click="$router.push('/enterprise/gauges')">进入台账处理</el-button>
        </div>
        <el-table :data="dashboard.todos" stripe>
          <el-table-column prop="todoReason" label="待办原因" min-width="120">
            <template #default="{ row }">
              <el-tag :type="row.priority === 'high' ? 'danger' : 'warning'" size="small">
                {{ row.todoReason }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="certNo" label="证书编号" min-width="130" />
          <el-table-column prop="equipmentName" label="所属设备" min-width="150" />
          <el-table-column prop="expiryDate" label="到期日期" width="120" />
          <el-table-column prop="remediationStatus" label="处置状态" width="140">
            <template #default="{ row }">
              {{ formatRemediationStatus(row.remediationStatus) }}
            </template>
          </el-table-column>
        </el-table>
      </article>

      <article class="panel card-shell">
        <div class="panel-head">
          <div>
            <h3>最近上传任务</h3>
            <p>识别任务支持后台处理，完成后会在这里同步显示。</p>
          </div>
          <el-button type="primary" link @click="$router.push('/enterprise/ai')">进入 AI 管家</el-button>
        </div>
        <el-table :data="dashboard.recentTasks" stripe>
          <el-table-column prop="name" label="任务" min-width="180" />
          <el-table-column prop="fileType" label="类型" width="90" />
          <el-table-column prop="progress" label="进度" width="110">
            <template #default="{ row }">{{ row.progress || 0 }}%</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="taskTagType(row.status)" size="small">{{ taskStatusText(row.status) }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </article>
    </section>

    <section class="panel card-shell">
      <div class="panel-head">
        <div>
          <h3>最近检定记录</h3>
          <p>网页端与小程序端录入记录共用同一套数据。</p>
        </div>
        <el-button type="primary" link @click="$router.push('/enterprise/gauges')">查看压力表</el-button>
      </div>
      <el-table :data="dashboard.recentRecords" stripe>
        <el-table-column prop="certNo" label="证书编号" min-width="140" />
        <el-table-column prop="factoryNo" label="出厂编号" min-width="120" />
        <el-table-column prop="instrumentName" label="仪表名称" min-width="140" />
        <el-table-column prop="equipmentName" label="所属设备" min-width="140" />
        <el-table-column prop="expiryDate" label="到期日期" width="120">
          <template #default="{ row }">
            <el-tag :type="row.isExpired ? 'danger' : 'info'" size="small">{{ row.expiryDate || '-' }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { getEnterpriseDashboard } from '@/api/regulator'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const calendarRange = ref('30')
const calendarEquipment = ref('')
const calendarLocation = ref('')

const dashboard = reactive({
  summary: {
    equipmentCount: 0,
    gaugeCount: 0,
    expiredCount: 0,
    expiringCount: 0,
    nonConformingCount: 0,
    missingLocationCount: 0,
    todoCount: 0,
    missingPhotoCount: 0
  },
  recentRecords: [],
  recentTasks: [],
  reminders: [],
  todos: [],
  calendarItems: []
})

const cards = computed(() => [
  { key: 'gauge', label: '总压力表数', value: dashboard.summary.gaugeCount, tone: '', hint: '企业台账总量' },
  { key: 'expiring', label: '30 天到期', value: dashboard.summary.expiringCount, tone: 'warning', hint: '需要安排送检' },
  { key: 'expired', label: '逾期', value: dashboard.summary.expiredCount, tone: 'danger', hint: '优先处理' },
  { key: 'bad', label: '不合格', value: dashboard.summary.nonConformingCount, tone: 'danger', hint: '需要整改复检' },
  { key: 'location', label: '待补安装位置', value: dashboard.summary.missingLocationCount, tone: 'warning', hint: '影响现场核验' },
  { key: 'photo', label: '缺现场照片', value: dashboard.summary.missingPhotoCount, tone: 'warning', hint: '补齐证据链' },
  { key: 'task', label: '最近上传任务', value: dashboard.recentTasks.length, tone: '', hint: '后台识别任务' },
  { key: 'todo', label: '待处理事项', value: dashboard.summary.todoCount, tone: 'warning', hint: '整改/复检闭环' }
])

const equipmentOptions = computed(() => {
  const names = dashboard.calendarItems.map((item) => item.equipmentName).filter(Boolean)
  return Array.from(new Set(names)).sort()
})

const filteredCalendarItems = computed(() => {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const nextMonth = new Date(year, month + 1, 1)
  const nextMonthEnd = new Date(year, month + 2, 0)
  const thisMonthEnd = new Date(year, month + 1, 0)
  const in30 = new Date(now)
  in30.setDate(now.getDate() + 30)

  return dashboard.calendarItems.filter((item) => {
    const date = item.expiryDate ? new Date(`${item.expiryDate}T00:00:00`) : null
    if (!date || Number.isNaN(date.getTime())) return false
    if (calendarEquipment.value && item.equipmentName !== calendarEquipment.value) return false
    if (calendarLocation.value && !String(item.installLocation || '').includes(calendarLocation.value)) return false
    if (calendarRange.value === 'expired') return date < now
    if (calendarRange.value === 'thisMonth') return date >= now && date <= thisMonthEnd
    if (calendarRange.value === 'nextMonth') return date >= nextMonth && date <= nextMonthEnd
    return date >= now && date <= in30
  })
})

function formatRemediationStatus(status) {
  const map = {
    pending: '待处理',
    notified: '已通知',
    rechecked: '已上传复检材料',
    closed: '已关闭'
  }
  return map[status] || '待处理'
}

function taskStatusText(status) {
  const map = {
    queued: '排队中',
    processing: '处理中',
    done: '已完成',
    error: '失败'
  }
  return map[status] || status || '-'
}

function taskTagType(status) {
  if (status === 'done') return 'success'
  if (status === 'error') return 'danger'
  if (status === 'processing') return 'primary'
  return 'info'
}

async function loadData() {
  const result = await getEnterpriseDashboard(userStore.user)
  dashboard.summary = { ...dashboard.summary, ...(result.summary || {}) }
  dashboard.recentRecords = result.recentRecords || []
  dashboard.recentTasks = result.recentTasks || []
  dashboard.reminders = result.reminders || []
  dashboard.todos = result.todos || []
  dashboard.calendarItems = result.calendarItems || []
}

onMounted(loadData)
</script>

<style lang="scss" scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 18px;
}

.summary-card {
  padding: 20px;
  display: grid;
  gap: 8px;

  span {
    color: var(--text-sub);
    font-size: 14px;
  }

  strong {
    color: var(--text-main);
    font-size: 30px;
  }

  small {
    color: var(--text-soft);
  }

  &.warning strong {
    color: #d97706;
  }

  &.danger strong {
    color: #dc2626;
  }
}

.calendar-panel,
.panel {
  padding: 22px;
  margin-bottom: 18px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;

  h3 {
    color: var(--text-main);
    font-size: 20px;
  }

  p {
    margin-top: 6px;
    color: var(--text-sub);
  }
}

.calendar-filters {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;

  .el-select,
  .el-input {
    width: 170px;
  }
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 12px;
}

.calendar-card {
  padding: 15px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(248, 250, 252, 0.86);

  &.expired {
    border-color: rgba(239, 68, 68, 0.25);
    background: rgba(254, 242, 242, 0.9);
  }
}

.calendar-date {
  color: #2563eb;
  font-weight: 800;
}

.calendar-title {
  margin-top: 8px;
  color: var(--text-main);
  font-weight: 700;
}

.calendar-meta {
  display: grid;
  gap: 4px;
  margin: 8px 0 12px;
  color: var(--text-sub);
  font-size: 13px;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 18px;
}

.empty-block {
  grid-column: 1 / -1;
  padding: 22px;
  text-align: center;
  color: var(--text-soft);
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.8);
}

@media (max-width: 1180px) {
  .summary-grid,
  .content-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .summary-grid,
  .content-grid {
    grid-template-columns: 1fr;
  }

  .panel-head,
  .calendar-filters {
    flex-direction: column;
    align-items: stretch;
  }

  .calendar-filters .el-select,
  .calendar-filters .el-input {
    width: 100%;
  }
}
</style>
