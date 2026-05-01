<template>
  <div class="enterprises-page">
    <div class="page-header">
      <h1 class="page-title">企业管理</h1>
      <p class="page-subtitle">
        快速定位重点企业，查看风险画像、联系方式和当前记录规模，并直接联动到企业台账。
      </p>
    </div>

    <section class="summary-grid">
      <div class="summary-card card-shell">
        <span>企业总数</span>
        <strong>{{ enterprises.length }}</strong>
      </div>
      <div class="summary-card card-shell danger">
        <span>有过期记录企业</span>
        <strong>{{ summary.expiredEnterpriseCount }}</strong>
      </div>
      <div class="summary-card card-shell warning">
        <span>30 天内到期企业</span>
        <strong>{{ summary.expiringEnterpriseCount }}</strong>
      </div>
      <div class="summary-card card-shell">
        <span>重点风险企业</span>
        <strong>{{ summary.highRiskCount }}</strong>
      </div>
    </section>

    <section class="filter-box card-shell">
      <div class="filter-row">
        <el-input
          v-model="keyword"
          placeholder="搜索企业名称、联系人、电话、信用代码"
          clearable
          @keyup.enter="loadEnterprises"
        >
          <template #append>
            <el-button @click="loadEnterprises">搜索</el-button>
          </template>
        </el-input>

        <el-select v-model="riskFilter" placeholder="全部风险级别" clearable @change="applyRiskFilter">
          <el-option label="全部风险级别" value="" />
          <el-option label="高风险" value="high" />
          <el-option label="中风险" value="medium" />
          <el-option label="低风险" value="low" />
        </el-select>

        <el-button @click="resetFilters">重置筛选</el-button>
      </div>
    </section>

    <section class="enterprise-grid">
      <article v-for="item in filteredEnterprises" :key="item._id || item.companyName" class="enterprise-card card-shell">
        <div class="card-top">
          <div>
            <h3>{{ item.companyName || item.enterpriseName || '未命名企业' }}</h3>
            <p>{{ item.district || '未分配辖区' }}</p>
          </div>
          <div class="risk-stack">
            <el-tag :type="getRiskTagType(item)" effect="dark">{{ getRiskLevel(item) }}</el-tag>
            <span class="chip expired">过期 {{ item.expiredCount || 0 }}</span>
            <span class="chip expiring">30 天内到期 {{ item.expiringCount || 0 }}</span>
          </div>
        </div>

        <div class="detail-grid">
          <div class="detail-item">
            <span>联系人</span>
            <strong>{{ item.contact || '未填写' }}</strong>
          </div>
          <div class="detail-item">
            <span>联系电话</span>
            <strong>{{ item.phone || '未填写' }}</strong>
          </div>
          <div class="detail-item">
            <span>检定记录数</span>
            <strong>{{ item.totalRecords ?? 0 }}</strong>
          </div>
          <div class="detail-item">
            <span>创建时间</span>
            <strong>{{ item.createdAt || '未记录' }}</strong>
          </div>
        </div>

        <div class="credit-code">
          <span>统一社会信用代码</span>
          <strong>{{ item.creditCode || '未填写' }}</strong>
        </div>

        <div class="card-actions">
          <el-button @click="openEnterpriseDetail(item)">查看详情</el-button>
          <el-button @click="openRecords(item.companyName || item.enterpriseName)">查看台账</el-button>
          <el-button type="primary" @click="openRiskRecords(item.companyName || item.enterpriseName)">查看风险记录</el-button>
        </div>
      </article>
    </section>

    <el-empty v-if="!filteredEnterprises.length" description="当前筛选下没有企业数据" class="empty-block" />

    <EnterpriseDetailDrawer
      v-model="detailVisible"
      :enterprise="selectedEnterprise"
      @records="openRecords"
      @risk-records="openRiskRecords"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getEnterprises } from '@/api/regulator'
import { useUserStore } from '@/stores/user'
import EnterpriseDetailDrawer from '@/components/EnterpriseDetailDrawer.vue'

const router = useRouter()
const userStore = useUserStore()

