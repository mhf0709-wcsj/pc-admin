<template>
  <div class="login-page">
    <div class="ambient-grid" />
    <div class="login-shell">
      <section class="hero-panel">
        <div class="hero-top">
          <div class="brand-row">
            <div class="brand-mark">PG</div>
            <div>
              <span>Pressure Gauge Web</span>
              <strong>压力表合规管理平台</strong>
            </div>
          </div>
          <div class="live-chip">
            <span />
            云端台账同步中
          </div>
        </div>

        <div class="hero-copy">
          <p class="eyebrow">监管 + 企业协同工作台</p>
          <h1>把压力表台账、检定证据和风险闭环放到同一个入口。</h1>
          <p class="hero-text">
            监管端查看辖区风险、企业和统计分析；企业端用 AI 管家批量识别证书，补齐安装位置、现场照片和复检闭环。
          </p>
        </div>

        <div class="hero-metrics">
          <div>
            <strong>30 天</strong>
            <span>到期预警</span>
          </div>
          <div>
            <strong>AI</strong>
            <span>证书识别</span>
          </div>
          <div>
            <strong>闭环</strong>
            <span>整改复检</span>
          </div>
        </div>

        <div class="hero-flow">
          <div class="flow-line" />
          <div v-for="item in flowItems" :key="item" class="flow-item">
            <span />
            {{ item }}
          </div>
        </div>
      </section>

      <section class="form-panel">
        <div class="form-head">
          <div class="form-kicker">{{ activeTab === 'admin' ? 'Regulator Access' : 'Enterprise Access' }}</div>
          <h2>{{ activeTab === 'admin' ? '进入监管后台' : '进入企业工作台' }}</h2>
          <p>
            {{
              activeTab === 'admin'
                ? '使用总管理员或辖区管理员账号登录，查看辖区内风险、企业和台账数据。'
                : '使用企业名称和法人手机号登录，继续上传证书、维护设备和处理待办。'
            }}
          </p>
        </div>

        <div class="role-switch">
          <button type="button" :class="{ active: activeTab === 'admin' }" @click="activeTab = 'admin'">
            监管端
          </button>
          <button type="button" :class="{ active: activeTab === 'enterprise' }" @click="activeTab = 'enterprise'">
            企业端
          </button>
        </div>

        <el-form
          v-if="activeTab === 'admin'"
          ref="adminFormRef"
          :model="adminForm"
          :rules="adminRules"
          class="login-form"
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
          <el-button type="primary" size="large" :loading="loading" class="login-btn" @click="handleAdminLogin">
            登录监管端
          </el-button>
          <div class="helper-card">
            <span>本地调试默认账号</span>
            <strong>admin / admin123</strong>
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
          <el-button type="primary" size="large" :loading="loading" class="login-btn" @click="handleEnterpriseLogin">
            登录企业端
          </el-button>
          <div class="register-line">
            <span>还没有企业账号？</span>
            <el-button type="primary" link @click="registerVisible = true">立即注册</el-button>
          </div>
        </el-form>
      </section>
    </div>

    <el-dialog v-model="registerVisible" title="企业注册" width="560px" class="register-dialog">
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

const flowItems = ['上传检定证书', 'AI 提取字段', '保存共享台账', '到期提醒与复检闭环']
const districtOptions = districts.filter((item) => item !== '全部辖区')

const adminForm = reactive({ username: '', password: '' })
const enterpriseForm = reactive({ companyName: '', phone: '' })
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
  --ink: #111827;
  --muted: #667085;
  --paper: rgba(255, 255, 255, 0.86);
  --blue: #245cff;
  --cyan: #13b5c8;
  --green: #13a870;
  position: relative;
  min-height: 100vh;
  display: grid;
  place-items: center;
  overflow: hidden;
  padding: 30px;
  background:
    radial-gradient(circle at 10% 12%, rgba(19, 181, 200, 0.22), transparent 28%),
    radial-gradient(circle at 88% 8%, rgba(36, 92, 255, 0.20), transparent 30%),
    linear-gradient(135deg, #eef4f7 0%, #f8faf5 44%, #edf3ff 100%);
}

.ambient-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(15, 23, 42, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(15, 23, 42, 0.055) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(circle at center, black, transparent 76%);
}

.login-shell {
  position: relative;
  z-index: 1;
  width: min(1180px, 100%);
  display: grid;
  grid-template-columns: minmax(0, 1.18fr) minmax(380px, 0.82fr);
  gap: 22px;
}

.hero-panel,
.form-panel {
  min-height: 690px;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 34px;
  box-shadow: 0 30px 90px rgba(30, 41, 59, 0.16);
  backdrop-filter: blur(24px);
}

.hero-panel {
  position: relative;
  overflow: hidden;
  padding: 42px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: var(--ink);
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(240, 249, 255, 0.78)),
    radial-gradient(circle at 70% 70%, rgba(19, 181, 200, 0.18), transparent 30%);
}

