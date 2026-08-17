<template>
  <div class="main-layout">
    <div v-if="mobileNavVisible" class="mobile-overlay" @click="mobileNavVisible = false" />

    <aside class="sidebar" :class="{ collapsed: isCollapsed && !isMobile, open: mobileNavVisible }">
      <div class="logo">
        <div class="logo-mark">
          <el-icon :size="24"><Monitor /></el-icon>
        </div>
        <div v-show="isMobile || !isCollapsed" class="logo-copy">
          <span class="logo-badge">{{ userStore.isEnterprise ? '企业操作端' : '监管管理端' }}</span>
          <span class="logo-text">压力表监管智能体</span>
        </div>
      </div>

      <el-menu
        :default-active="activeMenu"
        :collapse="!isMobile && isCollapsed"
        router
        background-color="transparent"
        text-color="#6b7280"
        active-text-color="#0f172a"
        @select="mobileNavVisible = false"
      >
        <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <template #title>{{ item.label }}</template>
        </el-menu-item>
      </el-menu>
    </aside>

    <div class="main-container">
      <header class="header">
        <div class="header-left">
          <el-icon class="mobile-menu-btn" @click="mobileNavVisible = true">
            <Menu />
          </el-icon>
          <el-icon class="collapse-btn" @click="isCollapsed = !isCollapsed">
            <component :is="isCollapsed ? Expand : Fold" />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/' }">
              {{ userStore.isEnterprise ? '企业端' : '监管端' }}
            </el-breadcrumb-item>
            <el-breadcrumb-item>{{ currentTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
          <span class="mobile-title">{{ currentTitle }}</span>
        </div>

        <div class="header-right">
          <div class="scope-chip">{{ scopeText }}</div>
          <el-dropdown @command="handleCommand">
            <span class="user-info">
              <el-avatar :size="32" class="avatar">{{ avatarText }}</el-avatar>
              <span class="username">{{ displayName }}</span>
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-if="!userStore.isEnterprise" command="settings">
                  <el-icon><Setting /></el-icon>账号设置
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>

    <nav class="mobile-bottom-nav" aria-label="主要导航">
      <router-link v-for="item in menuItems" :key="item.path" :to="item.path" class="mobile-nav-item">
        <el-icon><component :is="item.icon" /></el-icon>
        <span>{{ item.shortLabel || item.label }}</span>
      </router-link>
    </nav>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowDown,
  ChatDotRound,
  DataBoard,
  Document,
  Expand,
  Fold,
  Menu,
  Monitor,
  OfficeBuilding,
  Setting,
  SwitchButton,
  TrendCharts
} from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const isCollapsed = ref(false)
const isMobile = ref(false)
const mobileNavVisible = ref(false)

const enterpriseMenu = [
  { path: '/enterprise/ai', label: 'AI 管家', icon: ChatDotRound, shortLabel: 'AI' },
  { path: '/enterprise/home', label: '企业工作台', icon: DataBoard, shortLabel: '工作台' },
  { path: '/enterprise/equipments', label: '设备台账', icon: OfficeBuilding, shortLabel: '设备' },
  { path: '/enterprise/gauges', label: '压力表台账', icon: Document, shortLabel: '压力表' }
]

const adminMenu = [
  { path: '/dashboard', label: '监管概览', icon: DataBoard, shortLabel: '概览' },
  { path: '/records', label: '台账中心', icon: Document, shortLabel: '台账' },
  { path: '/enterprises', label: '企业管理', icon: OfficeBuilding, shortLabel: '企业' },
  { path: '/statistics', label: '统计分析', icon: TrendCharts, shortLabel: '统计' },
  { path: '/settings', label: '账号设置', icon: Setting, shortLabel: '设置' }
]

const menuItems = computed(() => (userStore.isEnterprise ? enterpriseMenu : adminMenu))
const activeMenu = computed(() => route.path)
const currentTitle = computed(() => route.meta.title || '')
const displayName = computed(() => (
  userStore.isEnterprise ? userStore.user?.companyName : userStore.user?.username
))
const avatarText = computed(() => String(displayName.value || 'U').slice(0, 1).toUpperCase())
const scopeText = computed(() => {
  if (userStore.isEnterprise) return userStore.user?.district || '企业端'
  return userStore.isDistrictAdmin ? `${userStore.adminDistrict} 辖区` : '总管理员'
})

function syncViewport() {
  isMobile.value = window.matchMedia('(max-width: 900px)').matches
  if (!isMobile.value) mobileNavVisible.value = false
}

function handleCommand(command) {
  if (command === 'logout') {
    ElMessageBox.confirm('确定要退出当前登录吗？', '提示', {
      confirmButtonText: '确认退出',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(async () => {
      await userStore.logout()
      router.push('/login')
      ElMessage.success('已退出登录')
    }).catch(() => {})
    return
  }

  if (command === 'settings') {
    router.push('/settings')
  }
}

onMounted(() => {
  syncViewport()
  window.addEventListener('resize', syncViewport)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewport)
})
</script>

<style lang="scss" scoped>
.main-layout {
  display: flex;
  height: 100vh;
  background: linear-gradient(180deg, #f4f7fb 0%, #eef3fb 100%);
  padding: 18px;
  gap: 18px;
}

.mobile-overlay,
.mobile-menu-btn,
.mobile-title,
.mobile-bottom-nav {
  display: none;
}

.sidebar {
  width: 252px;
  flex-shrink: 0;
  transition: width 0.3s;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.72);
  box-shadow: var(--shadow-soft);
  border-radius: 32px;
  backdrop-filter: blur(24px);
  padding: 18px 12px;

  &.collapsed {
    width: 88px;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px 20px;
  }

  .logo-mark {
    width: 46px;
    height: 46px;
    flex-shrink: 0;
    border-radius: 16px;
    background: var(--primary-gradient);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    box-shadow: 0 18px 30px rgba(30, 94, 255, 0.22);
  }

  .logo-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .logo-badge {
    font-size: 11px;
    letter-spacing: 0.04em;
    color: #94a3b8;
  }

  .logo-text {
    font-size: 16px;
    font-weight: 600;
    white-space: nowrap;
    color: var(--text-main);
  }

  .el-menu {
    background: transparent;

    .el-menu-item {
      margin: 4px 0;
      border-radius: 16px;
      height: 50px;
      color: var(--text-sub);

      &:hover {
        background: rgba(15, 23, 42, 0.04);
      }
    }

    :deep(.el-menu-item.is-active) {
      background: linear-gradient(135deg, rgba(30, 94, 255, 0.16) 0%, rgba(63, 140, 255, 0.08) 100%) !important;
      color: var(--text-main) !important;
      font-weight: 600;
    }
  }
}

.main-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.header {
  min-height: 72px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(24px);
}

.header-left,
.header-right,
.user-info {
  display: flex;
  align-items: center;
}

.header-left {
  gap: 16px;
}

.header-right {
  gap: 14px;
}

.collapse-btn,
.mobile-menu-btn {
  font-size: 20px;
  cursor: pointer;
  color: var(--text-sub);

  &:hover {
    color: var(--primary-color);
  }
}

.scope-chip {
  height: 36px;
  border-radius: 999px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  background: rgba(15, 23, 42, 0.05);
  color: var(--text-sub);
  font-size: 13px;
  font-weight: 600;
}

.user-info {
  gap: 8px;
  cursor: pointer;

  .avatar {
    background: var(--primary-gradient);
    color: #fff;
  }

  .username {
    color: var(--text-main);
    font-weight: 600;
  }
}

.content {
  flex: 1;
  padding: 24px 4px 4px;
  overflow: auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 900px) {
  .main-layout {
    height: 100dvh;
    min-height: 100dvh;
    padding: 0;
    gap: 0;
  }

  .mobile-overlay {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 30;
    background: rgba(15, 23, 42, 0.34);
    backdrop-filter: blur(3px);
  }

  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 31;
    width: min(84vw, 294px);
    border-radius: 0 26px 26px 0;
    padding: 14px 10px;
    transform: translateX(-104%);
    visibility: hidden;
    pointer-events: none;
    transition: transform 0.24s ease;

    &.open {
      transform: translateX(0);
      visibility: visible;
      pointer-events: auto;
    }
  }

  .main-container {
    width: 100%;
  }

  .header {
    position: sticky;
    top: 10px;
    z-index: 20;
    min-height: 58px;
    margin: 10px 10px 0;
    border-radius: 18px;
    padding: 0 12px;
  }

  .header-left {
    gap: 10px;
    min-width: 0;
  }

  .header-left .el-breadcrumb,
  .collapse-btn,
  .scope-chip,
  .username {
    display: none;
  }

  .mobile-menu-btn {
    display: inline-flex;
    width: 34px;
    height: 34px;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: rgba(30, 94, 255, 0.08);
    color: var(--primary-color);
  }

  .mobile-title {
    display: block;
    max-width: calc(100vw - 126px);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 17px;
    font-weight: 700;
    color: var(--text-main);
  }

  .user-info {
    gap: 4px;
  }

  .content {
    padding: 18px 10px calc(84px + env(safe-area-inset-bottom));
  }

  .mobile-bottom-nav {
    display: flex;
    position: fixed;
    inset: auto 0 0;
    z-index: 22;
    min-height: calc(62px + env(safe-area-inset-bottom));
    padding: 6px 5px env(safe-area-inset-bottom);
    background: rgba(255, 255, 255, 0.96);
    border-top: 1px solid rgba(148, 163, 184, 0.16);
    box-shadow: 0 -12px 28px rgba(15, 23, 42, 0.06);
    backdrop-filter: blur(22px);
  }

  .mobile-nav-item {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border-radius: 14px;
    color: var(--text-sub);
    text-decoration: none;
    font-size: 11px;
    font-weight: 600;

    .el-icon {
      font-size: 20px;
    }

    &.router-link-active {
      color: var(--primary-color);
      background: rgba(30, 94, 255, 0.08);
    }
  }
}

/* Apple-inspired application chrome: dark global navigation and a quiet utility bar. */
.main-layout {
  gap: 0;
  padding: 0;
  background: var(--apple-parchment);
}

.sidebar {
  width: 232px;
  padding: 22px 14px;
  border: 0;
  border-radius: 0;
  background: #000;
  box-shadow: none;
  backdrop-filter: none;

  &.collapsed {
    width: 76px;
  }

  .logo {
    padding: 6px 10px 26px;
  }

  .logo-mark {
    width: 38px;
    height: 38px;
    border-radius: 9px;
    background: #fff;
    color: #000;
    box-shadow: none;
  }

  .logo-badge {
    color: rgba(255, 255, 255, 0.52);
    font-size: 10px;
    letter-spacing: 0.06em;
  }

  .logo-text {
    color: #fff;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .el-menu .el-menu-item {
    height: 44px;
    margin: 3px 0;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.68) !important;
    font-size: 13px;

    &:hover {
      background: rgba(255, 255, 255, 0.12) !important;
      color: #fff !important;
    }
  }

  .el-menu :deep(.el-menu-item.is-active) {
    border-left: 2px solid var(--apple-blue);
    border-radius: 0 8px 8px 0;
    background: rgba(255, 255, 255, 0.12) !important;
    color: #fff !important;
    font-weight: 600;
  }
}

