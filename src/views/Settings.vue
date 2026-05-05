<template>
  <div class="settings-page">
    <div class="page-header">
      <h1 class="page-title">账号设置</h1>
      <p class="page-subtitle">
        管理当前登录账号。总管理员可以维护辖区管理员账号，并查看关键操作审计日志。
      </p>
    </div>

    <div class="settings-grid">
      <section class="setting-card card-shell">
        <h3>当前账号</h3>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="用户名">
            {{ userStore.user?.username || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="角色">
            <el-tag :type="userStore.isAdmin ? 'danger' : 'primary'">
              {{ userStore.isAdmin ? '总管理员' : '辖区管理员' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item v-if="userStore.isDistrictAdmin" label="辖区">
            {{ userStore.adminDistrict }}
          </el-descriptions-item>
        </el-descriptions>
      </section>

      <section class="setting-card card-shell">
        <h3>修改密码</h3>
        <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-width="96px">
          <el-form-item label="原密码" prop="oldPassword">
            <el-input
              v-model="passwordForm.oldPassword"
              type="password"
              show-password
              placeholder="请输入原密码"
            />
          </el-form-item>
          <el-form-item label="新密码" prop="newPassword">
            <el-input
              v-model="passwordForm.newPassword"
              type="password"
              show-password
              placeholder="请输入新密码"
            />
          </el-form-item>
          <el-form-item label="确认密码" prop="confirmPassword">
            <el-input
              v-model="passwordForm.confirmPassword"
              type="password"
              show-password
              placeholder="请再次输入新密码"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleChangePassword">提交修改</el-button>
          </el-form-item>
        </el-form>
      </section>
    </div>

    <section v-if="userStore.isAdmin" class="setting-card district-admin-card card-shell">
      <div class="section-head">
        <div>
          <h3>辖区管理员账号</h3>
          <p>用于维护各辖区监管账号。停用后该账号不能登录；填写新密码即视为重置密码。</p>
        </div>
        <el-button type="primary" @click="openAdminDialog()">新增辖区管理员</el-button>
      </div>

      <el-table v-loading="districtAdminLoading" :data="districtAdmins" border>
        <el-table-column prop="username" label="用户名" min-width="150" />
        <el-table-column prop="district" label="负责辖区" min-width="130" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="row.isDisabled ? 'danger' : 'success'">
              {{ row.isDisabled ? '已停用' : '启用中' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近登录" min-width="170">
          <template #default="{ row }">
            {{ row.lastLoginTime || '从未登录' }}
          </template>
        </el-table-column>
        <el-table-column label="最近更新" min-width="170">
          <template #default="{ row }">
            {{ row.updateTime || row.createTime || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openAdminDialog(row)">编辑</el-button>
            <el-button
              link
              :type="row.isDisabled ? 'success' : 'warning'"
              @click="toggleDistrictAdmin(row)"
            >
              {{ row.isDisabled ? '启用' : '停用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section v-if="userStore.isAdmin" class="setting-card log-card card-shell">
      <div class="section-head">
        <div>
          <h3>操作审计日志</h3>
          <p>覆盖账号、台账、短信、AI 任务等关键动作，便于追踪是谁在什么时候做了什么。</p>
        </div>
        <el-button :loading="logLoading" @click="loadOperationLogs">刷新日志</el-button>
      </div>

      <div class="log-filters">
        <el-select v-model="logFilters.category" placeholder="全部类型" clearable>
          <el-option
            v-for="item in logCategoryOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <el-select v-model="logFilters.success" placeholder="全部结果" clearable>
          <el-option label="成功" value="success" />
          <el-option label="失败" value="failed" />
        </el-select>
        <el-input
          v-model="logFilters.keyword"
          clearable
          placeholder="搜索动作、操作者、目标或错误码"
          @keyup.enter="searchOperationLogs"
        />
        <el-button type="primary" @click="searchOperationLogs">查询</el-button>
      </div>

      <el-table v-loading="logLoading" :data="operationLogs" border>
        <el-table-column prop="createTime" label="时间" min-width="170" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag>{{ formatLogCategory(row.category) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="action" label="动作" min-width="190" show-overflow-tooltip />
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag :type="row.success ? 'success' : 'danger'">
              {{ row.success ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作者" min-width="130">
          <template #default="{ row }">
            {{ row.operatorName || row.operatorId || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="目标" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            {{ formatLogTarget(row) }}
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="90">
          <template #default="{ row }">
            {{ formatDuration(row.durationMs) }}
          </template>
        </el-table-column>
        <el-table-column label="说明" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.message || row.errorCode || '-' }}
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="logPagination.page"
          v-model:page-size="logPagination.pageSize"
          :total="logPagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @size-change="loadOperationLogs"
          @current-change="loadOperationLogs"
        />
      </div>
    </section>

    <el-dialog
      v-model="adminDialogVisible"
      :title="adminForm.id ? '编辑辖区管理员' : '新增辖区管理员'"
      width="540px"
      destroy-on-close
    >
      <el-alert
        v-if="adminForm.id"
        title="如需重置密码，请填写新密码；留空则保持原密码不变。"
        type="info"
        show-icon
        :closable="false"
        class="password-tip"
      />
      <el-form ref="adminFormRef" :model="adminForm" :rules="adminRules" label-width="100px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="adminForm.username" placeholder="请输入登录用户名" />
        </el-form-item>
        <el-form-item label="负责辖区" prop="district">
          <el-select v-model="adminForm.district" placeholder="请选择辖区" filterable>
            <el-option
              v-for="district in districtOptions"
              :key="district"
              :label="district"
              :value="district"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="adminForm.id ? '重置密码' : '初始密码'" prop="password">
          <el-input
            v-model="adminForm.password"
            type="password"
            show-password
            :placeholder="adminForm.id ? '留空则不修改密码' : '请输入初始密码'"
          />
        </el-form-item>
        <el-form-item label="账号状态">
          <el-switch
            v-model="adminForm.isDisabled"
            active-text="停用"
            inactive-text="启用"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adminDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="adminSaving" @click="saveDistrictAdminAccount">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { districts } from '@/api/config'
import { listDistrictAdmins, listOperationLogs, saveDistrictAdmin } from '@/api/regulator'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const passwordFormRef = ref()
const adminFormRef = ref()
const districtAdmins = ref([])
const districtAdminLoading = ref(false)
const adminDialogVisible = ref(false)
const adminSaving = ref(false)
const operationLogs = ref([])
const logLoading = ref(false)

const districtOptions = computed(() => districts.filter((item) => item !== '全部辖区'))

const logCategoryOptions = [
  { label: '账号', value: 'account' },
  { label: '台账', value: 'ledger' },
  { label: '短信', value: 'sms' },
  { label: 'AI 任务', value: 'ai' },
  { label: '系统', value: 'system' }
]

const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const adminForm = reactive({
  id: '',
  username: '',
  district: '',
  password: '',
  isDisabled: false
})

const logFilters = reactive({
  category: '',
  success: '',
  keyword: ''
})

const logPagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

const validateConfirmPassword = (rule, value, callback) => {
  if (value !== passwordForm.newPassword) {
    callback(new Error('两次输入的新密码不一致'))
    return
  }
  callback()
}

const validateAdminPassword = (rule, value, callback) => {
  if (!adminForm.id && !value) {
    callback(new Error('请输入初始密码'))
    return
  }
  if (value && value.length < 6) {
    callback(new Error('密码长度不能少于 6 位'))
    return
  }
  callback()
}

const passwordRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于 6 位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    { validator: validateConfirmPassword, trigger: 'blur' }
  ]
}

const adminRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  district: [{ required: true, message: '请选择辖区', trigger: 'change' }],
  password: [{ validator: validateAdminPassword, trigger: 'blur' }]
}

function formatLogCategory(category) {
  return logCategoryOptions.find((item) => item.value === category)?.label || '系统'
}

function formatDuration(value) {
  const ms = Number(value || 0)
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatLogTarget(row) {
  const type = row.targetType || ''
  const id = row.targetId || ''
  if (!type && !id) return '-'
  return [type, id].filter(Boolean).join('：')
}

async function loadDistrictAdmins() {
  if (!userStore.isAdmin) return
  districtAdminLoading.value = true
  try {
    const result = await listDistrictAdmins(userStore.user)
    districtAdmins.value = result.list || []
  } finally {
    districtAdminLoading.value = false
  }
}

async function loadOperationLogs() {
  if (!userStore.isAdmin) return
  logLoading.value = true
  try {
    const result = await listOperationLogs(userStore.user, {
      ...logFilters,
      page: logPagination.page,
      pageSize: logPagination.pageSize
    })
    operationLogs.value = result.list || []
    logPagination.total = result.total || 0
  } catch (error) {
    ElMessage.error(error.message || '加载操作日志失败')
  } finally {
    logLoading.value = false
  }
}

function searchOperationLogs() {
  logPagination.page = 1
  void loadOperationLogs()
}

function openAdminDialog(row = null) {
  adminForm.id = row?.id || ''
  adminForm.username = row?.username || ''
  adminForm.district = row?.district || ''
  adminForm.password = ''
  adminForm.isDisabled = !!row?.isDisabled
  adminDialogVisible.value = true
}

async function persistDistrictAdmin(data, successMessage) {
  await saveDistrictAdmin(userStore.user, data)
  ElMessage.success(successMessage)
  await Promise.all([loadDistrictAdmins(), loadOperationLogs()])
}

async function toggleDistrictAdmin(row) {
  const nextDisabled = !row.isDisabled
  const actionText = nextDisabled ? '停用' : '启用'
  await ElMessageBox.confirm(
    `确认${actionText}辖区管理员「${row.username}」？`,
    `${actionText}账号`,
    { type: nextDisabled ? 'warning' : 'success' }
  )
  await persistDistrictAdmin({
    id: row.id,
    username: row.username,
    district: row.district,
    isDisabled: nextDisabled
  }, `账号已${actionText}`)
}

async function saveDistrictAdminAccount() {
  const valid = await adminFormRef.value.validate().catch(() => false)
  if (!valid) return

  adminSaving.value = true
  try {
    await persistDistrictAdmin({
      id: adminForm.id,
      username: adminForm.username,
      district: adminForm.district,
      password: adminForm.password,
      isDisabled: adminForm.isDisabled
    }, adminForm.id ? '辖区管理员已更新' : '辖区管理员已新增')
    adminDialogVisible.value = false
  } catch (error) {
    ElMessage.error(error.message || '保存失败')
  } finally {
    adminSaving.value = false
  }
}

const handleChangePassword = async () => {
  const valid = await passwordFormRef.value.validate().catch(() => false)
  if (!valid) return

  const result = await userStore.changePassword(passwordForm.oldPassword, passwordForm.newPassword)
  if (!result.success) {
    ElMessage.error(result.message || '修改失败')
    return
  }

  ElMessage.success('密码修改成功')
  passwordFormRef.value.resetFields()
}

onMounted(() => {
  void loadDistrictAdmins()
  void loadOperationLogs()
})
</script>

<style lang="scss" scoped>
.settings-grid {
  display: grid;
  grid-template-columns: 0.8fr 1.2fr;
  gap: 18px;
}

.setting-card {
  padding: 24px;

  h3 {
    color: var(--text-main);
    font-size: 20px;
    margin-bottom: 18px;
  }
}

.district-admin-card,
.log-card {
  margin-top: 18px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 18px;

  p {
    margin-top: 6px;
    color: var(--text-sub);
  }
}

.log-filters {
  display: grid;
  grid-template-columns: 150px 140px minmax(240px, 1fr) auto;
  gap: 12px;
  margin-bottom: 16px;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.password-tip {
  margin-bottom: 16px;
}

:deep(.el-select) {
  width: 100%;
}

@media (max-width: 960px) {
  .settings-grid,
  .log-filters {
    grid-template-columns: 1fr;
  }

  .section-head {
    flex-direction: column;
  }
}
</style>
