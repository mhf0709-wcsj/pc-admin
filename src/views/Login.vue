<template>
  <div class="login-page">
    <div class="login-shell">
      <section class="hero-panel">
        <div>
          <div class="hero-badge">Pressure Gauge Web</div>
          <h1>压力表智能管理网页端</h1>
          <p>
            网页端与小程序共用同一套业务数据。监管端可查看风险、台账和企业情况，企业端可维护设备、
            压力表与检定记录。
          </p>

          <div class="hero-points">
            <div class="point">监管端：监管概览、台账中心、企业管理、统计分析</div>
            <div class="point">企业端：AI 管家、设备台账、压力表台账、检定记录联动</div>
            <div class="point">数据互通：小程序录入的数据会同步到网页端</div>
          </div>
        </div>

        <div class="hero-footer">
          <div class="hint-card">
            <span>本地调试默认账号</span>
            <strong>admin / admin123</strong>
          </div>
          <div class="hint-card">
            <span>企业端支持</span>
            <strong>手机号登录与企业注册</strong>
          </div>
        </div>
      </section>

      <section class="form-panel">
        <div class="form-head">
          <div class="mark">{{ activeTab === 'admin' ? '监管端登录' : '企业端登录' }}</div>
          <h2>{{ activeTab === 'admin' ? '进入监管后台' : '进入企业工作台' }}</h2>
          <p>
            {{
              activeTab === 'admin'
                ? '使用管理员账号登录，查看全部或辖区范围内的风险、企业和检定记录。'
                : '使用企业名称和法人手机号登录，数据与小程序企业端互通。'
            }}
          </p>
        </div>

        <el-tabs v-model="activeTab" stretch class="login-tabs">
          <el-tab-pane label="监管端" name="admin" />
          <el-tab-pane label="企业端" name="enterprise" />
        </el-tabs>

        <el-form
          v-if="activeTab === 'admin'"
          ref="adminFormRef"
          :model="adminForm"
          :rules="adminRules"
          class="login-form"
          @submit.prevent="handleAdminLogin"
        >
          <el-form-item prop="username">
            <el-input
              v-model="adminForm.username"
              placeholder="请输入管理员账号"
              size="large"
              :prefix-icon="User"
            />
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="adminForm.password"
              type="password"
              placeholder="请输入登录密码"
              size="large"
              :prefix-icon="Lock"
              show-password
              @keyup.enter="handleAdminLogin"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" size="large" :loading="loading" class="login-btn" @click="handleAdminLogin">
              登录监管端
            </el-button>
          </el-form-item>
          <div class="help-text">
            本地调试可直接使用 <strong>admin</strong> / <strong>admin123</strong>
          </div>
        </el-form>

        <el-form
          v-else
          ref="enterpriseFormRef"
          :model="enterpriseForm"
          :rules="enterpriseRules"
          class="login-form"
          @submit.prevent="handleEnterpriseLogin"
        >
          <el-form-item prop="companyName">
            <el-input
              v-model="enterpriseForm.companyName"
              placeholder="请输入企业名称"
              size="large"
              :prefix-icon="OfficeBuilding"
            />
          </el-form-item>
          <el-form-item prop="phone">
            <el-input
              v-model="enterpriseForm.phone"
              placeholder="请输入法人手机号"
              size="large"
              maxlength="11"
              :prefix-icon="Iphone"
              @keyup.enter="handleEnterpriseLogin"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" size="large" :loading="loading" class="login-btn" @click="handleEnterpriseLogin">
              登录企业端
            </el-button>
          </el-form-item>
          <div class="register-line">
            <span>还没有企业账号？</span>
            <el-button type="primary" link @click="registerVisible = true">立即注册</el-button>
          </div>
        </el-form>
      </section>
    </div>

    <el-dialog v-model="registerVisible" title="企业注册" width="520px">
      <el-form ref="registerFormRef" :model="registerForm" :rules="registerRules" label-position="top">
        <el-form-item label="企业名称" prop="companyName">
          <el-input v-model="registerForm.companyName" placeholder="请输入企业全称" />
        </el-form-item>
        <el-form-item label="统一社会信用代码" prop="creditCode">
          <el-input v-model="registerForm.creditCode" maxlength="18" placeholder="请输入 18 位统一社会信用代码" />
        </el-form-item>
        <el-form-item label="企业法人" prop="legalPerson">
          <el-input v-model="registerForm.legalPerson" placeholder="请输入法人姓名" />
        </el-form-item>
        <el-form-item label="法人手机号" prop="phone">
          <el-input v-model="registerForm.phone" maxlength="11" placeholder="请输入法人手机号" />
        </el-form-item>
        <el-form-item label="所在辖区" prop="district">
          <el-select v-model="registerForm.district" placeholder="请选择辖区" style="width: 100%">
            <el-option v-for="item in districtOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="registerVisible = false">取消</el-button>
        <el-button type="primary" :loading="loading" @click="handleRegister">注册并进入企业端</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Iphone, Lock, OfficeBuilding, User } from '@element-plus/icons-vue'
