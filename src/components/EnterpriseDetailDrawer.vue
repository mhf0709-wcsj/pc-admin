<template>
  <el-drawer v-model="visibleProxy" title="企业详情" size="620px" destroy-on-close>
    <template v-if="enterprise">
      <section class="detail-hero">
        <div>
          <h3>{{ companyName || '未命名企业' }}</h3>
          <p>{{ enterprise.district || '未分配辖区' }}</p>
        </div>
        <el-tag :type="riskTagType" effect="dark">{{ riskLabel }}</el-tag>
      </section>

      <div class="detail-summary">
        <div class="detail-summary-card">
          <span>检定记录</span>
          <strong>{{ enterprise.totalRecords ?? '-' }}</strong>
        </div>
        <div class="detail-summary-card danger">
          <span>已过期</span>
          <strong>{{ enterprise.expiredCount ?? 0 }}</strong>
        </div>
        <div class="detail-summary-card warning">
          <span>30 天内到期</span>
          <strong>{{ enterprise.expiringCount ?? 0 }}</strong>
        </div>
      </div>

      <el-descriptions :column="1" border class="detail-descriptions">
        <el-descriptions-item label="企业名称">{{ companyName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="辖区">{{ enterprise.district || '-' }}</el-descriptions-item>
        <el-descriptions-item label="联系人">{{ enterprise.contact || '-' }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ enterprise.phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="信用代码">{{ enterprise.creditCode || '-' }}</el-descriptions-item>
        <el-descriptions-item label="最近到期">{{ enterprise.latestExpiryDate || '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ enterprise.createdAt || '-' }}</el-descriptions-item>
      </el-descriptions>

      <section class="risk-status-box">
        <div class="risk-status-head">
          <div>
            <h4>风险处置状态</h4>
            <p>用于记录该企业风险闭环进度，例如已通知、已复检或已关闭。</p>
          </div>
          <el-tag effect="plain">{{ riskStatusLabel(statusForm.riskStatus) }}</el-tag>
        </div>
        <el-form :model="statusForm" label-width="80px">
          <el-form-item label="状态">
            <el-select v-model="statusForm.riskStatus">
              <el-option label="未处理" value="pending" />
              <el-option label="已通知" value="notified" />
              <el-option label="已复检" value="rechecked" />
              <el-option label="已关闭" value="closed" />
            </el-select>
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="statusForm.riskStatusNote" type="textarea" :rows="2" placeholder="填写本次处置说明" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="statusSaving" @click="saveRiskStatus">保存处置状态</el-button>
            <span class="status-time">最近更新：{{ localEnterprise.riskStatusUpdateTime || '暂无' }}</span>
          </el-form-item>
        </el-form>
      </section>

      <section class="risk-section">
        <div class="risk-section-head">
          <div>
            <h4>最近风险记录</h4>
            <p>优先展示该企业最近的过期或 30 天内到期记录，可在抽屉内继续展开记录详情。</p>
          </div>
          <el-button text type="primary" :loading="riskLoading" @click="loadRiskRecords">刷新</el-button>
        </div>

        <div v-loading="riskLoading" class="risk-list-shell">
          <div v-if="riskRecords.length" class="risk-list">
            <button
              v-for="item in riskRecords"
              :key="item._id || item.certNo || item.factoryNo"
              type="button"
              class="risk-item"
              @click="openRecordDetail(item)"
            >
              <div class="risk-item-title">
                <strong>{{ item.certNo || '未填写证书编号' }}</strong>
                <el-tag :type="getRecordRiskType(item)" size="small" effect="light">
                  {{ getRecordRiskLabel(item) }}
                </el-tag>
              </div>
              <p>{{ item.equipmentName || item.instrumentName || '未填写设备名称' }}</p>
              <div class="risk-item-meta">
                <span>结论：{{ item.conclusion || '未知' }}</span>
                <span>到期：{{ item.expiryDate || '-' }}</span>
                <span>处置：{{ riskStatusLabel(item.riskStatus) }}</span>
              </div>
            </button>
          </div>
          <el-empty v-else description="当前没有可展示的风险记录摘要" />
        </div>
      </section>

      <div class="drawer-actions">
        <el-button @click="emitRecords">查看全部台账</el-button>
        <el-button type="primary" @click="emitRiskRecords">查看风险台账</el-button>
      </div>
    </template>

    <RecordDetailDrawer
      v-model="recordDetailVisible"
      :record="selectedRecord"
      @records="emit('records', $event)"
      @saved="loadRiskRecords"
    />
  </el-drawer>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { getRecords, updateEnterpriseRiskStatus } from '@/api/regulator'
import { useUserStore } from '@/stores/user'
import RecordDetailDrawer from '@/components/RecordDetailDrawer.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  enterprise: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue', 'records', 'risk-records', 'saved'])

const userStore = useUserStore()
const riskLoading = ref(false)
const riskRecords = ref([])
const recordDetailVisible = ref(false)
const selectedRecord = ref(null)
const statusSaving = ref(false)
const localEnterprise = ref({})
const statusForm = reactive({
  riskStatus: 'pending',
  riskStatusNote: ''
})

const visibleProxy = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const enterprise = computed(() => localEnterprise.value)
const companyName = computed(() => enterprise.value?.companyName || enterprise.value?.enterpriseName || '')
const riskLabel = computed(() => {
  if ((enterprise.value?.expiredCount || 0) > 0) return '高风险'
  if ((enterprise.value?.expiringCount || 0) > 0) return '中风险'
  return '低风险'
})
const riskTagType = computed(() => {
  if (riskLabel.value === '高风险') return 'danger'
  if (riskLabel.value === '中风险') return 'warning'
  return 'success'
})

watch(
  () => props.enterprise,
  (value) => {
    localEnterprise.value = value ? { ...value } : {}
    statusForm.riskStatus = localEnterprise.value.riskStatus || 'pending'
    statusForm.riskStatusNote = localEnterprise.value.riskStatusNote || ''
  },
  { immediate: true }
)

watch(
  () => [props.modelValue, companyName.value],
  async ([visible, name]) => {
    if (visible && name) {
      await loadRiskRecords()
      return
    }
    if (!visible) {
      riskRecords.value = []
      recordDetailVisible.value = false
      selectedRecord.value = null
    }
  },
  { immediate: true }
)

function riskStatusLabel(value) {
  return {
    pending: '未处理',
    notified: '已通知',
    rechecked: '已复检',
    closed: '已关闭',
    normal: '正常'
  }[value || 'pending'] || '未处理'
}

function emitRecords() {
  emit('records', companyName.value)
}

function emitRiskRecords() {
  emit('risk-records', companyName.value)
}

function openRecordDetail(record) {
  selectedRecord.value = record
  recordDetailVisible.value = true
}

function getRecordRiskLabel(record) {
  if (!record?.expiryDate) return '未标记'
  const expiry = dayjs(record.expiryDate)
  if (!expiry.isValid()) return '未标记'
  if (expiry.isBefore(dayjs(), 'day')) return '已过期'
  if (expiry.diff(dayjs(), 'day') <= 30) return '30 天内到期'
  return '正常'
}

function getRecordRiskType(record) {
  const label = getRecordRiskLabel(record)
  if (label === '已过期') return 'danger'
  if (label === '30 天内到期') return 'warning'
  return 'info'
}

async function loadRiskRecords() {
  if (!companyName.value || !userStore.user) return
  riskLoading.value = true
  try {
    const result = await getRecords(userStore.user, {
      enterpriseName: companyName.value,
      filterType: 'risk',
      page: 1,
      pageSize: 5
    })
    riskRecords.value = result.list || []
  } finally {
    riskLoading.value = false
  }
}

async function saveRiskStatus() {
  statusSaving.value = true
  try {
    const result = await updateEnterpriseRiskStatus(userStore.user, {
      id: localEnterprise.value._id,
      companyName: companyName.value,
      riskStatus: statusForm.riskStatus,
      riskStatusNote: statusForm.riskStatusNote
    })
    localEnterprise.value = {
      ...localEnterprise.value,
      ...(result.enterprise || {}),
      riskStatus: statusForm.riskStatus,
      riskStatusNote: statusForm.riskStatusNote
    }
    ElMessage.success('风险处置状态已保存')
    emit('saved', localEnterprise.value)
  } catch (error) {
    ElMessage.error(error?.message || '保存处置状态失败')
  } finally {
    statusSaving.value = false
  }
}
</script>

<style lang="scss" scoped>
.detail-hero,
.risk-section-head,
.risk-status-head,
.drawer-actions,
.risk-item-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.detail-hero {
  margin-bottom: 18px;

  h3 {
    font-size: 22px;
    color: var(--text-main);
  }

  p {
    margin-top: 8px;
    color: var(--text-sub);
  }
}

.detail-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.detail-summary-card {
  background: rgba(15, 23, 42, 0.04);
  border-radius: 18px;
  padding: 16px;

  span {
    display: block;
    color: var(--text-sub);
    font-size: 12px;
  }

  strong {
    display: block;
    margin-top: 8px;
    color: var(--text-main);
    font-size: 24px;
  }

  &.danger strong {
    color: #d03050;
  }

  &.warning strong {
    color: #b45309;
  }
}

.detail-descriptions {
  :deep(.el-descriptions__label) {
    width: 120px;
    font-weight: 600;
  }
}

.risk-status-box,
.risk-section {
  margin-top: 22px;
}

.risk-status-box {
  border-radius: 20px;
  padding: 16px;
  background: rgba(59, 130, 246, 0.06);

  :deep(.el-select) {
    width: 100%;
  }
}

.risk-status-head {
  margin-bottom: 14px;

  h4 {
    color: var(--text-main);
    font-size: 16px;
  }

  p {
    margin-top: 6px;
    color: var(--text-sub);
  }
}

.status-time {
  margin-left: 12px;
  color: var(--text-sub);
  font-size: 12px;
}

.risk-section-head {
  margin-bottom: 14px;

  h4 {
    color: var(--text-main);
    font-size: 16px;
  }

  p {
    margin-top: 6px;
    color: var(--text-sub);
    line-height: 1.7;
    font-size: 13px;
  }
}

.risk-list-shell {
  min-height: 140px;
}

.risk-list {
  display: grid;
  gap: 10px;
}

.risk-item {
  border: 0;
  width: 100%;
  text-align: left;
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.82);
  padding: 14px 16px;
  cursor: pointer;
}

.risk-item-title strong {
  color: var(--text-main);
  font-size: 15px;
}

.risk-item p,
.risk-item-meta {
  margin-top: 8px;
  color: var(--text-sub);
  font-size: 13px;
}

.risk-item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.drawer-actions {
  margin-top: 20px;
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .detail-hero,
  .drawer-actions,
  .risk-section-head,
  .risk-status-head,
  .risk-item-title {
    flex-direction: column;
  }

  .detail-summary {
    grid-template-columns: 1fr;
  }
}
</style>
