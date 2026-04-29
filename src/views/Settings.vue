<template>
  <div class="settings-page">
    <div class="page-header">
      <h1 class="page-title">账号设置</h1>
      <p class="page-subtitle">网页端当前使用和小程序管理端同一套账号集合。这里先保留最常用的账号信息和修改密码能力。</p>
    </div>

    <div class="settings-grid">
      <section class="setting-card card-shell">
        <h3>当前账号</h3>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="用户名">{{ userStore.user?.username || '-' }}</el-descriptions-item>
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
            <el-input v-model="passwordForm.oldPassword" type="password" show-password placeholder="请输入原密码" />
          </el-form-item>
          <el-form-item label="新密码" prop="newPassword">
            <el-input v-model="passwordForm.newPassword" type="password" show-password placeholder="请输入新密码" />
          </el-form-item>
          <el-form-item label="确认密码" prop="confirmPassword">
            <el-input v-model="passwordForm.confirmPassword" type="password" show-password placeholder="请再次输入新密码" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleChangePassword">提交修改</el-button>
          </el-form-item>
        </el-form>
      </section>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const passwordFormRef = ref()

const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const validateConfirmPassword = (rule, value, callback) => {
  if (value !== passwordForm.newPassword) {
    callback(new Error('两次输入的新密码不一致'))
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
</style>
