<template>
  <div class="enterprise-page">
    <div class="page-header action-header">
      <div>
        <h1 class="page-title">设备台账</h1>
        <p class="page-subtitle">维护企业设备，设备数据与小程序端互通。</p>
      </div>
      <el-button type="primary" @click="openCreate">新建设备</el-button>
    </div>

    <section class="card-shell table-panel">
      <div class="toolbar">
        <el-input v-model="keyword" clearable placeholder="搜索设备名称、编号或位置" @keyup.enter="loadData" />
        <el-button type="primary" @click="loadData">搜索</el-button>
      </div>
      <el-table :data="list" stripe>
        <el-table-column prop="equipmentName" label="设备名称" min-width="160" />
        <el-table-column prop="equipmentNo" label="设备编号" min-width="140" />
        <el-table-column prop="location" label="安装位置" min-width="160" />
        <el-table-column prop="gaugeCount" label="绑定压力表" width="120" />
        <el-table-column prop="createTime" label="创建时间" width="120" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="openEdit(row)">编辑</el-button>
            <el-button type="danger" link @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="dialogVisible" :title="form._id ? '编辑设备' : '新建设备'" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="设备名称" prop="equipmentName">
          <el-input v-model="form.equipmentName" placeholder="请输入设备名称" />
        </el-form-item>
        <el-form-item label="设备编号">
          <el-input v-model="form.equipmentNo" placeholder="不填则自动生成" />
        </el-form-item>
        <el-form-item label="安装位置">
          <el-input v-model="form.location" placeholder="请输入安装位置" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="loading" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { deleteEnterpriseEquipment, getEnterpriseEquipments, saveEnterpriseEquipment } from '@/api/regulator'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const list = ref([])
const keyword = ref('')
const loading = ref(false)
const dialogVisible = ref(false)
const formRef = ref()
const form = reactive({
  _id: '',
  equipmentName: '',
  equipmentNo: '',
  location: ''
})

const rules = {
  equipmentName: [{ required: true, message: '请输入设备名称', trigger: 'blur' }]
}

const resetForm = () => {
  form._id = ''
  form.equipmentName = ''
  form.equipmentNo = ''
  form.location = ''
}

const loadData = async () => {
  const result = await getEnterpriseEquipments(userStore.user, { keyword: keyword.value })
  list.value = result.list || []
}

const openCreate = () => {
  resetForm()
  dialogVisible.value = true
}

const openEdit = (row) => {
  form._id = row._id
  form.equipmentName = row.equipmentName
  form.equipmentNo = row.equipmentNo
  form.location = row.location
  dialogVisible.value = true
}

const save = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    await saveEnterpriseEquipment(userStore.user, { ...form })
    ElMessage.success('已保存')
    dialogVisible.value = false
    await loadData()
  } finally {
    loading.value = false
  }
}

const remove = async (row) => {
  await ElMessageBox.confirm(`确定删除设备“${row.equipmentName}”吗？删除后管理端会看到数据变化。`, '确认删除', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  })
  await deleteEnterpriseEquipment(userStore.user, row._id)
  ElMessage.success('已删除')
  await loadData()
}

onMounted(loadData)
</script>

<style lang="scss" scoped>
.action-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 18px;
}

.table-panel {
  padding: 22px;
}

.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 18px;

  .el-input {
    max-width: 360px;
  }
}
</style>