.hero-panel::after {
  content: '';
  position: absolute;
  right: -90px;
  bottom: -140px;
  width: 360px;
  height: 360px;
  border-radius: 999px;
  border: 54px solid rgba(36, 92, 255, 0.10);
}

.hero-top,
.brand-row,
.live-chip,
.hero-metrics,
.flow-item {
  display: flex;
  align-items: center;
}

.hero-top {
  justify-content: space-between;
  gap: 16px;
}

.brand-row {
  gap: 12px;

  span,
  strong {
    display: block;
  }

  span {
    color: var(--muted);
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  strong {
    margin-top: 3px;
    color: var(--ink);
    font-size: 16px;
  }
}

.brand-mark {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  color: #fff;
  font-weight: 900;
  background: linear-gradient(135deg, var(--blue), var(--cyan));
  box-shadow: 0 18px 32px rgba(36, 92, 255, 0.28);
}

.live-chip {
  gap: 8px;
  padding: 9px 13px;
  border-radius: 999px;
  color: #0f766e;
  background: rgba(236, 253, 245, 0.86);
  font-size: 13px;
  font-weight: 700;

  span {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--green);
    box-shadow: 0 0 0 6px rgba(19, 168, 112, 0.14);
  }
}

.eyebrow {
  color: var(--blue);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.18em;
}

.hero-copy h1 {
  max-width: 720px;
  margin: 18px 0;
  color: var(--ink);
  font-size: clamp(42px, 5vw, 64px);
  line-height: 1.03;
  letter-spacing: -0.05em;
}

.hero-text {
  max-width: 650px;
  color: var(--muted);
  font-size: 17px;
  line-height: 1.9;
}

.hero-metrics {
  gap: 12px;

  div {
    min-width: 128px;
    padding: 18px 20px;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.70);
    border: 1px solid rgba(148, 163, 184, 0.16);
  }

  strong,
  span {
    display: block;
  }

  strong {
    color: var(--ink);
    font-size: 26px;
  }

  span {
    margin-top: 4px;
    color: var(--muted);
    font-size: 13px;
  }
}

.hero-flow {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  padding-top: 28px;
}

.flow-line {
  position: absolute;
  left: 12px;
  right: 12px;
  top: 37px;
  height: 2px;
  background: linear-gradient(90deg, var(--blue), var(--cyan), var(--green));
  opacity: 0.35;
}

.flow-item {
  position: relative;
  z-index: 1;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
  color: var(--muted);
  font-weight: 700;
  font-size: 13px;

  span {
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: #fff;
    border: 5px solid var(--blue);
  }
}

.form-panel {
  padding: 42px 38px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: var(--paper);
}

.form-kicker {
  color: var(--blue);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.form-head h2 {
  margin-top: 10px;
  color: var(--ink);
  font-size: 34px;
  letter-spacing: -0.04em;
}

.form-head p {
  margin-top: 12px;
  color: var(--muted);
  line-height: 1.8;
}

.role-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 28px 0 22px;
  padding: 6px;
  border-radius: 18px;
  background: rgba(226, 232, 240, 0.62);

  button {
    border: 0;
    height: 44px;
    border-radius: 14px;
    color: #64748b;
    background: transparent;
    font-weight: 800;
    cursor: pointer;
    transition: 0.2s ease;
  }

  button.active {
    color: #fff;
    background: linear-gradient(135deg, var(--blue), #407bff);
    box-shadow: 0 14px 28px rgba(36, 92, 255, 0.24);
  }
}

.login-form {
  display: grid;
  gap: 3px;
}

.login-form :deep(.el-input__wrapper) {
  min-height: 50px;
  border-radius: 16px;
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.24) inset;
}

.login-btn {
  width: 100%;
  height: 52px;
  margin-top: 4px;
  border: 0;
  border-radius: 16px;
  font-size: 16px;
  font-weight: 900;
  background: linear-gradient(135deg, var(--blue), #1f8cff);
  box-shadow: 0 18px 34px rgba(36, 92, 255, 0.28);
}

.helper-card,
.register-line {
  margin-top: 16px;
  text-align: center;
  color: var(--muted);
}

.helper-card {
  padding: 14px;
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.84);

  span,
  strong {
    display: block;
  }

  strong {
    margin-top: 4px;
    color: var(--ink);
  }
}

.register-line {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 14px;
}

@media (max-width: 1080px) {
  .login-shell {
    grid-template-columns: 1fr;
  }

  .hero-panel,
  .form-panel {
    min-height: auto;
  }
}

@media (max-width: 720px) {
  .login-page {
    padding: 16px;
  }

  .hero-panel,
  .form-panel {
    padding: 24px;
    border-radius: 26px;
  }

  .hero-top,
  .hero-metrics {
    align-items: flex-start;
    flex-direction: column;
  }

  .hero-flow {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
