<template>
  <div class="enterprise-page">
    <div class="page-header">
      <h1 class="page-title">压力表台账</h1>
      <p class="page-subtitle">查看压力表、检定记录和待处理风险事项，现场照片与证书图片分开留存。</p>
    </div>

    <section class="card-shell table-panel">
      <div class="toolbar">
        <el-input
          v-model="keyword"
          clearable
          placeholder="搜索证书编号、出厂编号、设备、车间或安装位置"
          @keyup.enter="loadData"
        />
        <el-select v-model="status" clearable placeholder="压力表状态" style="width: 150px">
          <el-option label="在用" value="在用" />
          <el-option label="备用" value="备用" />
          <el-option label="送检" value="送检" />
          <el-option label="停用" value="停用" />
          <el-option label="报废" value="报废" />
        </el-select>
        <el-select v-model="remediationStatus" clearable placeholder="处置状态" style="width: 160px">
          <el-option label="待处理" value="pending" />
          <el-option label="已通知" value="notified" />
          <el-option label="已上传复检材料" value="rechecked" />
          <el-option label="已关闭" value="closed" />
        </el-select>
        <el-select v-model="filterType" clearable placeholder="风险筛选" style="width: 150px">
          <el-option label="待处理事项" value="todo" />
          <el-option label="30 天内到期" value="expiring" />
          <el-option label="已逾期" value="expired" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="loadData">搜索</el-button>
      </div>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="压力表" name="gauges">
          <el-table :data="gauges" stripe>
            <el-table-column prop="deviceName" label="压力表名称" min-width="150" />
            <el-table-column prop="deviceNo" label="压力表编号" min-width="150" />
            <el-table-column prop="factoryNo" label="出厂编号" min-width="130" />
            <el-table-column prop="equipmentName" label="所属设备" min-width="150" />
            <el-table-column prop="installLocation" label="安装位置" min-width="180" />
            <el-table-column prop="modelSpec" label="型号规格" min-width="140" />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === '在用' ? 'success' : 'info'" size="small">
                  {{ row.status || '-' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="检定记录" name="records">
          <el-table :data="records" stripe>
            <el-table-column prop="certNo" label="证书编号" min-width="150" />
            <el-table-column prop="factoryNo" label="出厂编号" min-width="130" />
            <el-table-column prop="instrumentName" label="仪表名称" min-width="140" />
            <el-table-column prop="equipmentName" label="所属设备" min-width="140" />
            <el-table-column prop="installLocation" label="安装位置" min-width="170" />
            <el-table-column label="图片留存" width="150">
              <template #default="{ row }">
                <div class="tag-stack">
                  <el-tag :type="row.hasImage ? 'success' : 'danger'" size="small">
                    {{ row.hasImage ? '证书已存' : '缺证书' }}
                  </el-tag>
                  <el-tag :type="row.hasInstallPhoto ? 'success' : 'warning'" size="small">
                    {{ row.hasInstallPhoto ? '现场已存' : '缺现场' }}
                  </el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="conclusion" label="结论" width="100" />
            <el-table-column prop="expiryDate" label="到期日期" width="120" />
            <el-table-column label="处置" min-width="260">
              <template #default="{ row }">
                <div class="remediation-cell">
                  <el-select v-model="row.remediationStatus" size="small" style="width: 150px">
                    <el-option label="待处理" value="pending" />
                    <el-option label="已通知" value="notified" />
                    <el-option label="已上传复检材料" value="rechecked" />
                    <el-option label="已关闭" value="closed" />
                  </el-select>
                  <el-input v-model="row.remediationNote" size="small" placeholder="处置备注" />
                  <el-button
                    size="small"
                    type="primary"
                    :loading="savingId === row._id"
                    @click="saveRemediation(row)"
                  >
                    保存
                  </el-button>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="现场照片" width="110">
              <template #default="{ row }">
                <el-button
                  v-if="row.installPhotoFileID"
                  size="small"
                  text
                  type="primary"
                  @click="previewPhoto(row)"
                >
                  查看
                </el-button>
                <span v-else class="muted">未上传</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </section>

    <el-dialog v-model="photoVisible" title="现场照片" width="560px">
      <img v-if="currentPhoto" class="photo-preview" :src="currentPhoto" alt="现场照片" />
      <p v-else class="muted">暂无现场照片。</p>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getEnterpriseGauges, getEnterpriseRecords, updateEnterpriseRecordRemediation } from '@/api/regulator'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const activeTab = ref('gauges')
const keyword = ref('')
const status = ref('')
const remediationStatus = ref('')
const filterType = ref('')
const gauges = ref([])
const records = ref([])
const loading = ref(false)
const savingId = ref('')
const photoVisible = ref(false)
const currentPhoto = ref('')

async function loadData() {
  loading.value = true
  try {
    const [gaugeRes, recordRes] = await Promise.all([
      getEnterpriseGauges(userStore.user, { keyword: keyword.value, status: status.value }),
      getEnterpriseRecords(userStore.user, {
        keyword: keyword.value,
        remediationStatus: remediationStatus.value,
        filterType: filterType.value
      })
    ])
    gauges.value = gaugeRes.list || []
    records.value = (recordRes.list || []).map((item) => ({
      ...item,
      remediationStatus: item.remediationStatus || 'pending',
      remediationNote: item.remediationNote || ''
    }))
  } finally {
    loading.value = false
  }
}

async function saveRemediation(row) {
  savingId.value = row._id
  try {
    await updateEnterpriseRecordRemediation(userStore.user, {
      id: row._id,
      remediationStatus: row.remediationStatus,
      remediationNote: row.remediationNote
    })
    ElMessage.success('处置状态已更新')
    await loadData()
  } finally {
    savingId.value = ''
  }
}

function previewPhoto(row) {
  currentPhoto.value = row.installPhotoFileID || ''
  photoVisible.value = true
}

watch([status, remediationStatus, filterType], loadData)
onMounted(loadData)
</script>

<style lang="scss" scoped>
.table-panel {
  padding: 22px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 18px;

  .el-input {
    max-width: 420px;
  }
}

.tag-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}

.remediation-cell {
  display: grid;
  grid-template-columns: 150px minmax(120px, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.muted {
  color: #8a96aa;
}

.photo-preview {
  display: block;
  max-width: 100%;
  max-height: 70vh;
  margin: 0 auto;
  border-radius: 14px;
  object-fit: contain;
}

@media (max-width: 768px) {
  .toolbar,
  .remediation-cell {
    grid-template-columns: 1fr;
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
