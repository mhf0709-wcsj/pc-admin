<template>
  <div class="main-layout">
    <aside class="sidebar" :class="{ collapsed: isCollapsed }">
      <div class="logo">
        <div class="logo-mark">
          <el-icon :size="24"><Monitor /></el-icon>
        </div>
        <div v-show="!isCollapsed" class="logo-copy">
          <span class="logo-badge">{{ userStore.isEnterprise ? '企业网页端' : '监管网页端' }}</span>
          <span class="logo-text">{{ userStore.isEnterprise ? '企业工作台' : '监管后台' }}</span>
        </div>
      </div>

      <el-menu
        :default-active="activeMenu"
        :collapse="isCollapsed"
        router
        background-color="transparent"
        text-color="#6b7280"
        active-text-color="#0f172a"
      >
        <template v-if="userStore.isEnterprise">
          <el-menu-item index="/enterprise/ai">
            <el-icon><ChatDotRound /></el-icon>
            <template #title>AI 管家</template>
          </el-menu-item>
          <el-menu-item index="/enterprise/home">
            <el-icon><DataBoard /></el-icon>
            <template #title>企业工作台</template>
          </el-menu-item>
          <el-menu-item index="/enterprise/equipments">
            <el-icon><OfficeBuilding /></el-icon>
            <template #title>设备台账</template>
          </el-menu-item>
          <el-menu-item index="/enterprise/gauges">
            <el-icon><Document /></el-icon>
            <template #title>压力表台账</template>
          </el-menu-item>
        </template>

        <template v-else>
          <el-menu-item index="/dashboard">
            <el-icon><DataBoard /></el-icon>
            <template #title>监管概览</template>
          </el-menu-item>
          <el-menu-item index="/records">
            <el-icon><Document /></el-icon>
            <template #title>台账中心</template>
          </el-menu-item>
          <el-menu-item index="/enterprises">
            <el-icon><OfficeBuilding /></el-icon>
            <template #title>企业管理</template>
          </el-menu-item>
          <el-menu-item index="/statistics">
            <el-icon><TrendCharts /></el-icon>
            <template #title>统计分析</template>
          </el-menu-item>
          <el-menu-item index="/settings">
            <el-icon><Setting /></el-icon>
            <template #title>账号设置</template>
          </el-menu-item>
        </template>
      </el-menu>
    </aside>

    <div class="main-container">
      <header class="header">
        <div class="header-left">
          <el-icon class="collapse-btn" @click="isCollapsed = !isCollapsed">
            <component :is="isCollapsed ? Expand : Fold" />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/' }">
              {{ userStore.isEnterprise ? '企业端' : '网页监管' }}
            </el-breadcrumb-item>
            <el-breadcrumb-item>{{ currentTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <div class="header-right">
          <div class="scope-chip">{{ scopeText }}</div>
          <el-dropdown @command="handleCommand">
            <span class="user-info">
              <el-avatar :size="32" class="avatar">
                {{ avatarText }}
              </el-avatar>
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
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowDown,
  ChatDotRound,
  DataBoard,
  Document,
  Expand,
  Fold,
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

function handleCommand(command) {
  if (command === 'logout') {
    ElMessageBox.confirm('确定要退出当前网页登录吗？', '提示', {
      confirmButtonText: '确认退出',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(() => {
      userStore.logout()
      router.push('/login')
      ElMessage.success('已退出登录')
    }).catch(() => {})
    return
  }

  if (command === 'settings') {
    router.push('/settings')
  }
}
</script>

<style lang="scss" scoped>
.main-layout {
  display: flex;
  height: 100vh;
  background: linear-gradient(180deg, #f4f7fb 0%, #eef3fb 100%);
  padding: 18px;
  gap: 18px;
}

.sidebar {
  width: 252px;
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
    border-radius: 16px;
    background: var(--primary-gradient);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    box-shadow: 0 18px 30px rgba(30, 94, 255, 0.22);
  }

  .logo-copy {
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
    font-size: 17px;
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

.collapse-btn {
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
</style>