import { districts } from '@/api/config'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

const activeTab = ref('admin')
const loading = ref(false)
const registerVisible = ref(false)
const adminFormRef = ref()
const enterpriseFormRef = ref()
const registerFormRef = ref()

const districtOptions = districts.filter((item) => item !== '全部辖区')

const adminForm = reactive({
  username: '',
  password: ''
})

const enterpriseForm = reactive({
  companyName: '',
  phone: ''
})

const registerForm = reactive({
  companyName: '',
  creditCode: '',
  legalPerson: '',
  phone: '',
  district: ''
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

const registerRules = {
  companyName: [{ required: true, message: '请输入企业名称', trigger: 'blur' }],
  creditCode: [
    { required: true, message: '请输入统一社会信用代码', trigger: 'blur' },
    { min: 18, max: 18, message: '统一社会信用代码应为 18 位', trigger: 'blur' }
  ],
  legalPerson: [{ required: true, message: '请输入企业法人', trigger: 'blur' }],
  phone: [{ required: true, message: '请输入法人手机号', trigger: 'blur' }, phoneRule],
  district: [{ required: true, message: '请选择辖区', trigger: 'change' }]
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
    router.push('/dashboard')
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
    router.push('/enterprise/ai')
  } finally {
    loading.value = false
  }
}

async function handleRegister() {
  const valid = await registerFormRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    const result = await userStore.registerAsEnterprise({ ...registerForm })
    if (!result.success) {
      ElMessage.error(result.message || '注册失败')
      return
    }
    ElMessage.success('注册成功')
    registerVisible.value = false
    router.push('/enterprise/ai')
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  background:
    radial-gradient(circle at top left, rgba(30, 94, 255, 0.18), transparent 32%),
    radial-gradient(circle at bottom right, rgba(24, 160, 88, 0.12), transparent 28%),
    linear-gradient(180deg, #f6f9ff 0%, #eef3fb 100%);
}

.login-shell {
  width: min(1180px, 100%);
  display: grid;
  grid-template-columns: 1.2fr 0.9fr;
  gap: 22px;
}

.hero-panel,
.form-panel {
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(24px);
  min-height: 680px;
}

.hero-panel {
  padding: 44px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background:
    radial-gradient(circle at top right, rgba(63, 140, 255, 0.2), transparent 32%),
    rgba(255, 255, 255, 0.78);

  .hero-badge {
    width: fit-content;
    padding: 8px 14px;
    border-radius: 999px;
    background: rgba(30, 94, 255, 0.08);
    color: var(--primary-color);
    font-size: 13px;
    font-weight: 700;
  }

  h1 {
    font-size: 52px;
    line-height: 1.08;
    color: var(--text-main);
    margin: 26px 0 18px;
  }

  p {
    max-width: 600px;
    line-height: 1.8;
    color: var(--text-sub);
    font-size: 16px;
  }
}

.hero-points {
  display: grid;
  gap: 14px;
  margin-top: 30px;
}

.point {
  padding: 18px 20px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.14);
  color: var(--text-main);
  font-weight: 600;
}

.hero-footer {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 28px;
}

.hint-card {
  padding: 18px 20px;
  border-radius: 20px;
  background: rgba(15, 23, 42, 0.05);

  span {
    display: block;
    color: var(--text-sub);
    font-size: 12px;
    margin-bottom: 8px;
  }

  strong {
    color: var(--text-main);
    font-size: 18px;
  }
}

.form-panel {
  padding: 40px 36px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.form-head {
  margin-bottom: 18px;

  .mark {
    font-size: 13px;
    font-weight: 700;
    color: var(--primary-color);
    margin-bottom: 12px;
  }

  h2 {
    font-size: 32px;
    color: var(--text-main);
  }

  p {
    margin-top: 12px;
    line-height: 1.8;
    color: var(--text-sub);
  }
}

.login-tabs {
  margin-bottom: 18px;
}

.login-form {
  margin-top: 18px;
}

.login-btn {
  width: 100%;
  height: 50px;
  font-size: 16px;
  font-weight: 700;
}

.help-text {
  text-align: center;
  color: var(--text-sub);
  font-size: 14px;

  strong {
    color: var(--text-main);
  }
}

.register-line {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-sub);
  font-size: 14px;
}

@media (max-width: 1100px) {
  .login-shell {
    grid-template-columns: 1fr;
  }

  .hero-panel,
  .form-panel {
    min-height: auto;
  }
}

@media (max-width: 768px) {
  .login-page {
    padding: 18px;
  }

  .hero-panel,
  .form-panel {
    padding: 24px;
  }

  .hero-panel h1 {
    font-size: 38px;
  }

  .hero-footer {
    grid-template-columns: 1fr;
  }
}
</style>
