<template>
  <div class="records-page">
    <div class="page-header">
      <h1 class="page-title">台账中心</h1>
      <p class="page-subtitle">
        统一查看检定记录、到期风险和企业送检情况，支持批量选择、批量导出、批量发送到期提醒和记录修正。
      </p>
    </div>

    <section class="toolbar card-shell">
      <div class="toolbar-grid">
        <el-input
          v-model="filters.keyword"
          placeholder="搜索证书编号、出厂编号、送检单位、设备名称"
          clearable
          @keyup.enter="submitQuery"
        />
        <el-select v-model="filters.district" placeholder="全部辖区" clearable>
          <el-option v-for="item in districts" :key="item" :label="item" :value="item" />
        </el-select>
        <el-select v-model="filters.enterpriseName" placeholder="全部企业" clearable filterable>
          <el-option label="全部企业" value="" />
          <el-option v-for="item in enterpriseOptions" :key="item" :label="item" :value="item" />
        </el-select>
        <el-select v-model="filters.conclusion" placeholder="全部结论" clearable>
          <el-option label="合格" value="合格" />
          <el-option label="不合格" value="不合格" />
        </el-select>
        <el-select v-model="filters.riskStatus" placeholder="全部处置状态" clearable>
          <el-option label="未处理" value="pending" />
          <el-option label="已通知" value="notified" />
          <el-option label="已复检" value="rechecked" />
          <el-option label="已关闭" value="closed" />
        </el-select>
      </div>

      <div class="quick-filters">
        <button
          v-for="item in quickFilters"
          :key="item.value"
          type="button"
          class="quick-chip"
          :class="{ active: filters.filterType === item.value }"
          @click="applyQuickFilter(item.value)"
        >
          {{ item.label }}
        </button>
      </div>

      <div class="summary-strip">
        <div class="summary-pill"><span>当前结果</span><strong>{{ total }}</strong></div>
        <div class="summary-pill danger"><span>已过期</span><strong>{{ riskSummary.expired }}</strong></div>
        <div class="summary-pill warning"><span>30 天内到期</span><strong>{{ riskSummary.expiring }}</strong></div>
        <div class="summary-pill"><span>已选中</span><strong>{{ selectedRows.length }}</strong></div>
      </div>

      <div class="toolbar-actions">
        <el-button @click="resetFilters">重置筛选</el-button>
        <el-button :disabled="!selectedRows.length" @click="exportSelected">批量导出</el-button>
        <el-button :disabled="!selectedRows.length" :loading="reminding" @click="sendSelectedReminders">
          批量发送到期提醒
        </el-button>
        <el-button :loading="exporting" @click="exportCurrentFilters">导出当前筛选</el-button>
        <el-button type="primary" :loading="loading" @click="submitQuery">立即查询</el-button>
      </div>
    </section>

    <section class="table-panel card-shell">
      <div class="panel-head">
        <div>
          <h3>检定记录</h3>
          <p>共 {{ total }} 条结果，可批量勾选后导出或发送到期提醒。</p>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="records"
        stripe
        row-key="_id"
        @row-click="openRecordDetail"
        @selection-change="selectedRows = $event"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column label="证书编号" prop="certNo" min-width="160" show-overflow-tooltip />
        <el-table-column label="出厂编号" prop="factoryNo" min-width="140" show-overflow-tooltip />
        <el-table-column label="企业" prop="enterpriseName" min-width="180" show-overflow-tooltip />
        <el-table-column label="设备名称" prop="equipmentName" min-width="140" show-overflow-tooltip />
        <el-table-column label="辖区" prop="district" width="100" />
        <el-table-column label="结论" width="100">
          <template #default="{ row }">
            <el-tag :type="row.conclusion === '合格' ? 'success' : 'danger'" size="small">
              {{ row.conclusion || '未知' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="风险状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getRiskTagType(row)" size="small" effect="light">
              {{ getRiskLabel(row) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="处置状态" width="110">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ riskStatusLabel(row.riskStatus) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="检定日期" prop="verificationDate" width="120" />
        <el-table-column label="到期日期" width="120">
          <template #default="{ row }">
            <span :class="getExpiryClass(row.expiryDate)">{{ row.expiryDate || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click.stop="openRecordDetail(row)">查看详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next"
          @size-change="loadRecords"
          @current-change="loadRecords"
        />
      </div>
    </section>

    <RecordDetailDrawer
      v-model="detailVisible"
      :record="selectedRecord"
      @records="goToEnterpriseRecords"
      @saved="handleRecordSaved"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { batchSendReminderSms, getRecords } from '@/api/regulator'
import { districts } from '@/api/config'
import { useUserStore } from '@/stores/user'
import RecordDetailDrawer from '@/components/RecordDetailDrawer.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const loading = ref(false)
const exporting = ref(false)
const reminding = ref(false)
const records = ref([])
const selectedRows = ref([])
const total = ref(0)
const enterpriseOptions = ref([])
const detailVisible = ref(false)
const selectedRecord = ref(null)

const quickFilters = [
  { label: '全部记录', value: '' },
  { label: '已过期', value: 'expired' },
  { label: '30 天内到期', value: 'expiring' },
  { label: '风险记录', value: 'risk' }
]

const filters = reactive({
  keyword: '',
  district: '',
  enterpriseName: '',
  conclusion: '',
  filterType: '',
  riskStatus: ''
})

const pagination = reactive({
  page: 1,
  pageSize: 20
})

const riskSummary = computed(() => {
  let expired = 0
  let expiring = 0
  for (const item of records.value) {
    const label = getRiskLabel(item)
    if (label === '已过期') expired += 1
    if (label === '30 天内到期') expiring += 1
  }
  return { expired, expiring }
})

function applyRouteFilter() {
  filters.enterpriseName = route.query.enterprise || ''
  filters.filterType = route.query.filter || ''
  filters.riskStatus = route.query.riskStatus || ''
}

async function loadRecords() {
  loading.value = true
  try {
    const result = await getRecords(userStore.user, {
      ...filters,
      page: pagination.page,
      pageSize: pagination.pageSize
    })
    records.value = result.list || []
    total.value = result.total || 0
    enterpriseOptions.value = result.enterpriseOptions || []
    selectedRows.value = []
  } finally {
    loading.value = false
  }
}

function submitQuery() {
  pagination.page = 1
  loadRecords()
}

function applyQuickFilter(value) {
  filters.filterType = value
  pagination.page = 1
  loadRecords()
}

function resetFilters() {
  filters.keyword = ''
  filters.district = ''
  filters.enterpriseName = ''
  filters.conclusion = ''
  filters.filterType = ''
  filters.riskStatus = ''
  pagination.page = 1
  loadRecords()
}

function openRecordDetail(row) {
  selectedRecord.value = row
  detailVisible.value = true
}

function handleRecordSaved(record) {
  const index = records.value.findIndex((item) => item._id === record._id)
  if (index >= 0) records.value[index] = record
  selectedRecord.value = record
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

function getRiskLabel(row) {
  if (!row?.expiryDate) return '未标记'
  const date = dayjs(row.expiryDate)
  if (!date.isValid()) return '未标记'
  if (date.isBefore(dayjs(), 'day')) return '已过期'
  if (date.diff(dayjs(), 'day') <= 30) return '30 天内到期'
  return '正常'
}

function getRiskTagType(row) {
  const label = getRiskLabel(row)
  if (label === '已过期') return 'danger'
  if (label === '30 天内到期') return 'warning'
  return 'success'
}

function getExpiryClass(value) {
  if (!value) return ''
  const date = dayjs(value)
  if (!date.isValid()) return ''
  if (date.isBefore(dayjs(), 'day')) return 'expired'
  if (date.diff(dayjs(), 'day') <= 30) return 'expiring'
  return ''
}

function escapeCsvValue(value) {
  const text = String(value ?? '').replace(/"/g, '""')
  return `"${text}"`
}

function buildCsv(rows) {
  const headers = [
    '证书编号',
    '出厂编号',
    '企业名称',
    '送检单位',
    '设备名称',
    '仪表名称',
    '辖区',
    '检定结论',
    '风险状态',
    '处置状态',
    '检定日期',
    '到期日期'
  ]
  const lines = rows.map((item) => [
    item.certNo,
    item.factoryNo,
    item.enterpriseName,
    item.sendUnit,
    item.equipmentName,
    item.instrumentName,
    item.district,
    item.conclusion,
    getRiskLabel(item),
    riskStatusLabel(item.riskStatus),
    item.verificationDate,
    item.expiryDate
  ].map(escapeCsvValue).join(','))

  return `\uFEFF${headers.map(escapeCsvValue).join(',')}\n${lines.join('\n')}`
}

function downloadBlob(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function exportRows(rows, scope) {
  if (!rows.length) {
    ElMessage.warning('没有可导出的记录')
    return
  }
  const timestamp = dayjs().format('YYYYMMDD_HHmmss')
  downloadBlob(buildCsv(rows), `pressure-records-${scope}-${timestamp}.csv`)
  ElMessage.success(`已导出 ${rows.length} 条记录`)
}

function exportSelected() {
  exportRows(selectedRows.value, 'selected')
}

async function exportCurrentFilters() {
  exporting.value = true
  try {
    const exportPageSize = Math.max(total.value || 0, pagination.pageSize, 200)
    const result = await getRecords(userStore.user, {
      ...filters,
      page: 1,
      pageSize: exportPageSize
    })
    exportRows(result.list || [], 'filtered')
  } finally {
    exporting.value = false
  }
}

async function sendSelectedReminders() {
  if (!selectedRows.value.length) return
  await ElMessageBox.confirm(
    `确认向选中的 ${selectedRows.value.length} 条台账发送到期提醒？当前短信接口为预留占位，会写入操作日志。`,
    '批量发送提醒',
    { type: 'warning' }
  )
  reminding.value = true
  try {
    const result = await batchSendReminderSms(userStore.user, selectedRows.value.map((item) => item._id))
    ElMessage.success(`已生成 ${result.total || 0} 条提醒任务`)
  } catch (error) {
    ElMessage.error(error?.message || '批量发送提醒失败')
  } finally {
    reminding.value = false
  }
}

function goToEnterpriseRecords(enterpriseName) {
  router.push({ path: '/records', query: { enterprise: enterpriseName } })
}

onMounted(() => {
  applyRouteFilter()
  loadRecords()
})
</script>

<style lang="scss" scoped>
.toolbar,
.table-panel {
  padding: 24px;
}

.toolbar {
  margin-bottom: 18px;
}

.toolbar-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
  gap: 14px;
}

.quick-filters,
.summary-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.quick-chip {
  border: 0;
  background: rgba(15, 23, 42, 0.05);
  color: var(--text-sub);
  border-radius: 999px;
  padding: 10px 14px;
  cursor: pointer;
  font-weight: 600;

  &.active {
    background: rgba(30, 94, 255, 0.12);
    color: var(--primary-color);
  }
}

.summary-pill {
  min-width: 118px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.04);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--text-sub);

  strong {
    color: var(--text-main);
    font-size: 20px;
  }

  &.danger strong {
    color: #d03050;
  }

  &.warning strong {
    color: #b45309;
  }
}

.toolbar-actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.panel-head {
  margin-bottom: 18px;

  h3 {
    color: var(--text-main);
    font-size: 20px;
  }

  p {
    margin-top: 8px;
    color: var(--text-sub);
  }
}

.pagination {
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
}

.expired {
  color: #d03050;
  font-weight: 700;
}

.expiring {
  color: #b45309;
  font-weight: 700;
}

@media (max-width: 1200px) {
  .toolbar-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .toolbar-grid {
    grid-template-columns: 1fr;
  }

  .toolbar-actions {
    justify-content: stretch;
    flex-direction: column;
  }

  .summary-pill {
    flex: 1 1 45%;
  }
}
</style>
