<template>
  <div class="records-page">
    <div class="page-header">
      <h1 class="page-title">台账中心</h1>
      <p class="page-subtitle">统一查看检定记录、到期风险和企业台账。当前网页端优先服务监管查询，不在这里承接企业录入流程。</p>
    </div>

    <section class="toolbar card-shell">
      <div class="toolbar-grid">
        <el-input v-model="filters.keyword" placeholder="搜索证书编号、出厂编号、送检单位" clearable @keyup.enter="loadRecords" />
        <el-select v-model="filters.district" placeholder="全部辖区" clearable>
          <el-option v-for="item in districts" :key="item" :label="item" :value="item" />
        </el-select>
        <el-select v-model="filters.enterpriseName" placeholder="全部企业" clearable>
          <el-option label="全部企业" value="" />
          <el-option v-for="item in enterpriseOptions" :key="item" :label="item" :value="item" />
        </el-select>
        <el-select v-model="filters.conclusion" placeholder="全部结论" clearable>
          <el-option label="合格" value="合格" />
          <el-option label="不合格" value="不合格" />
        </el-select>
      </div>

      <div class="quick-filters">
        <button
          v-for="item in quickFilters"
          :key="item.value"
          type="button"
          class="quick-chip"
          :class="{ active: filters.filterType === item.value }"
          @click="filters.filterType = item.value; loadRecords()"
        >
          {{ item.label }}
        </button>
      </div>

      <div class="toolbar-actions">
        <el-button @click="resetFilters">重置筛选</el-button>
        <el-button type="primary" @click="loadRecords">立即查询</el-button>
      </div>
    </section>

    <section class="table-panel card-shell">
      <div class="panel-head">
        <div>
          <h3>检定记录</h3>
          <p>共 {{ total }} 条结果，网页端与小程序端共用 `pressure_records` 数据集合。</p>
        </div>
      </div>

      <el-table v-loading="loading" :data="records" stripe>
        <el-table-column prop="certNo" label="证书编号" min-width="150" />
        <el-table-column prop="factoryNo" label="出厂编号" min-width="120" />
        <el-table-column prop="enterpriseName" label="企业" min-width="180" />
        <el-table-column prop="equipmentName" label="所属设备" min-width="120" />
        <el-table-column prop="district" label="辖区" width="100" />
        <el-table-column prop="conclusion" label="结论" width="90">
          <template #default="{ row }">
            <el-tag :type="row.conclusion === '合格' ? 'success' : 'danger'" size="small">
              {{ row.conclusion || '未知' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="verificationDate" label="检定日期" width="120" />
        <el-table-column prop="expiryDate" label="到期日期" width="120">
          <template #default="{ row }">
            <span :class="getExpiryClass(row.expiryDate)">{{ row.expiryDate || '-' }}</span>
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
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import { districts } from '@/api/config'
import { getRecords } from '@/api/regulator'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const userStore = useUserStore()

const loading = ref(false)
const records = ref([])
const total = ref(0)
const enterpriseOptions = ref([])

const quickFilters = [
  { label: '全部记录', value: '' },
  { label: '已过期', value: 'expired' },
  { label: '30天内到期', value: 'expiring' },
  { label: '风险记录', value: 'risk' }
]

const filters = reactive({
  keyword: '',
  district: '',
  enterpriseName: '',
  conclusion: '',
  filterType: ''
})

const pagination = reactive({
  page: 1,
  pageSize: 20
})

const applyRouteFilter = () => {
  if (route.query.enterprise) {
    filters.enterpriseName = route.query.enterprise
  }
  if (route.query.filter) {
    filters.filterType = route.query.filter
  }
}

const loadRecords = async () => {
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
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  filters.keyword = ''
  filters.district = ''
  filters.enterpriseName = ''
  filters.conclusion = ''
  filters.filterType = ''
  pagination.page = 1
  loadRecords()
}

const getExpiryClass = (value) => {
  if (!value) return ''
  const date = dayjs(value)
  if (date.isBefore(dayjs(), 'day')) return 'expired'
  if (date.diff(dayjs(), 'day') <= 30) return 'expiring'
  return ''
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
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 14px;
}

.quick-filters {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: wrap;
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

.toolbar-actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
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
</style>
