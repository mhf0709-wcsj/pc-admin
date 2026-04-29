<template>
  <div class="enterprises-page">
    <div class="page-header">
      <h1 class="page-title">企业管理</h1>
      <p class="page-subtitle">网页端企业列表用于查看风险企业、联系信息和当前记录规模，便于监管人员快速定位重点对象。</p>
    </div>

    <section class="filter-box card-shell">
      <el-input
        v-model="keyword"
        placeholder="搜索企业名称、联系人、电话、统一社会信用代码"
        clearable
        @keyup.enter="loadEnterprises"
      >
        <template #append>
          <el-button @click="loadEnterprises">搜索</el-button>
        </template>
      </el-input>
    </section>

    <section class="enterprise-grid">
      <article v-for="item in enterprises" :key="item._id" class="enterprise-card card-shell">
        <div class="card-top">
          <div>
            <h3>{{ item.companyName || '未命名企业' }}</h3>
            <p>{{ item.district || '未分配辖区' }}</p>
          </div>
          <div class="risk-stack">
            <span class="chip expired">过期 {{ item.expiredCount }}</span>
            <span class="chip expiring">到期 {{ item.expiringCount }}</span>
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
            <span>记录数</span>
            <strong>{{ item.totalRecords }}</strong>
          </div>
          <div class="detail-item">
            <span>创建时间</span>
            <strong>{{ item.createdAt || '未记录' }}</strong>
          </div>
        </div>

        <div class="card-actions">
          <el-button @click="openRecords(item.companyName)">查看台账</el-button>
          <el-button type="primary" @click="openRiskRecords(item.companyName)">查看风险记录</el-button>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getEnterprises } from '@/api/regulator'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

const keyword = ref('')
const enterprises = ref([])

const loadEnterprises = async () => {
  const result = await getEnterprises(userStore.user, {
    keyword: keyword.value
  })
  enterprises.value = result.list || []
}

const openRecords = (enterpriseName) => {
  router.push({
    path: '/records',
    query: { enterprise: enterpriseName }
  })
}

const openRiskRecords = (enterpriseName) => {
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
.filter-box {
  padding: 22px;
  margin-bottom: 18px;
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

.detail-item {
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

.card-actions {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
