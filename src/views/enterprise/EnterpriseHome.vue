<template>
  <div class="enterprise-page">
    <div class="page-header">
      <h1 class="page-title">企业工作台</h1>
      <p class="page-subtitle">{{ userStore.user?.companyName }} 的设备、压力表和检定记录概览。</p>
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
            <p>设备没有绑定压力表时，会影响企业台账完整性。</p>
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
  </div>
</template>

<script setup>
import { computed, onMounted, reactive } from 'vue'
import { getEnterpriseDashboard } from '@/api/regulator'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

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
  unboundEquipments: []
})

const cards = computed(() => [
  { key: 'equipment', label: '设备', value: dashboard.summary.equipmentCount, tone: '' },
  { key: 'gauge', label: '压力表', value: dashboard.summary.gaugeCount, tone: '' },
  { key: 'expired', label: '逾期', value: dashboard.summary.expiredCount, tone: 'danger' },
  { key: 'inactive', label: '停用/报废', value: dashboard.summary.inactiveCount, tone: 'warning' }
])

const loadData = async () => {
  const result = await getEnterpriseDashboard(userStore.user)
  dashboard.summary = result.summary || dashboard.summary
  dashboard.recentRecords = result.recentRecords || []
  dashboard.unboundEquipments = result.unboundEquipments || []
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
</style>
