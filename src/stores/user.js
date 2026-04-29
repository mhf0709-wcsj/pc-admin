import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { changeAdminPassword, loginAdmin, loginEnterprise, registerEnterprise } from '@/api/regulator'

export const useUserStore = defineStore('user', () => {
  const user = ref(null)
  const token = ref('')
  const userType = ref('')

  const isLoggedIn = computed(() => !!token.value && !!user.value && !!userType.value)
  const isEnterprise = computed(() => userType.value === 'enterprise')
  const isRegulator = computed(() => userType.value === 'admin')
  const isAdmin = computed(() => isRegulator.value && (user.value?.role === 'super' || user.value?.role === 'admin'))
  const isDistrictAdmin = computed(() => isRegulator.value && user.value?.role === 'district')
  const adminDistrict = computed(() => user.value?.district || '')

  function persist(nextUser, nextToken, nextType) {
    user.value = nextUser
    token.value = nextToken
    userType.value = nextType
    localStorage.setItem('webUser', JSON.stringify(nextUser))
    localStorage.setItem('webToken', nextToken)
    localStorage.setItem('webUserType', nextType)
  }

  async function login(username, password) {
    try {
      const result = await loginAdmin(username, password)
      const nextUser = {
        id: result.admin.id,
        username: result.admin.username,
        role: result.admin.role,
        district: result.admin.district
      }
      persist(nextUser, result.token || `web_admin_${Date.now()}`, 'admin')
      return { success: true }
    } catch (error) {
      return {
        success: false,
        message: error.message || '用户名或密码错误'
      }
    }
  }

  async function loginAsEnterprise(companyName, phone) {
    try {
      const result = await loginEnterprise(companyName, phone)
      persist(result.enterprise, result.token || `web_enterprise_${Date.now()}`, 'enterprise')
      return { success: true }
    } catch (error) {
      return {
        success: false,
        message: error.message || '企业登录失败'
      }
    }
  }

  async function registerAsEnterprise(payload) {
    try {
      const result = await registerEnterprise(payload)
      persist(result.enterprise, result.token || `web_enterprise_${Date.now()}`, 'enterprise')
      return { success: true }
    } catch (error) {
      return {
        success: false,
        message: error.message || '企业注册失败'
      }
    }
  }

  function logout() {
    user.value = null
    token.value = ''
    userType.value = ''
    localStorage.removeItem('webUser')
    localStorage.removeItem('webToken')
    localStorage.removeItem('webUserType')
    localStorage.removeItem('adminUser')
    localStorage.removeItem('adminToken')
  }

  function checkAuth() {
    const savedUser = localStorage.getItem('webUser') || localStorage.getItem('adminUser')
    const savedToken = localStorage.getItem('webToken') || localStorage.getItem('adminToken')
    const savedType = localStorage.getItem('webUserType') || (localStorage.getItem('adminUser') ? 'admin' : '')

    if (savedUser && savedToken && savedType) {
      user.value = JSON.parse(savedUser)
      token.value = savedToken
      userType.value = savedType
      return true
    }

    return false
  }

  async function changePassword(oldPassword, newPassword) {
    if (!user.value || !isRegulator.value) {
      return { success: false, message: '当前账号不支持修改密码' }
    }

    try {
      await changeAdminPassword(user.value, oldPassword, newPassword)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        message: error.message || '密码修改失败'
      }
    }
  }

  return {
    user,
    token,
    userType,
    isLoggedIn,
    isEnterprise,
    isRegulator,
    isAdmin,
    isDistrictAdmin,
    adminDistrict,
    login,
    loginAsEnterprise,
    registerAsEnterprise,
    logout,
    checkAuth,
    changePassword
  }
})
