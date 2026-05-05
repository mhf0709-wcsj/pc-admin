<template>
  <el-drawer v-model="visibleProxy" title="记录详情" size="620px" destroy-on-close>
    <template v-if="activeRecord">
      <section class="detail-hero">
        <div>
          <h3>{{ activeRecord.certNo || '未填写证书编号' }}</h3>
          <p>{{ activeRecord.enterpriseName || '未填写企业名称' }}</p>
        </div>
        <el-tag :type="riskTagType" effect="dark">{{ riskLabel }}</el-tag>
      </section>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="详情" name="detail">
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
            <el-descriptions-item label="安装位置">{{ activeRecord.installLocation || '-' }}</el-descriptions-item>
            <el-descriptions-item label="处置状态">{{ riskStatusLabel(activeRecord.riskStatus) }}</el-descriptions-item>
          </el-descriptions>

          <div class="drawer-actions">
            <el-button @click="emitRecords">查看该企业全部台账</el-button>
            <el-button type="primary" @click="startEdit">修正记录</el-button>
          </div>
        </el-tab-pane>

        <el-tab-pane label="修正记录" name="edit">
          <el-form :model="editForm" label-width="92px" class="edit-form">
            <el-form-item label="证书编号"><el-input v-model="editForm.certNo" /></el-form-item>
            <el-form-item label="出厂编号"><el-input v-model="editForm.factoryNo" /></el-form-item>
            <el-form-item label="企业名称"><el-input v-model="editForm.enterpriseName" /></el-form-item>
            <el-form-item label="送检单位"><el-input v-model="editForm.sendUnit" /></el-form-item>
            <el-form-item label="仪表名称"><el-input v-model="editForm.instrumentName" /></el-form-item>
            <el-form-item label="型号规格"><el-input v-model="editForm.modelSpec" /></el-form-item>
            <el-form-item label="制造单位"><el-input v-model="editForm.manufacturer" /></el-form-item>
            <el-form-item label="检定依据"><el-input v-model="editForm.verificationStd" /></el-form-item>
            <el-form-item label="检定结论">
              <el-select v-model="editForm.conclusion">
                <el-option label="合格" value="合格" />
                <el-option label="不合格" value="不合格" />
              </el-select>
            </el-form-item>
            <el-form-item label="检定日期"><el-date-picker v-model="editForm.verificationDate" value-format="YYYY-MM-DD" /></el-form-item>
            <el-form-item label="到期日期"><el-date-picker v-model="editForm.expiryDate" value-format="YYYY-MM-DD" /></el-form-item>
            <el-form-item label="辖区"><el-input v-model="editForm.district" /></el-form-item>
            <el-form-item label="设备名称"><el-input v-model="editForm.equipmentName" /></el-form-item>
            <el-form-item label="安装位置"><el-input v-model="editForm.installLocation" /></el-form-item>
            <el-form-item label="处置状态">
              <el-select v-model="editForm.riskStatus">
                <el-option label="未处理" value="pending" />
                <el-option label="已通知" value="notified" />
                <el-option label="已复检" value="rechecked" />
                <el-option label="已关闭" value="closed" />
              </el-select>
            </el-form-item>
            <el-form-item label="修正说明">
              <el-input v-model="editNote" type="textarea" :rows="3" placeholder="说明本次修正原因，便于后续审计" />
            </el-form-item>
          </el-form>

          <div class="drawer-actions">
            <el-button @click="activeTab = 'detail'">取消</el-button>
            <el-button type="primary" :loading="saving" @click="saveEdit">保存修正</el-button>
          </div>
        </el-tab-pane>

        <el-tab-pane label="修改历史" name="history">
          <div v-loading="historyLoading" class="history-list">
            <article v-for="item in revisionLogs" :key="item.id" class="history-card">
              <div class="history-head">
                <strong>{{ item.operatorName || '系统' }}</strong>
                <span>{{ item.createTime }}</span>
              </div>
              <p>{{ item.note || '未填写修正说明' }}</p>
            </article>
            <el-empty v-if="!revisionLogs.length && !historyLoading" description="暂无修改历史" />
          </div>
        </el-tab-pane>
      </el-tabs>

      <section class="context-section">
        <div class="context-head">
          <div>
            <h4>同企业最近风险记录</h4>
            <p>补充该企业最近的过期或即将到期记录，便于连续处理。</p>
          </div>
          <el-button text type="primary" :loading="contextLoading" @click="loadContextRecords">刷新</el-button>
        </div>

        <div v-loading="contextLoading" class="context-shell">
          <div v-if="sameEnterpriseRiskRecords.length" class="context-list">
            <button
              v-for="item in sameEnterpriseRiskRecords"
              :key="contextKey(item)"
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
    </template>
  </el-drawer>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { getRecordRevisionLogs, getRecords, updateRecord } from '@/api/regulator'