.header {
  min-height: 58px;
  border: 0;
  border-bottom: 1px solid var(--apple-line);
  border-radius: 0;
  background: rgba(245, 245, 247, 0.8);
  box-shadow: none;
  backdrop-filter: saturate(180%) blur(20px);
}

.scope-chip {
  height: 30px;
  border: 1px solid var(--apple-line);
  background: #fff;
  color: var(--apple-muted);
  font-size: 12px;
  font-weight: 400;
}

.user-info .avatar {
  background: var(--apple-blue);
}

.content {
  padding: 40px clamp(24px, 4vw, 64px) 48px;
}

@media (max-width: 900px) {
  .sidebar {
    width: min(84vw, 292px);
    border-radius: 0;
    padding-top: 18px;
  }

  .header {
    top: 0;
    margin: 0;
    border-radius: 0;
  }

  .mobile-menu-btn {
    border-radius: 50%;
    background: transparent;
    color: var(--apple-ink);
  }

  .content {
    padding: 28px 16px calc(88px + env(safe-area-inset-bottom));
  }

  .mobile-bottom-nav {
    border-top: 1px solid var(--apple-line);
    background: rgba(255, 255, 255, 0.92);
    box-shadow: none;
  }

  .mobile-nav-item {
    border-radius: 8px;
    font-weight: 400;

    &.router-link-active {
      background: transparent;
      color: var(--apple-blue);
    }
  }
}
</style>
