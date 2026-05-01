<template>
  <div class="enterprise-page">
    <div class="page-header">
      <h1 class="page-title">压力表台账</h1>
      <p class="page-subtitle">查看企业压力表和检定记录，安装位置会随台账一起保存和展示。</p>
    </div>

    <section class="card-shell table-panel">
      <div class="toolbar">
        <el-input
          v-model="keyword"
          clearable
          placeholder="搜索压力表名称、出厂编号、所属设备或安装位置"
          @keyup.enter="loadData"
        />
        <el-select v-model="status" clearable placeholder="状态" style="width: 150px">
          <el-option label="在用" value="在用" />
          <el-option label="备用" value="备用" />
          <el-option label="送检" value="送检" />
          <el-option label="停用" value="停用" />
          <el-option label="报废" value="报废" />
        </el-select>
        <el-button type="primary" @click="loadData">搜索</el-button>
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
            <el-table-column prop="instrumentName" label="仪表名称" min-width="150" />
            <el-table-column prop="equipmentName" label="所属设备" min-width="150" />
            <el-table-column prop="installLocation" label="安装位置" min-width="180" />
            <el-table-column prop="conclusion" label="结论" width="100" />
            <el-table-column prop="verificationDate" label="检定日期" width="120" />
            <el-table-column prop="expiryDate" label="到期日期" width="120" />
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { getEnterpriseGauges, getEnterpriseRecords } from '@/api/regulator'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const activeTab = ref('gauges')
const keyword = ref('')
const status = ref('')
const gauges = ref([])
const records = ref([])

async function loadData() {
  const [gaugeRes, recordRes] = await Promise.all([
    getEnterpriseGauges(userStore.user, { keyword: keyword.value, status: status.value }),
    getEnterpriseRecords(userStore.user, { keyword: keyword.value })
  ])
  gauges.value = gaugeRes.list || []
  records.value = recordRes.list || []
}

watch(activeTab, loadData)
onMounted(loadData)
</script>

<style lang="scss" scoped>
.table-panel {
  padding: 22px;
}

.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 18px;

  .el-input {
    max-width: 420px;
  }
}

@media (max-width: 768px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