import { useUserStore } from '@/stores/user'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  record: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue', 'records', 'saved'])

const userStore = useUserStore()
const activeRecord = ref(null)
const activeTab = ref('detail')
const contextLoading = ref(false)
const sameEnterpriseRiskRecords = ref([])
const historyLoading = ref(false)
const revisionLogs = ref([])
const saving = ref(false)
const editNote = ref('')

const editForm = reactive({
  certNo: '',
  factoryNo: '',
  enterpriseName: '',
  sendUnit: '',
  instrumentName: '',
  modelSpec: '',
  manufacturer: '',
  verificationStd: '',
  conclusion: '',
  verificationDate: '',
  expiryDate: '',
  district: '',
  equipmentName: '',
  installLocation: '',
  riskStatus: 'pending'
})

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
    if (value) fillEditForm(value)
  },
  { immediate: true }
)

watch(
  () => [props.modelValue, activeRecord.value?._id],
  async ([visible]) => {
    if (visible && activeRecord.value) {
      activeTab.value = 'detail'
      await Promise.all([loadContextRecords(), loadRevisionLogs()])
    }
    if (!visible) {
      sameEnterpriseRiskRecords.value = []
      revisionLogs.value = []
    }
  },
  { immediate: true }
)

function fillEditForm(record) {
  Object.keys(editForm).forEach((key) => {
    editForm[key] = record[key] || (key === 'riskStatus' ? 'pending' : '')
  })
  editNote.value = ''
}

function startEdit() {
  fillEditForm(activeRecord.value)
  activeTab.value = 'edit'
}

function emitRecords() {
  emit('records', activeRecord.value?.enterpriseName || '')
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
  return String(left._id || left.id || '') === String(right._id || right.id || '')
}

function contextKey(record) {
  return [record._id, record.certNo, record.factoryNo, record.expiryDate].join('|')
}

async function selectContextRecord(record) {
  activeRecord.value = { ...record }
  fillEditForm(record)
  activeTab.value = 'detail'
  await Promise.all([loadContextRecords(), loadRevisionLogs()])
}

async function loadContextRecords() {
  if (!activeRecord.value?.enterpriseName || !userStore.user) return
  contextLoading.value = true
  try {
    const result = await getRecords(userStore.user, {
      enterpriseName: activeRecord.value.enterpriseName,
      filterType: 'risk',
      page: 1,
      pageSize: 8
    })
    sameEnterpriseRiskRecords.value = (result.list || [])
      .filter((item) => !isSameRecord(item, activeRecord.value))
      .slice(0, 5)
  } finally {
    contextLoading.value = false
  }
}

async function loadRevisionLogs() {
  if (!activeRecord.value?._id) return
  historyLoading.value = true
  try {
    const result = await getRecordRevisionLogs(userStore.user, activeRecord.value._id)
    revisionLogs.value = result.list || []
  } finally {
    historyLoading.value = false
  }
}

async function saveEdit() {
  if (!activeRecord.value?._id) return
  saving.value = true
  try {
    const result = await updateRecord(userStore.user, activeRecord.value._id, { ...editForm }, editNote.value)
    activeRecord.value = result.record || { ...activeRecord.value, ...editForm }
    ElMessage.success('记录已修正')
    activeTab.value = 'detail'
    emit('saved', activeRecord.value)
    await loadRevisionLogs()
  } catch (error) {
    ElMessage.error(error?.message || '保存修正失败')
  } finally {
    saving.value = false
  }
}
</script>

<style lang="scss" scoped>
.detail-hero,
.context-head,
.context-item-main,
.drawer-actions,
.history-head {
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

.detail-grid {
  :deep(.el-descriptions__label) {
    width: 110px;
    font-weight: 600;
  }
}

.edit-form {
  :deep(.el-select),
  :deep(.el-date-editor) {
    width: 100%;
  }
}

.context-section {
  margin-top: 22px;
}

.context-head {
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

.context-shell {
  min-height: 120px;
}

.context-list,
.history-list {
  display: grid;
  gap: 10px;
}

.context-item,
.history-card {
  border: 0;
  width: 100%;
  text-align: left;
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.82);
  padding: 14px 16px;
}

.context-item {
  cursor: pointer;
}

.context-item-main strong,
.history-card strong {
  color: var(--text-main);
}

.context-item-meta,
.history-card p {
  margin-top: 10px;
  color: var(--text-sub);
  font-size: 13px;
}

.context-item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.history-head span {
  color: var(--text-sub);
  font-size: 12px;
}

.drawer-actions {
  margin-top: 20px;
  justify-content: flex-end;
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
