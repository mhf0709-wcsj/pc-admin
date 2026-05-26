<template>
  <div class="pg-login-page">
    <section class="pg-login-card">
      <div class="brand">
        <div class="brand-mark">PG</div>
        <div>
          <p>Pressure Gauge Agent</p>
          <h1>压力表监管智能体</h1>
        </div>
      </div>

      <div class="role-switch">
        <button type="button" :class="{ active: activeTab === 'admin' }" @click="activeTab = 'admin'">
          监管端
        </button>
        <button type="button" :class="{ active: activeTab === 'enterprise' }" @click="activeTab = 'enterprise'">
          企业端
        </button>
      </div>

      <div class="form-head">
        <h2>{{ activeTab === 'admin' ? '登录监管后台' : '登录企业端' }}</h2>
        <p>{{ activeTab === 'admin' ? '使用管理员账号登录。' : '使用企业名称和法人手机号登录。' }}</p>
      </div>

      <div v-if="sessionExpired" class="session-notice">
        登录状态已过期，请重新登录后继续操作。
      </div>

      <el-form
        v-if="activeTab === 'admin'"
        ref="adminFormRef"
        :model="adminForm"
        :rules="adminRules"
        class="auth-form"
        @submit.prevent="handleAdminLogin"
      >
        <el-form-item prop="username">
          <el-input v-model="adminForm.username" placeholder="管理员账号" size="large" :prefix-icon="User" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="adminForm.password"
            type="password"
            placeholder="登录密码"
            size="large"
            :prefix-icon="Lock"
            show-password
            @keyup.enter="handleAdminLogin"
          />
        </el-form-item>
        <el-button type="primary" size="large" :loading="loading" class="auth-btn" @click="handleAdminLogin">
          登录监管端
        </el-button>
        <div class="help-text">本地调试默认账号：admin / admin123</div>
      </el-form>

      <el-form
        v-else
        ref="enterpriseFormRef"
        :model="enterpriseForm"
        :rules="enterpriseRules"
        class="auth-form"
        @submit.prevent="handleEnterpriseLogin"
      >
        <el-form-item prop="companyName">
          <el-input v-model="enterpriseForm.companyName" placeholder="企业名称" size="large" :prefix-icon="OfficeBuilding" />
        </el-form-item>
        <el-form-item prop="phone">
          <el-input
            v-model="enterpriseForm.phone"
            placeholder="法人手机号"
            size="large"
            maxlength="11"
            :prefix-icon="Iphone"
            @keyup.enter="handleEnterpriseLogin"
          />
        </el-form-item>
        <el-button type="primary" size="large" :loading="loading" class="auth-btn" @click="handleEnterpriseLogin">
          登录企业端
        </el-button>
        <div class="register-line">
          <span>还没有企业账号？</span>
          <el-button type="primary" link @click="goRegister">立即注册</el-button>
        </div>
      </el-form>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Iphone, Lock, OfficeBuilding, User } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const activeTab = ref('admin')
const loading = ref(false)
const adminFormRef = ref()
const enterpriseFormRef = ref()
const sessionExpired = computed(() => route.query.expired === '1')

const adminForm = reactive({
  username: '',
  password: ''
})

const enterpriseForm = reactive({
  companyName: '',
  phone: ''
})

const phoneRule = {
  validator: (rule, value, callback) => {
    if (!/^1[3-9]\d{9}$/.test(String(value || ''))) callback(new Error('请输入正确的手机号'))
    else callback()
  },
  trigger: 'blur'
}

const adminRules = {
  username: [{ required: true, message: '请输入管理员账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入登录密码', trigger: 'blur' }]
}

const enterpriseRules = {
  companyName: [{ required: true, message: '请输入企业名称', trigger: 'blur' }],
  phone: [{ required: true, message: '请输入法人手机号', trigger: 'blur' }, phoneRule]
}

function resolveDestination(defaultPath) {
  const target = String(route.query.redirect || '')
  return target.startsWith('/') && !target.startsWith('//') ? target : defaultPath
}

async function handleAdminLogin() {
  const valid = await adminFormRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    const result = await userStore.login(adminForm.username, adminForm.password)
    if (!result.success) {
      ElMessage.error(result.message || '登录失败')
      return
    }
    ElMessage.success('登录成功')
    router.push(resolveDestination('/dashboard'))
  } finally {
    loading.value = false
  }
}

async function handleEnterpriseLogin() {
  const valid = await enterpriseFormRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    const result = await userStore.loginAsEnterprise(enterpriseForm.companyName, enterpriseForm.phone)
    if (!result.success) {
      ElMessage.error(result.message || '登录失败')
      return
    }
    ElMessage.success('登录成功')
    router.push(resolveDestination('/enterprise/ai'))
  } finally {
    loading.value = false
  }
}

function goRegister() {
  router.push('/register')
}
</script>

<style lang="scss">
.pg-login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  background:
    radial-gradient(circle at 20% 10%, rgba(59, 130, 246, 0.12), transparent 28%),
    linear-gradient(180deg, #f7faff 0%, #edf3fb 100%);
}

.pg-login-card {
  width: 560px;
  max-width: calc(100vw - 48px);
  padding: 48px 52px;
  box-sizing: border-box;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(18px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 34px;
}

.brand-mark {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  color: #fff;
  font-weight: 900;
  background: linear-gradient(135deg, #2563eb, #0ea5e9);
}

.brand p {
  margin: 0 0 4px;
  color: #64748b;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.brand h1 {
  margin: 0;
  color: #0f172a;
  font-size: 23px;
}

.role-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 6px;
  margin-bottom: 30px;
  border-radius: 16px;
  background: #eef3f8;
}

.role-switch button {
  height: 48px;
  border: 0;
  border-radius: 12px;
  color: #64748b;
  background: transparent;
  font-weight: 800;
  cursor: pointer;
}

.role-switch button.active {
  color: #fff;
  background: #2563eb;
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.24);
}

.form-head {
  margin-bottom: 26px;
}

.form-head h2 {
  margin: 0;
  color: #0f172a;
  font-size: 30px;
}

.form-head p {
  margin: 8px 0 0;
  color: #64748b;
  line-height: 1.7;
}

.session-notice {
  margin: -8px 0 20px;
  padding: 12px 14px;
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 14px;
  color: #b45309;
  background: rgba(255, 251, 235, 0.95);
}

.auth-form {
  display: grid;
  gap: 8px;
}

.auth-form .el-input__wrapper {
  min-height: 54px;
  border-radius: 16px;
}

.auth-btn {
  width: 100%;
  height: 56px;
  margin-top: 8px;
  border-radius: 16px;
  font-weight: 800;
  font-size: 16px;
}

.help-text,
.register-line {
  margin-top: 16px;
  text-align: center;
  color: #64748b;
  font-size: 14px;
}

.register-line {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

@media (max-width: 640px) {
  .pg-login-card {
    padding: 28px 20px;
    border-radius: 22px;
  }

  .brand {
    margin-bottom: 24px;
  }

  .form-head h2 {
    font-size: 25px;
  }
}
</style>