const keyword = ref('')
const riskFilter = ref('')
const enterprises = ref([])
const detailVisible = ref(false)
const selectedEnterprise = ref(null)

const filteredEnterprises = computed(() => {
  if (!riskFilter.value) return enterprises.value
  return enterprises.value.filter((item) => {
    if (riskFilter.value === 'high') return getRiskLevel(item) === '高风险'
    if (riskFilter.value === 'medium') return getRiskLevel(item) === '中风险'
    if (riskFilter.value === 'low') return getRiskLevel(item) === '低风险'
    return true
  })
})

const summary = computed(() => {
  const expiredEnterpriseCount = enterprises.value.filter((item) => (item.expiredCount || 0) > 0).length
  const expiringEnterpriseCount = enterprises.value.filter((item) => (item.expiringCount || 0) > 0).length
  const highRiskCount = enterprises.value.filter((item) => getRiskLevel(item) === '高风险').length
  return {
    expiredEnterpriseCount,
    expiringEnterpriseCount,
    highRiskCount
  }
})

async function loadEnterprises() {
  const result = await getEnterprises(userStore.user, {
    keyword: keyword.value
  })
  enterprises.value = result.list || []
}

function resetFilters() {
  keyword.value = ''
  riskFilter.value = ''
  loadEnterprises()
}

function applyRiskFilter() {
  selectedEnterprise.value = null
}

function getRiskLevel(item) {
  if ((item?.expiredCount || 0) > 0) return '高风险'
  if ((item?.expiringCount || 0) > 0) return '中风险'
  return '低风险'
}

function getRiskTagType(item) {
  const level = getRiskLevel(item)
  if (level === '高风险') return 'danger'
  if (level === '中风险') return 'warning'
  return 'success'
}

function openEnterpriseDetail(item) {
  selectedEnterprise.value = item
  detailVisible.value = true
}

function openRecords(enterpriseName) {
  router.push({
    path: '/records',
    query: { enterprise: enterpriseName }
  })
}

function openRiskRecords(enterpriseName) {
  router.push({
    path: '/records',
    query: {
      enterprise: enterpriseName,
      filter: 'risk'
    }
  })
}

onMounted(() => {
  loadEnterprises()
})
</script>

<style lang="scss" scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 18px;
}

.summary-card {
  padding: 22px 24px;

  span {
    color: var(--text-sub);
    font-size: 13px;
  }

  strong {
    display: block;
    margin-top: 10px;
    font-size: 30px;
    color: var(--text-main);
  }

  &.danger strong {
    color: #d03050;
  }

  &.warning strong {
    color: #b45309;
  }
}

.filter-box {
  padding: 22px;
  margin-bottom: 18px;
}

.filter-row {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(180px, 0.9fr) auto;
  gap: 14px;
  align-items: center;
}

.enterprise-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.enterprise-card {
  padding: 24px;
}

.card-top {
  display: flex;
  justify-content: space-between;
  gap: 18px;

  h3 {
    color: var(--text-main);
    font-size: 20px;
  }

  p {
    margin-top: 8px;
    color: var(--text-sub);
  }
}

.risk-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.chip {
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;

  &.expired {
    background: rgba(229, 72, 77, 0.12);
    color: #d03050;
  }

  &.expiring {
    background: rgba(245, 158, 11, 0.14);
    color: #b45309;
  }
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 22px;
}

.detail-item,
.credit-code {
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.82);

  span {
    display: block;
    color: var(--text-sub);
    font-size: 12px;
    margin-bottom: 8px;
  }

  strong {
    color: var(--text-main);
  }
}

.credit-code {
  margin-top: 14px;
}

.card-actions {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.empty-block {
  margin-top: 24px;
  padding: 48px 0;
  background: rgba(255, 255, 255, 0.76);
  border-radius: 24px;
}

@media (max-width: 1200px) {
  .summary-grid,
  .enterprise-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .filter-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .summary-grid,
  .enterprise-grid,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .card-top {
    flex-direction: column;
  }

  .risk-stack {
    align-items: flex-start;
  }
}
</style>
