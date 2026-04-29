import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: () => {
          const userStore = useUserStore()
          return userStore.isEnterprise ? '/enterprise/ai' : '/dashboard'
        }
      },
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '监管概览', role: 'admin' }
      },
      {
        path: 'records',
        name: 'Records',
        component: () => import('@/views/Records.vue'),
        meta: { title: '台账中心', role: 'admin' }
      },
      {
        path: 'enterprises',
        name: 'Enterprises',
        component: () => import('@/views/Enterprises.vue'),
        meta: { title: '企业管理', role: 'admin' }
      },
      {
        path: 'statistics',
        name: 'Statistics',
        component: () => import('@/views/Statistics.vue'),
        meta: { title: '统计分析', role: 'admin' }
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/Settings.vue'),
        meta: { title: '账号设置', role: 'admin' }
      },
      {
        path: 'enterprise',
        redirect: '/enterprise/ai'
      },
      {
        path: 'enterprise/ai',
        name: 'EnterpriseAi',
        component: () => import('@/views/enterprise/EnterpriseAi.vue'),
        meta: { title: 'AI 管家', role: 'enterprise' }
      },
      {
        path: 'enterprise/home',
        name: 'EnterpriseHome',
        component: () => import('@/views/enterprise/EnterpriseHome.vue'),
        meta: { title: '企业工作台', role: 'enterprise' }
      },
      {
        path: 'enterprise/equipments',
        name: 'EnterpriseEquipments',
        component: () => import('@/views/enterprise/EnterpriseEquipments.vue'),
        meta: { title: '设备台账', role: 'enterprise' }
      },
      {
        path: 'enterprise/gauges',
        name: 'EnterpriseGauges',
        component: () => import('@/views/enterprise/EnterpriseGauges.vue'),
        meta: { title: '压力表台账', role: 'enterprise' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const userStore = useUserStore()
  if (!userStore.isLoggedIn) {
    userStore.checkAuth()
  }

  if (to.meta.requiresAuth && !userStore.isLoggedIn) {
    next('/login')
    return
  }

  if (to.path === '/login' && userStore.isLoggedIn) {
    next(userStore.isEnterprise ? '/enterprise/ai' : '/dashboard')
    return
  }

  if (to.meta.role === 'enterprise' && !userStore.isEnterprise) {
    next('/dashboard')
    return
  }

  if (to.meta.role === 'admin' && userStore.isEnterprise) {
    next('/enterprise/ai')
    return
  }

  next()
})

export default router
