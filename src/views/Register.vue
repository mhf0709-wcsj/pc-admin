<template>
  <div class="pg-register-page">
    <section class="pg-register-card">
      <div class="page-nav">
        <el-button link type="primary" @click="router.push('/login')">返回登录</el-button>
      </div>

      <div class="brand">
        <div class="brand-mark">PG</div>
        <div>
          <p>压力表监管智能体</p>
          <h1>企业注册</h1>
        </div>
      </div>

      <p class="subtitle">填写企业基础信息后，将直接进入企业端工作台。</p>

      <el-form ref="registerFormRef" :model="registerForm" :rules="registerRules" label-position="top" class="register-form">
        <el-form-item label="企业名称" prop="companyName">
          <el-input v-model="registerForm.companyName" size="large" placeholder="请输入企业全称" />
        </el-form-item>
        <el-form-item label="统一社会信用代码" prop="creditCode">
          <el-input v-model="registerForm.creditCode" size="large" maxlength="18" placeholder="请输入 18 位统一社会信用代码" />
        </el-form-item>
        <el-form-item label="企业法人" prop="legalPerson">
          <el-input v-model="registerForm.legalPerson" size="large" placeholder="请输入法人姓名" />
        </el-form-item>
        <el-form-item label="法人手机号" prop="phone">
          <el-input v-model="registerForm.phone" size="large" maxlength="11" placeholder="请输入法人手机号" />
        </el-form-item>
        <el-form-item label="所在辖区" prop="district">
          <el-select v-model="registerForm.district" size="large" placeholder="请选择辖区" style="width: 100%">
            <el-option v-for="item in districtOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>

        <el-button type="primary" size="large" :loading="loading" class="submit-btn" @click="handleRegister">
          注册并进入企业端
        </el-button>
      </el-form>
    </section>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { districts } from '@/api/config'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()
const loading = ref(false)
const registerFormRef = ref()
const districtOptions = districts.filter((item) => item !== '全部辖区')

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
    router.push('/enterprise/ai')
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss">
.pg-register-page {
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

.pg-register-card {
  width: 620px;
  max-width: calc(100vw - 48px);
  padding: 42px 48px;
  box-sizing: border-box;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.12);
}

.page-nav {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 16px;
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
  font-size: 30px;
}

.subtitle {
  margin: 18px 0 26px;
  color: #64748b;
}

.register-form {
  display: grid;
}

.register-form :deep(.el-input__wrapper),
.register-form :deep(.el-select__wrapper) {
  min-height: 50px;
  border-radius: 14px;
}

.submit-btn {
  width: 100%;
  height: 54px;
  margin-top: 8px;
  border-radius: 16px;
  font-weight: 800;
  font-size: 16px;
}

@media (max-width: 640px) {
  .pg-register-card {
    padding: 28px 20px;
    border-radius: 22px;
  }
}

.pg-register-page {
  background: #f5f5f7;
}

.pg-register-card {
  width: min(720px, calc(100vw - 40px));
  border: 1px solid var(--apple-line);
  border-radius: 18px;
  background: #fff;
  box-shadow: none;
  backdrop-filter: none;
}

.pg-register-card .brand-mark {
  border-radius: 10px;
  background: #1d1d1f;
}

.pg-register-card .brand h1 {
  font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
  font-weight: 600;
  letter-spacing: -0.035em;
}

.submit-btn {
  height: 46px;
  border-radius: 999px;
  font-weight: 400;
}

@media (max-width: 640px) {
  .pg-register-card {
    width: calc(100vw - 28px);
    border-radius: 18px;
  }
}
</style>
