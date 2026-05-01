<template>
  <div class="enterprise-page">
    <div class="page-header">
      <h1 class="page-title">企业工作台</h1>
      <p class="page-subtitle">
        {{ userStore.user?.companyName || '当前企业' }} 的设备、压力表和检定记录总览。
      </p>
    </div>

    <section class="summary-grid">
      <div v-for="card in cards" :key="card.key" class="summary-card card-shell" :class="card.tone">
        <span>{{ card.label }}</span>
        <strong>{{ card.value }}</strong>
      </div>
    </section>

    <section class="content-grid">
      <article class="panel card-shell">
        <div class="panel-head">
          <div>
            <h3>待绑定设备</h3>
            <p>设备还没有绑定压力表时，会影响企业台账完整性。</p>
          </div>
          <el-button type="primary" link @click="$router.push('/enterprise/equipments')">去处理</el-button>
        </div>
        <el-table :data="dashboard.unboundEquipments" stripe>
          <el-table-column prop="equipmentName" label="设备名称" min-width="160" />
          <el-table-column prop="equipmentNo" label="设备编号" min-width="130" />
          <el-table-column prop="location" label="安装位置" min-width="160" />
        </el-table>
      </article>

      <article class="panel card-shell">
        <div class="panel-head">
          <div>
            <h3>最近检定记录</h3>
            <p>与小程序端录入记录共用同一套数据。</p>
          </div>
          <el-button type="primary" link @click="$router.push('/enterprise/gauges')">查看压力表</el-button>
        </div>
        <el-table :data="dashboard.recentRecords" stripe>
          <el-table-column prop="certNo" label="证书编号" min-width="140" />
          <el-table-column prop="factoryNo" label="出厂编号" min-width="120" />
          <el-table-column prop="instrumentName" label="仪表名称" min-width="140" />
          <el-table-column prop="expiryDate" label="到期日期" width="120">
            <template #default="{ row }">
              <el-tag :type="row.isExpired ? 'danger' : 'info'" size="small">{{ row.expiryDate || '-' }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </article>
    </section>

    <el-dialog
      v-model="reminderDialogVisible"
      title="30 天内到期提醒"
      width="720px"
      destroy-on-close
    >
      <div class="reminder-summary">
        当前有 {{ dashboard.reminders.length }} 条压力表即将在 30 天内到期，建议尽快安排送检。
      </div>

      <el-table :data="dashboard.reminders" stripe>
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
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getEnterpriseDashboard, sendReminderSms } from '@/api/regulator'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const reminderDialogVisible = ref(false)

const dashboard = reactive({
  summary: {
    equipmentCount: 0,
    gaugeCount: 0,
    expiredCount: 0,
    expiringCount: 0,
    inactiveCount: 0,
    unboundCount: 0
  },
  recentRecords: [],
  unboundEquipments: [],
  reminders: []
})

const cards = computed(() => [
  { key: 'equipment', label: '设备', value: dashboard.summary.equipmentCount, tone: '' },
  { key: 'gauge', label: '压力表', value: dashboard.summary.gaugeCount, tone: '' },
  { key: 'expired', label: '已过期', value: dashboard.summary.expiredCount, tone: 'danger' },
  { key: 'inactive', label: '停用 / 报废', value: dashboard.summary.inactiveCount, tone: 'warning' }
])

function getReminderStorageKey() {
  const today = new Date().toLocaleDateString('sv-SE')
  const companyName = userStore.user?.companyName || 'enterprise'
  return `pc-admin:enterprise-reminder:${companyName}:${today}`
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
    const result = await sendReminderSms('enterprise', {
      scene: 'enterprise_expiry_notice',
      recipients: row.phone ? [row.phone] : [],
      message: `${row.instrumentName || '压力表'} 将于 ${row.expiryDate} 到期，请尽快安排送检。`
    })
    ElMessage.success(result.message || '短信提醒接口已预留')
  } catch (error) {
    ElMessage.error(error.message || '短信提醒发送失败')
  }
}

async function loadData() {
  const result = await getEnterpriseDashboard(userStore.user)
  dashboard.summary = result.summary || dashboard.summary
  dashboard.recentRecords = result.recentRecords || []
  dashboard.unboundEquipments = result.unboundEquipments || []
  dashboard.reminders = result.reminders || []
  maybeOpenReminderDialog()
}

onMounted(loadData)
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

  span {
    color: var(--text-sub);
    font-weight: 600;
  }

  strong {
    font-size: 40px;
    line-height: 1;
    color: var(--text-main);
  }
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
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
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .summary-grid,
  .content-grid {
    grid-template-columns: 1fr;
  }
}
</style>
