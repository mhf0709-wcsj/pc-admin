<template>
  <el-drawer v-model="visibleProxy" title="企业详情" size="560px" destroy-on-close>
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
        <el-descriptions-item label="统一社会信用代码">{{ enterprise.creditCode || '-' }}</el-descriptions-item>
        <el-descriptions-item label="最近到期">{{ enterprise.latestExpiryDate || '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ enterprise.createdAt || '-' }}</el-descriptions-item>
      </el-descriptions>

      <section class="risk-section">
        <div class="risk-section-head">
          <div>
            <h4>最近风险记录</h4>
            <p>优先展示该企业最近的过期或 30 天内到期记录，便于抽屉内直接判断处理重点。</p>
          </div>
          <el-button text type="primary" :loading="riskLoading" @click="loadRiskRecords">
            刷新
          </el-button>
        </div>

        <div class="risk-overview">
          <div class="risk-overview-card">
            <span>风险记录数</span>
            <strong>{{ riskRecords.length }}</strong>
          </div>
          <div class="risk-overview-card danger">
            <span>已过期</span>
            <strong>{{ riskOverview.expired }}</strong>
          </div>
          <div class="risk-overview-card warning">
            <span>30 天内到期</span>
            <strong>{{ riskOverview.expiring }}</strong>
          </div>
        </div>

        <el-alert
          v-if="riskError"
          type="warning"
          :closable="false"
          show-icon
          class="risk-alert"
          :title="riskError"
        />

        <div v-loading="riskLoading" class="risk-list-shell">
          <div v-if="riskRecords.length" class="risk-list">
            <button
              v-for="item in riskRecords"
              :key="item.certNo || item.factoryNo || item.expiryDate"
              type="button"
              class="risk-item"
              @click="openRecordDetail(item)"
            >
              <div class="risk-item-main">
                <div class="risk-item-title">
                  <strong>{{ item.certNo || '未填写证书编号' }}</strong>
                  <el-tag :type="getRecordRiskType(item)" size="small" effect="light">
                    {{ getRecordRiskLabel(item) }}
                  </el-tag>
                </div>
                <p>{{ item.equipmentName || item.instrumentName || '未填写设备名称' }}</p>
              </div>
              <div class="risk-item-meta">
                <span>结论：{{ item.conclusion || '未知' }}</span>
                <span>到期：{{ item.expiryDate || '-' }}</span>
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
    />
  </el-drawer>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { getRecords } from '@/api/regulator'
import { useUserStore } from '@/stores/user'
import RecordDetailDrawer from '@/components/RecordDetailDrawer.vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  enterprise: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:modelValue', 'records', 'risk-records'])

const userStore = useUserStore()
const riskLoading = ref(false)
const riskError = ref('')
const riskRecords = ref([])
const recordDetailVisible = ref(false)
const selectedRecord = ref(null)

const visibleProxy = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const companyName = computed(() => props.enterprise?.companyName || props.enterprise?.enterpriseName || '')
const riskLabel = computed(() => {
  if ((props.enterprise?.expiredCount || 0) > 0) return '高风险'
  if ((props.enterprise?.expiringCount || 0) > 0) return '中风险'
  return '低风险'
})
const riskTagType = computed(() => {
  if (riskLabel.value === '高风险') return 'danger'
  if (riskLabel.value === '中风险') return 'warning'
  return 'success'
})
const riskOverview = computed(() => ({
  expired: riskRecords.value.filter((item) => getRecordRiskLabel(item) === '已过期').length,
  expiring: riskRecords.value.filter((item) => getRecordRiskLabel(item) === '30 天内到期').length
}))

watch(
  () => [props.modelValue, companyName.value],
  async ([visible, name]) => {
    if (visible && name) {
      await loadRiskRecords()
      return
    }
    if (!visible) {
      riskError.value = ''
      riskRecords.value = []
      recordDetailVisible.value = false
      selectedRecord.value = null
    }
  },
  { immediate: true }
)

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
  riskError.value = ''
  try {
    const result = await getRecords(userStore.user, {
      enterpriseName: companyName.value,
      filterType: 'risk',
      page: 1,
      pageSize: 5
    })
    riskRecords.value = result.list || []
  } catch (error) {
    riskRecords.value = []
    riskError.value = error?.message || '最近风险记录加载失败，请稍后重试'
  } finally {
    riskLoading.value = false
  }
}
</script>

<style lang="scss" scoped>
.detail-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
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

.detail-summary,
.risk-overview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.detail-summary {
  margin-bottom: 18px;
}

.detail-summary-card,
.risk-overview-card {
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

.risk-section {
  margin-top: 22px;
}

.risk-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;

  h4 {
    color: var(--text-main);
    font-size: 16px;
    font-weight: 700;
  }

  p {
    margin-top: 6px;
    color: var(--text-sub);
    line-height: 1.7;
    font-size: 13px;
  }
}

.risk-alert {
  margin-top: 12px;
}

.risk-list-shell {
  margin-top: 14px;
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
  transition: transform 0.18s ease, box-shadow 0.18s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-float);
  }
}

.risk-item-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  strong {
    color: var(--text-main);
    font-size: 15px;
  }
}

.risk-item-main p {
  margin-top: 8px;
  color: var(--text-sub);
  font-size: 13px;
}

.risk-item-meta {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;

  span {
    font-size: 12px;
    color: var(--text-sub);
  }
}

.drawer-actions {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

@media (max-width: 768px) {
  .detail-hero,
  .drawer-actions,
  .risk-section-head,
  .risk-item-title {
    flex-direction: column;
  }

  .detail-summary,
  .risk-overview {
    grid-template-columns: 1fr;
  }
}
</style>
