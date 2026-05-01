<template>
  <el-drawer v-model="visibleProxy" title="记录详情" size="560px" destroy-on-close>
    <template v-if="activeRecord">
      <section class="detail-hero">
        <div>
          <h3>{{ activeRecord.certNo || '未填写证书编号' }}</h3>
          <p>{{ activeRecord.enterpriseName || '未填写企业名称' }}</p>
        </div>
        <el-tag :type="riskTagType" effect="dark">{{ riskLabel }}</el-tag>
      </section>

      <el-descriptions :column="1" border class="detail-grid">
        <el-descriptions-item label="证书编号">{{ activeRecord.certNo || '-' }}</el-descriptions-item>
        <el-descriptions-item label="出厂编号">{{ activeRecord.factoryNo || '-' }}</el-descriptions-item>
        <el-descriptions-item label="企业名称">{{ activeRecord.enterpriseName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="送检单位">{{ activeRecord.sendUnit || '-' }}</el-descriptions-item>
        <el-descriptions-item label="设备名称">{{ activeRecord.equipmentName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="仪表名称">{{ activeRecord.instrumentName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="辖区">{{ activeRecord.district || '-' }}</el-descriptions-item>
        <el-descriptions-item label="检定结论">{{ activeRecord.conclusion || '-' }}</el-descriptions-item>
        <el-descriptions-item label="检定日期">{{ activeRecord.verificationDate || '-' }}</el-descriptions-item>
        <el-descriptions-item label="到期日期">{{ activeRecord.expiryDate || '-' }}</el-descriptions-item>
      </el-descriptions>

      <section class="context-section">
        <div class="context-head">
          <div>
            <h4>同证书编号记录</h4>
            <p>帮助判断是否存在同一证书编号的历史或相邻记录。</p>
          </div>
          <el-button text type="primary" :loading="contextLoading" @click="loadContextRecords">
            刷新
          </el-button>
        </div>

        <div v-loading="contextLoading" class="context-shell">
          <div v-if="sameCertRecords.length" class="context-list">
            <button
              v-for="item in sameCertRecords"
              :key="contextKey(item, 'cert')"
              type="button"
              class="context-item"
              @click="selectContextRecord(item)"
            >
              <div class="context-item-main">
                <strong>{{ item.certNo || '未填写证书编号' }}</strong>
                <span>{{ item.verificationDate || '-' }}</span>
              </div>
              <div class="context-item-meta">
                <span>{{ item.conclusion || '未知' }}</span>
                <span>{{ item.expiryDate || '-' }}</span>
              </div>
            </button>
          </div>
          <el-empty v-else description="没有找到同证书编号的其他记录" />
        </div>
      </section>

      <section class="context-section">
        <div class="context-head">
          <div>
            <h4>同企业最近风险记录</h4>
            <p>补充该企业最近的过期或即将到期记录，便于连续处理。</p>
          </div>
          <el-tag size="small" effect="plain">{{ sameEnterpriseRiskRecords.length }} 条</el-tag>
        </div>

        <el-alert
          v-if="contextError"
          type="warning"
          :closable="false"
          show-icon
          class="context-alert"
          :title="contextError"
        />

        <div v-loading="contextLoading" class="context-shell">
          <div v-if="sameEnterpriseRiskRecords.length" class="context-list">
            <button
              v-for="item in sameEnterpriseRiskRecords"
              :key="contextKey(item, 'enterprise')"
              type="button"
              class="context-item"
              @click="selectContextRecord(item)"
            >
              <div class="context-item-main">
                <strong>{{ item.certNo || item.factoryNo || '未填写编号' }}</strong>
                <el-tag :type="getRiskTagType(item)" size="small" effect="light">
                  {{ getRiskLabel(item) }}
                </el-tag>
              </div>
              <div class="context-item-meta">
                <span>{{ item.equipmentName || item.instrumentName || '未填写设备名称' }}</span>
                <span>{{ item.expiryDate || '-' }}</span>
              </div>
            </button>
          </div>
          <el-empty v-else description="没有可补充的同企业风险记录" />
        </div>
      </section>

      <div class="drawer-actions">
        <el-button type="primary" @click="emitRecords">查看该企业全部台账</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { getRecords } from '@/api/regulator'
import { useUserStore } from '@/stores/user'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  record: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:modelValue', 'records'])

const userStore = useUserStore()
const activeRecord = ref(null)
const contextLoading = ref(false)
const contextError = ref('')
const sameCertRecords = ref([])
const sameEnterpriseRiskRecords = ref([])

const visibleProxy = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const riskLabel = computed(() => getRiskLabel(activeRecord.value))
const riskTagType = computed(() => getRiskTagType(activeRecord.value))

watch(
  () => props.record,
  (value) => {
    activeRecord.value = value ? { ...value } : null
  },
  { immediate: true }
)

watch(
  () => [props.modelValue, activeRecord.value?.certNo, activeRecord.value?.factoryNo, activeRecord.value?.enterpriseName],
  async ([visible]) => {
    if (visible && activeRecord.value) {
      await loadContextRecords()
      return
    }
    if (!visible) {
      resetContext()
    }
  },
  { immediate: true }
)

function resetContext() {
  contextError.value = ''
  sameCertRecords.value = []
  sameEnterpriseRiskRecords.value = []
}

function emitRecords() {
  emit('records', activeRecord.value?.enterpriseName || '')
}

function getRiskLabel(record) {
  if (!record?.expiryDate) return '未标记'
  const date = dayjs(record.expiryDate)
  if (!date.isValid()) return '未标记'
  if (date.isBefore(dayjs(), 'day')) return '已过期'
  if (date.diff(dayjs(), 'day') <= 30) return '30 天内到期'
  return '正常'
}

function getRiskTagType(record) {
  const label = getRiskLabel(record)
  if (label === '已过期') return 'danger'
  if (label === '30 天内到期') return 'warning'
  return 'success'
}

function isSameRecord(left, right) {
  if (!left || !right) return false
  const leftKey = [left.certNo, left.factoryNo, left.enterpriseName, left.expiryDate, left.verificationDate].join('|')
  const rightKey = [right.certNo, right.factoryNo, right.enterpriseName, right.expiryDate, right.verificationDate].join('|')
  return leftKey === rightKey
}

function contextKey(record, scope) {
  return [scope, record.certNo, record.factoryNo, record.enterpriseName, record.verificationDate, record.expiryDate].join('|')
}

function selectContextRecord(record) {
  activeRecord.value = { ...record }
}

async function loadContextRecords() {
  if (!activeRecord.value || !userStore.user) return
  contextLoading.value = true
  contextError.value = ''

  try {
    const certKeyword = activeRecord.value.certNo || activeRecord.value.factoryNo || ''
    const enterpriseName = activeRecord.value.enterpriseName || ''

    const [certResult, enterpriseResult] = await Promise.all([
      certKeyword
        ? getRecords(userStore.user, {
            keyword: certKeyword,
            page: 1,
            pageSize: 8
          })
        : Promise.resolve({ list: [] }),
      enterpriseName
        ? getRecords(userStore.user, {
            enterpriseName,
            filterType: 'risk',
            page: 1,
            pageSize: 8
          })
        : Promise.resolve({ list: [] })
    ])

    const certList = (certResult.list || []).filter((item) => {
      if (isSameRecord(item, activeRecord.value)) return false
      if (activeRecord.value.certNo) return item.certNo === activeRecord.value.certNo
      if (activeRecord.value.factoryNo) return item.factoryNo === activeRecord.value.factoryNo
      return false
    })

    const enterpriseRiskList = (enterpriseResult.list || []).filter((item) => !isSameRecord(item, activeRecord.value))

    sameCertRecords.value = certList.slice(0, 5)
    sameEnterpriseRiskRecords.value = enterpriseRiskList.slice(0, 5)
  } catch (error) {
    sameCertRecords.value = []
    sameEnterpriseRiskRecords.value = []
    contextError.value = error?.message || '上下文记录加载失败，请稍后重试'
  } finally {
    contextLoading.value = false
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

.detail-grid {
  :deep(.el-descriptions__label) {
    width: 110px;
    font-weight: 600;
  }
}

.context-section {
  margin-top: 22px;
}

.context-head {
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

.context-alert {
  margin-top: 10px;
}

.context-shell {
  min-height: 120px;
}

.context-list {
  display: grid;
  gap: 10px;
}

.context-item {
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

.context-item-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  strong {
    color: var(--text-main);
    font-size: 15px;
  }

  span {
    color: var(--text-sub);
    font-size: 12px;
  }
}

.context-item-meta {
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
  .context-head,
  .context-item-main {
    flex-direction: column;
  }
}
</style>
