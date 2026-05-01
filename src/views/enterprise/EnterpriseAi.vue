<template>
  <div class="enterprise-ai-page">
    <div class="page-header">
      <h1 class="page-title">AI 管家</h1>
      <p class="page-subtitle">
        支持知识问答、PDF 检定表解析、多图识别和 Excel 导入，并直接生成可编辑的台账草稿。
      </p>
    </div>

    <section class="ai-layout">
      <article class="chat-panel card-shell">
        <div class="chat-toolbar">
          <div class="toolbar-copy">
            <h3>对话区</h3>
            <p>可以直接提问，也可以上传 PDF、图片或 Excel 表格进行识别。</p>
          </div>
          <div class="toolbar-actions">
            <input
              ref="fileInputRef"
              class="hidden-input"
              type="file"
              accept="image/*,.pdf,application/pdf,.xlsx,.csv"
              multiple
              @change="handleFileChange"
            />
            <el-button :loading="uploading" @click="triggerFileSelect">上传文件</el-button>
            <el-button type="primary" :loading="uploading" @click="triggerFileSelect">
              上传 PDF / 图片
            </el-button>
          </div>
        </div>

        <section v-if="taskQueue.length" class="queue-panel">
          <div class="queue-head">
            <div class="queue-head-main">
              <h4>处理队列</h4>
              <p>{{ queueSummary }}</p>
            </div>
            <div class="queue-head-side">
              <el-tag type="primary" effect="plain">{{ taskQueue.length }} 个任务</el-tag>
              <div class="queue-filter-group">
                <button
                  v-for="option in queueFilterOptions"
                  :key="option.value"
                  type="button"
                  class="queue-filter-btn"
                  :class="{ active: queueFilter === option.value }"
                  @click="queueFilter = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
              <div class="queue-head-actions">
                <el-button
                  v-if="hiddenCompletedCount"
                  link
                  type="primary"
                  @click="showCompleted = true"
                >
                  展开已完成 {{ hiddenCompletedCount }}
                </el-button>
                <el-button
                  v-if="showCompleted && completedTaskCount"
                  link
                  @click="showCompleted = false"
                >
                  折叠已完成
                </el-button>
                <el-button
                  v-if="completedTaskCount"
                  link
                  type="danger"
                  @click="clearCompletedTasks"
                >
                  清空已完成
                </el-button>
              </div>
            </div>
          </div>

          <div class="queue-list">
            <div
              v-for="task in filteredTaskQueue"
              :key="task.id"
              class="queue-card"
              :class="[task.status, { collapsed: !task.expanded }]"
            >
              <div class="queue-preview">
                <img v-if="task.previewUrl" :src="task.previewUrl" alt="任务预览" />
                <div v-else class="queue-preview-fallback">
                  {{
                    task.fileType === 'pdf'
                      ? 'PDF'
                      : task.fileType === 'excel'
                        ? 'XLS'
                        : 'IMG'
                  }}
                </div>
              </div>

              <div class="queue-main">
                <div class="queue-main-head">
                  <div>
                    <div class="queue-name">{{ task.name }}</div>
                    <div class="queue-status-line">
                      <span class="queue-status-dot" :class="task.status"></span>
                      <span>{{ task.summary }}</span>
                    </div>
                  </div>
                  <div class="queue-card-tools">
                    <el-tag size="small" :type="task.statusTagType">{{ task.statusLabel }}</el-tag>
                    <span class="queue-progress">{{ task.progress }}%</span>
                    <el-button
                      v-if="task.status === 'error'"
                      link
                      type="danger"
                      :loading="task.retrying"
                      @click="retryTask(task)"
                    >
                      重试
                    </el-button>
                    <el-button link @click="toggleTaskExpanded(task)">
                      {{ task.expanded ? '收起' : '展开' }}
                    </el-button>
                  </div>
                </div>

                <div class="queue-meta-line">
                  <span>第 {{ task.attempts }} 次尝试</span>
                  <span v-if="task.lastError" class="queue-error-copy">{{ task.lastError }}</span>
                </div>

                <div v-if="task.expanded">
                  <div class="queue-track">
                    <div class="queue-track-bar" :style="{ width: `${task.progress}%` }"></div>
                  </div>

                  <div class="queue-steps-inline">
                    <span
                      v-for="step in task.steps"
                      :key="step.key"
                      class="queue-step-chip"
                      :class="step.status"
                    >
                      <span v-if="step.status === 'done'">✓</span>
                      <span v-else-if="step.status === 'error'">!</span>
                      <span v-else-if="step.status === 'active'">•</span>
                      <span v-else>{{ step.order }}</span>
                      {{ step.label }}
                    </span>
                  </div>
                </div>

                <div v-else class="queue-collapsed-line">
                  <span>{{ task.status === 'done' ? '已完成，可在右侧草稿区继续编辑。' : task.summary }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div ref="messageListRef" class="message-list">
          <div
            v-for="message in messages"
            :key="message.id"
            class="message-row"
            :class="message.role"
          >
            <div class="message-bubble" :class="{ 'process-bubble': message.type === 'process' }">
              <div class="message-meta">{{ message.role === 'assistant' ? 'AI 管家' : '企业用户' }}</div>

              <template v-if="message.type === 'process'">
                <div class="process-card">
                  <div class="process-card-head">
                    <div>
                      <div class="process-title">{{ message.title }}</div>
                      <div class="process-summary">{{ message.summary }}</div>
                    </div>
                    <div class="process-percent">{{ message.progress }}%</div>
                  </div>

                  <div class="process-track">
                    <div class="process-track-bar" :style="{ width: `${message.progress}%` }"></div>
                  </div>

                  <div class="process-steps">
                    <div
                      v-for="step in message.steps"
                      :key="step.key"
                      class="process-step"
                      :class="step.status"
                    >
                      <div class="process-step-icon">
                        <span v-if="step.status === 'done'">✓</span>
                        <span v-else-if="step.status === 'error'">!</span>
                        <span v-else-if="step.status === 'active'" class="dot"></span>
                        <span v-else>{{ step.order }}</span>
                      </div>
                      <div class="process-step-copy">
                        <div class="process-step-label">{{ step.label }}</div>
                        <div v-if="step.detail" class="process-step-detail">{{ step.detail }}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <div v-else class="message-text">{{ message.content }}</div>
            </div>
          </div>
        </div>

        <div class="chat-input">
          <el-input
            v-model="question"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            placeholder="例如：帮我分析这批检定表的到期风险，或者上传文件后继续追问。"
            @keydown.enter.exact.prevent="sendQuestion"
          />
          <div class="chat-submit">
            <el-button type="primary" :loading="asking" @click="sendQuestion">发送</el-button>
          </div>
        </div>
      </article>

      <article class="draft-panel card-shell">
        <div class="draft-head">
          <div>
            <h3>识别结果</h3>
            <p>每一页 PDF 或每一张图片都会生成一份可编辑草稿。</p>
          </div>
          <el-tag type="info" size="large">{{ drafts.length }} 份草稿</el-tag>
        </div>

        <div v-if="!drafts.length" class="empty-state">
          还没有识别结果，请先上传 PDF 或图片。
        </div>

        <div v-else class="draft-list">
          <section v-for="draft in drafts" :key="draft.id" class="draft-card">
            <div class="draft-card-head">
              <div>
                <h4>{{ draft.name }}</h4>
                <p>
                  {{
                    draft.fileType === 'pdf'
                      ? 'PDF 页面'
                      : draft.fileType === 'excel'
                        ? '表格导入'
                        : '图片识别'
                  }}
                  · {{ draft.statusText }}
                </p>
              </div>
              <div class="draft-card-actions">
                <el-tag :type="draft.saved ? 'success' : 'warning'">
                  {{ draft.saved ? '已保存' : '待保存' }}
                </el-tag>
              </div>
            </div>

            <div class="draft-body">
              <div v-if="draft.previewUrl" class="draft-preview">
                <img :src="draft.previewUrl" alt="识别预览" />
              </div>

              <div class="draft-form">
                <el-form label-position="top">
                  <div class="form-grid">
                    <el-form-item label="证书编号">
                      <el-input v-model="draft.extractedData.certNo" />
                    </el-form-item>
                    <el-form-item label="出厂编号">
                      <el-input v-model="draft.extractedData.factoryNo" />
                    </el-form-item>
                    <el-form-item label="送检单位">
                      <el-input v-model="draft.extractedData.sendUnit" />
                    </el-form-item>
                    <el-form-item label="仪表名称">
                      <el-input v-model="draft.extractedData.instrumentName" />
                    </el-form-item>
                    <el-form-item label="型号规格">
                      <el-input
                        v-model="draft.extractedData.modelSpec"
                        placeholder="例如：(0-1.6)MPa"
                      />
                    </el-form-item>
                    <el-form-item label="制造单位">
                      <el-input v-model="draft.extractedData.manufacturer" />
                    </el-form-item>
                    <el-form-item label="检定依据">
                      <el-input v-model="draft.extractedData.verificationStd" />
                    </el-form-item>
                    <el-form-item label="检定结论">
                      <el-select v-model="draft.extractedData.conclusion" placeholder="请选择结论">
                        <el-option label="合格" value="合格" />
                        <el-option label="不合格" value="不合格" />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="检定日期">
                      <el-input
                        v-model="draft.extractedData.verificationDate"
                        placeholder="YYYY-MM-DD"
                      />
                    </el-form-item>
                    <el-form-item label="压力表状态">
                      <el-select v-model="draft.extractedData.gaugeStatus" placeholder="请选择状态">
                        <el-option label="在用" value="在用" />
                        <el-option label="停用" value="停用" />
                        <el-option label="报废" value="报废" />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="安装位置">
                      <el-input
                        v-model="draft.extractedData.installLocation"
                        placeholder="请填写该压力表的安装位置"
                      />
                    </el-form-item>
                    <el-form-item class="equipment-item" label="所属设备">
                      <el-select
                        v-model="draft.selectedEquipmentId"
                        placeholder="请选择所属设备"
                        filterable
                        clearable
                        @change="syncSelectedEquipment(draft)"
                      >
                        <el-option
                          v-for="equipment in equipments"
                          :key="equipment._id"
                          :label="`${equipment.equipmentName}${equipment.equipmentNo ? ` / ${equipment.equipmentNo}` : ''}`"
                          :value="equipment._id"
                        />
                      </el-select>
                      <el-button link type="primary" @click="goToEquipments">
                        没有想要的设备，去新增
                      </el-button>
                    </el-form-item>
                  </div>
                </el-form>

                <div class="draft-actions">
                  <el-button @click="toggleRawText(draft)">
                    {{ draft.showRawText ? '收起原文' : '查看提取原文' }}
                  </el-button>
                  <el-button
                    type="primary"
                    :loading="draft.saving"
                    :disabled="draft.saved"
                    @click="saveDraft(draft)"
                  >
                    {{ draft.saved ? '已保存到台账' : '保存到共享台账' }}
                  </el-button>
                </div>

                <div v-if="draft.showRawText" class="raw-text-box">
                  {{ draft.ocrText || '无提取原文' }}
                </div>
              </div>
            </div>
          </section>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { callAiFunction, callOcrFunction } from '@/api/cloud'
import { getEnterpriseEquipments, parseEnterpriseExcel, saveEnterpriseAiRecord } from '@/api/regulator'
import { useUserStore } from '@/stores/user'
import EnterpriseAiProcessorWorker from '@/workers/enterpriseAiProcessor.worker.js?worker'

const MAX_CONCURRENT_TASKS = 2
const UPLOAD_BATCH_SIZE = 6
const MAX_OCR_CONCURRENCY = 2
const OCR_RETRY_LIMIT = 2
const OCR_TIMEOUT_MS = 25000
const MAX_AI_PARSE_CONCURRENCY = 2
const AI_PARSE_TIMEOUT_MS = 60000
const EXCEL_EXT_PATTERN = /\.(xlsx|csv)$/i

const userStore = useUserStore()
const router = useRouter()
const pendingUploadBatches = []
let queueDrainPromise = null

const fileInputRef = ref(null)
const messageListRef = ref(null)
const question = ref('')
const asking = ref(false)
const uploading = ref(false)
const drafts = ref([])
const equipments = ref([])
const taskQueue = ref([])
const queueFilter = ref('all')
const showCompleted = ref(false)
const messages = ref([
  {
    id: `msg_${Date.now()}`,
    role: 'assistant',
    type: 'text',
    content: '请输入问题，或直接上传 PDF、多张图片或 Excel 表格。我会先提取检定表内容，再生成可编辑的压力表存档草稿。支持一次多选，系统会自动分批处理。'
  }
])

const queueFilterOptions = [
  { label: '全部', value: 'all' },
  { label: '进行中', value: 'active' },
  { label: '失败', value: 'error' },
  { label: '已完成', value: 'done' }
]

const completedTaskCount = computed(() => taskQueue.value.filter((item) => item.status === 'done').length)

const hiddenCompletedCount = computed(() => {
  if (showCompleted.value || queueFilter.value === 'done') return 0
  return completedTaskCount.value
})

const filteredTaskQueue = computed(() => {
  let items = taskQueue.value

  if (queueFilter.value !== 'all') {
    items = items.filter((item) => item.status === queueFilter.value)
  }

  if (!showCompleted.value && queueFilter.value !== 'done') {
    items = items.filter((item) => item.status !== 'done')
  }

  return items
})

const queueSummary = computed(() => {
  const total = taskQueue.value.length
  const done = taskQueue.value.filter((item) => item.status === 'done').length
  const running = taskQueue.value.filter((item) => item.status === 'active').length
  const failed = taskQueue.value.filter((item) => item.status === 'error').length
  const pending = taskQueue.value.filter((item) => item.status === 'pending').length

  if (!total) return '当前没有任务'
  return `已完成 ${done} / ${total}，进行中 ${running}，排队 ${pending}，失败 ${failed}`
})

function scrollMessagesToBottom() {
  nextTick(() => {
    const container = messageListRef.value
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  })
}

function addMessage(role, content) {
  messages.value.push({
    id: `msg_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    role,
    type: 'text',
    content
  })
  scrollMessagesToBottom()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isExcelFile(file) {
  return EXCEL_EXT_PATTERN.test(file?.name || '')
}

function normalizeUiErrorMessage(error, fallbackMessage = '未知错误') {
  const rawMessage = String(error?.message || '').trim()
  const normalized = rawMessage.toLowerCase()

  if (!rawMessage) return fallbackMessage
  if (normalized === 'canceled' || normalized === 'cancelled') {
    return '请求已取消，请重试'
  }
  if (normalized.includes('timeout') || normalized.includes('timed out')) {
    return '请求超时，请稍后重试'
  }
  if (
    error?.name === 'CanceledError' ||
    error?.code === 'ERR_CANCELED' ||
    rawMessage.includes('已取消本次请求')
  ) {
    return '请求已取消，请重试'
  }

  return rawMessage
}

function createConcurrencyLimiter(limit) {
  let active = 0
  const queue = []

  const runNext = () => {
    if (active >= limit || !queue.length) return

    const task = queue.shift()
    active += 1

    task()
      .catch(() => {})
      .finally(() => {
        active -= 1
        runNext()
      })
  }

  return (runner) =>
    new Promise((resolve, reject) => {
      queue.push(async () => {
        try {
          resolve(await runner())
        } catch (error) {
          reject(error)
        }
      })
      runNext()
    })
}

function chunkFiles(files, chunkSize = UPLOAD_BATCH_SIZE) {
  const result = []
  for (let index = 0; index < files.length; index += chunkSize) {
    result.push(files.slice(index, index + chunkSize))
  }
  return result
}

const limitOcrProcessing = createConcurrencyLimiter(MAX_OCR_CONCURRENCY)
const limitAiParsing = createConcurrencyLimiter(MAX_AI_PARSE_CONCURRENCY)

function getTaskStatusMeta(status) {
  if (status === 'done') {
    return { label: '已完成', tagType: 'success' }
  }
  if (status === 'error') {
    return { label: '失败', tagType: 'danger' }
  }
  if (status === 'active') {
    return { label: '处理中', tagType: 'primary' }
  }
  return { label: '排队中', tagType: 'info' }
}

function createTask(title, stepLabels, meta = {}) {
  const initialStatus = meta.initialStatus || 'active'
  const statusMeta = getTaskStatusMeta(initialStatus)
  const task = {
    id: `task_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    name: title,
    fileType: meta.fileType || 'image',
    previewUrl: meta.previewUrl || '',
    progress: 0,
    summary: '等待开始',
    status: initialStatus,
    statusLabel: statusMeta.label,
    statusTagType: statusMeta.tagType,
    expanded: true,
    retrying: false,
    attempts: meta.attempts || 1,
    lastError: '',
    runner: null,
    messageId: '',
    steps: stepLabels.map((label, index) => ({
      key: `${index}_${label}`,
      order: index + 1,
      label,
      detail: '',
      status: initialStatus === 'active' && index === 0 ? 'active' : 'pending'
    }))
  }
  taskQueue.value.unshift(task)
  return task
}

function createProcessMessage(task) {
  const message = {
    id: `process_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    role: 'assistant',
    type: 'process',
    title: task.name,
    summary: task.summary,
    progress: task.progress,
    steps: task.steps.map((step) => ({ ...step }))
  }
  task.messageId = message.id
  messages.value.push(message)
  scrollMessagesToBottom()
  return message
}

function getTaskProcessMessage(task) {
  return messages.value.find((item) => item.id === task.messageId)
}

function syncTaskToProcess(task, message) {
  message.summary = task.summary
  message.progress = task.progress
  message.steps = task.steps.map((step) => ({ ...step }))
  scrollMessagesToBottom()
}

function refreshTask(task, message, summary) {
  const total = task.steps.length || 1
  const doneCount = task.steps.filter((step) => step.status === 'done').length
  const activeCount = task.steps.filter((step) => step.status === 'active').length
  const baseProgress = doneCount / total * 100
  const progress = baseProgress + (activeCount ? 8 : 0)
  task.progress = Math.max(doneCount === total ? 100 : 6, Math.min(100, Math.round(progress)))
  if (summary) {
    task.summary = summary
  }
  task.status = task.steps.some((step) => step.status === 'error')
    ? 'error'
    : task.progress >= 100
      ? 'done'
      : task.steps.some((step) => step.status === 'active')
        ? 'active'
        : 'pending'
  const statusMeta = getTaskStatusMeta(task.status)
  task.statusLabel = statusMeta.label
  task.statusTagType = statusMeta.tagType
  syncTaskToProcess(task, message)
}

function activateTaskStep(task, message, stepIndex, detail = '') {
  task.steps.forEach((step, index) => {
    if (index < stepIndex && step.status !== 'done') {
      step.status = 'done'
    }
    if (index > stepIndex && step.status !== 'error') {
      step.status = 'pending'
    }
  })
  const target = task.steps[stepIndex]
  if (!target) return
  target.status = 'active'
  target.detail = detail
  refreshTask(task, message, detail || `正在${target.label}`)
}

function completeTaskStep(task, message, stepIndex, detail = '') {
  const target = task.steps[stepIndex]
  if (!target) return
  target.status = 'done'
  target.detail = detail
  refreshTask(task, message, detail || `${target.label}完成`)
}

function failTaskStep(task, message, stepIndex, detail = '') {
  const target = task.steps[stepIndex]
  if (!target) return
  target.status = 'error'
  target.detail = detail
  task.lastError = detail
  refreshTask(task, message, detail || `${target.label}失败`)
}

function finishTask(task, message, summary = '处理完成') {
  task.steps.forEach((step) => {
    if (step.status !== 'error') {
      step.status = 'done'
    }
  })
  task.progress = 100
  task.summary = summary
  task.status = 'done'
  task.expanded = false
  task.lastError = ''
  const statusMeta = getTaskStatusMeta(task.status)
  task.statusLabel = statusMeta.label
  task.statusTagType = statusMeta.tagType
  syncTaskToProcess(task, message)
}

function toggleTaskExpanded(task) {
  task.expanded = !task.expanded
}

function clearCompletedTasks() {
  taskQueue.value = taskQueue.value.filter((item) => item.status !== 'done')
}

function resetTaskForRetry(task, processMessage) {
  task.progress = 0
  task.summary = '重新排队中'
  task.status = 'active'
  task.statusLabel = '处理中'
  task.statusTagType = 'primary'
  task.expanded = true
  task.lastError = ''
  task.attempts += 1
  task.steps = task.steps.map((step, index) => ({
    ...step,
    detail: '',
    status: index === 0 ? 'active' : 'pending'
  }))

  if (processMessage) {
    processMessage.summary = task.summary
    processMessage.progress = 0
    processMessage.steps = task.steps.map((step) => ({ ...step }))
    scrollMessagesToBottom()
  }
}

function prepareTaskForRun(task, processMessage) {
  if (task.status === 'pending') {
    task.status = 'active'
    task.statusLabel = '处理中'
    task.statusTagType = 'primary'
    task.summary = '准备开始'
    task.steps = task.steps.map((step, index) => ({
      ...step,
      status: index === 0 ? 'active' : 'pending'
    }))

    if (processMessage) {
      processMessage.summary = task.summary
      processMessage.progress = 0
      processMessage.steps = task.steps.map((step) => ({ ...step }))
    }
  }
}

function markTaskFailed(task, error, processMessage = getTaskProcessMessage(task)) {
  const activeIndex = task.steps.findIndex((step) => step.status === 'active')
  const message = normalizeUiErrorMessage(error)
  failTaskStep(
    task,
    processMessage,
    activeIndex >= 0 ? activeIndex : task.steps.length - 1,
    message
  )
  task.expanded = true
}

async function executeTask(task, runner, options = {}) {
  const processMessage = getTaskProcessMessage(task) || createProcessMessage(task)
  task.runner = runner
  task.retrying = !!options.retry

  if (options.retry) {
    resetTaskForRetry(task, processMessage)
  } else {
    prepareTaskForRun(task, processMessage)
  }

  try {
    await runner()
  } catch (error) {
    const message = normalizeUiErrorMessage(error)
    markTaskFailed(task, error, processMessage)
    addMessage('assistant', `${task.name} 处理失败：${message}`)
  } finally {
    task.retrying = false
  }
}

async function retryTask(task) {
  if (task.retrying || typeof task.runner !== 'function') return
  await executeTask(task, task.runner, { retry: true })
}

function triggerFileSelect() {
  fileInputRef.value?.click()
}

function getServerToken() {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem('webToken') || localStorage.getItem('adminToken') || ''
}

function blobToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

function runProcessorWorker(type, payload) {
  return new Promise((resolve, reject) => {
    const worker = new EnterpriseAiProcessorWorker()
    const id = `worker_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`

    const cleanup = () => {
      worker.terminate()
    }

    worker.onmessage = (event) => {
      const data = event.data || {}
      if (data.id !== id) return
      cleanup()
      if (data.ok) {
        resolve(data.result)
      } else {
        reject(new Error(data.error || '图片处理失败'))
      }
    }

    worker.onerror = (event) => {
      cleanup()
      reject(new Error(event.message || '图片处理失败'))
    }

    worker.postMessage({
      id,
      type,
      payload
    })
  })
}

async function processImageInWorker(file) {
  const baseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()
  return limitOcrProcessing(async () => {
    const result = await runProcessorWorker('process-image', {
      file,
      baseUrl,
      token: getServerToken(),
      compressOptions: {
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.8,
        passThroughMaxBytes: 1.2 * 1024 * 1024
      },
      ocrOptions: {
        retryLimit: OCR_RETRY_LIMIT,
        timeout: OCR_TIMEOUT_MS
      }
    })

    if (!baseUrl && !result.ocrText && result.imageBase64) {
      const ocrRes = await callOcrWithRetry({ imageBase64: result.imageBase64 })
      result.ocrText = String(ocrRes.text || '').trim()
    }

    return result
  })
}

async function processPdfFirstPageInWorker(file) {
  const result = await runProcessorWorker('process-pdf-first-page', {
    file,
    pdfOptions: {
      scale: 1.8,
      quality: 0.92
    }
  })

  const pageBlob = result.pageBlob
  if (!(pageBlob instanceof Blob)) {
    throw new Error('未解析出有效页面')
  }

  const pageName = String(result.pageName || `${file.name.replace(/\.pdf$/i, '')} 第 1 页`)
  const previewUrl = URL.createObjectURL(pageBlob)
  const imageFile = new File([pageBlob], `${file.name.replace(/\.pdf$/i, '')}_page_1.png`, {
    type: 'image/png',
    lastModified: Date.now()
  })

  return {
    file: imageFile,
    previewUrl,
    directText: String(result.pageText || '').trim(),
    name: pageName
  }
}

function normalizeDateText(text) {
  return String(text || '')
    .replace(/\s+/g, '')
    .replace(/年/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '')
    .replace(/\./g, '-')
    .replace(/\//g, '-')
}

function repairExtractedData(data, rawText) {
  const next = {
    certNo: data?.certNo || '',
    factoryNo: data?.factoryNo || '',
    sendUnit: data?.sendUnit || '',
    instrumentName: data?.instrumentName || '',
    modelSpec: data?.modelSpec || '',
    manufacturer: data?.manufacturer || '',
    verificationStd: data?.verificationStd || '',
    conclusion: data?.conclusion || '',
    verificationDate: data?.verificationDate || '',
    gaugeStatus: data?.gaugeStatus || '在用',
    installLocation: data?.installLocation || '',
    equipmentName: data?.equipmentName || '',
    district: data?.district || ''
  }

  const compactText = String(rawText || '').replace(/\s+/g, '')

  if (!next.modelSpec) {
    const match = compactText.match(/([（(]?\d+(?:\.\d+)?[-~—–一至到]\d+(?:\.\d+)?[)）]?(?:MPa|KPa|kPa|Pa))/i)
    if (match?.[1]) {
      next.modelSpec = match[1]
        .replace(/（/g, '(')
        .replace(/）/g, ')')
        .replace(/[—–一至到~]/g, '-')
    }
  }

  if (!next.verificationDate) {
    const dateMatch = compactText.match(/(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})日?/)
    if (dateMatch) {
      next.verificationDate = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[3]).padStart(2, '0')}`
    }
  } else {
    next.verificationDate = normalizeDateText(next.verificationDate)
  }

  if (!next.conclusion) {
    if (compactText.includes('不合格')) next.conclusion = '不合格'
    else if (compactText.includes('该压力表合格') || compactText.includes('合格')) next.conclusion = '合格'
  }

  return next
}

function createDraftEntry({
  name,
  fileType = 'image',
  previewUrl = '',
  fileID = '',
  ocrText = '',
  extractedData = {},
  selectedEquipmentId = '',
  selectedEquipmentName = ''
}) {
  return {
    id: `draft_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    name: name || '识别草稿',
    fileType,
    statusText: '识别完成',
    previewUrl,
    fileID,
    ocrText,
    extractedData: repairExtractedData(extractedData, ocrText),
    selectedEquipmentId,
    selectedEquipmentName,
    saved: false,
    saving: false,
    showRawText: false
  }
}

async function loadEquipments() {
  const result = await getEnterpriseEquipments(userStore.user)
  equipments.value = result.list || []
  drafts.value.forEach((draft) => {
    if (draft.selectedEquipmentId) {
      syncSelectedEquipment(draft)
    }
  })
}

function buildConversationContext() {
  const recentMessages = messages.value
    .filter((item) => item.type === 'text')
    .slice(-6)
    .map((item) => ({
      role: item.role,
      kind: 'text',
      content: item.content
    }))

  const latestDraft = drafts.value[0]
  const visionDraft = latestDraft
    ? {
        ...latestDraft.extractedData,
        selectedEquipmentId: latestDraft.selectedEquipmentId || '',
        selectedEquipmentName: latestDraft.selectedEquipmentName || ''
      }
    : null

  return {
    recentMessages,
    visionDraft
  }
}

async function callOcrWithRetry(payload, options = {}) {
  const retryLimit = options.retryLimit ?? OCR_RETRY_LIMIT
  const timeout = options.timeout ?? OCR_TIMEOUT_MS
  let lastError = null

  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    try {
      const result = await callOcrFunction(payload, {
        signal: controller.signal,
        timeout
      })
      clearTimeout(timer)
      return result
    } catch (error) {
      clearTimeout(timer)
      lastError =
        error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED'
          ? new Error('OCR 识别超时，已取消本次请求')
          : error

      if (attempt >= retryLimit) {
        throw lastError
      }

      await sleep(800 * (attempt + 1))
    }
  }

  throw lastError || new Error('OCR 服务调用失败')
}

async function callAiWithTimeout(payload, timeout = AI_PARSE_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new Error('AI 解析超时'))
  }, timeout)

  try {
    return await callAiFunction(payload, {
      signal: controller.signal,
      timeout
    })
  } catch (error) {
    if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') {
      throw new Error('AI 解析超时，已取消本次请求')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function sendQuestion() {
  const text = question.value.trim()
  if (!text || asking.value) return

  addMessage('user', text)
  question.value = ''
  asking.value = true

  try {
    const result = await callAiFunction({
      question: text,
      userType: 'enterprise',
      userInfo: userStore.user,
      conversationContext: buildConversationContext()
    })
    addMessage('assistant', result.answer || '未获得 AI 回复。')
  } catch (error) {
    addMessage('assistant', `AI 调用失败：${error.message || '未知错误'}`)
  } finally {
    asking.value = false
  }
}

async function fileToImageDraft(file, meta = {}) {
  const task = meta.task || createTask(meta.name || file.name || '识别任务', [
    '上传文件',
    meta.fileType === 'pdf' ? '渲染页面' : '压缩图片',
    '提取文本',
    '解析字段',
    '生成草稿'
  ], {
    fileType: meta.fileType,
    previewUrl: meta.previewUrl || ''
  })

  const processMessage = meta.processMessage || createProcessMessage(task)

  activateTaskStep(task, processMessage, 0, '正在接收文件')
  const previewUrl = meta.previewUrl || URL.createObjectURL(file)
  task.previewUrl = previewUrl
  completeTaskStep(task, processMessage, 0, '文件已接收')

  let sourceText = String(meta.directText || '').trim()
  let workingFile = file

  activateTaskStep(
    task,
    processMessage,
    1,
    meta.fileType === 'pdf' ? '正在渲染 PDF 页面' : '正在压缩图片'
  )

  if (meta.fileType === 'pdf') {
    completeTaskStep(task, processMessage, 1, 'PDF 页面已渲染')
  } else {
    const processed = await processImageInWorker(file)
    workingFile = processed.compressedFile
    sourceText = String(processed.ocrText || '').trim()
    completeTaskStep(task, processMessage, 1, processed.compressReason || '图片压缩完成')
  }

  activateTaskStep(task, processMessage, 2, sourceText ? '正在整理页面文本' : '正在 OCR 识别')
  if (!sourceText) {
    const imageBase64 = await blobToBase64(workingFile)
    const ocrRes = await callOcrWithRetry({ imageBase64 })
    sourceText = String(ocrRes.text || '').trim()
  }
  completeTaskStep(task, processMessage, 2, '文本提取完成')

  activateTaskStep(task, processMessage, 3, '等待 AI 解析槽位')
  const aiRes = await limitAiParsing(async () => {
    activateTaskStep(task, processMessage, 3, '正在解析字段')
    return callAiWithTimeout({
      action: 'extractRecordFromImage',
      ocrText: sourceText,
      userType: 'enterprise',
      userInfo: userStore.user
    })
  })
  const extractedData = repairExtractedData(aiRes?.data || {}, sourceText)
  completeTaskStep(task, processMessage, 3, '字段解析完成')

  activateTaskStep(task, processMessage, 4, '正在生成可编辑草稿')
  const draft = createDraftEntry({
    name: meta.name || file.name || '识别草稿',
    fileType: meta.fileType || 'image',
    previewUrl,
    fileID: '',
    ocrText: sourceText,
    extractedData
  })

  drafts.value.unshift(draft)
  autoAssignDraftEquipment(draft)
  finishTask(task, processMessage, '处理完成，可确认字段后保存')
  addMessage('assistant', `已完成 ${draft.name} 的识别，请确认字段后保存到共享台账。`)
}

async function fileToExcelDrafts(file, meta = {}) {
  const task = meta.task || createTask(meta.name || file.name || '表格导入任务', [
    '上传文件',
    '读取表格',
    '整理字段',
    '解析字段',
    '生成草稿'
  ], {
    fileType: 'excel'
  })

  const processMessage = meta.processMessage || createProcessMessage(task)

  activateTaskStep(task, processMessage, 0, '正在接收文件')
  completeTaskStep(task, processMessage, 0, '文件已接收')

  activateTaskStep(task, processMessage, 1, '正在读取 Excel 表格')
  const fileBase64 = await blobToBase64(file)
  const result = await parseEnterpriseExcel(userStore.user, {
    fileName: file.name,
    fileBase64
  })
  completeTaskStep(task, processMessage, 1, `已读取 ${result.rowCount || 0} 行数据`)

  activateTaskStep(task, processMessage, 2, '正在整理表格字段')
  const rows = Array.isArray(result.rows) ? result.rows : []
  if (!rows.length) {
    throw new Error('表格中没有可识别的数据行')
  }
  completeTaskStep(task, processMessage, 2, '表格字段整理完成')

  activateTaskStep(task, processMessage, 3, '正在生成压力表字段')
  const newDrafts = rows.map((row, index) => {
    const extractedData = repairExtractedData(row, '')
    const draft = createDraftEntry({
      name: rows.length > 1 ? `${file.name} 第 ${index + 1} 行` : file.name,
      fileType: 'excel',
      extractedData
    })
    autoAssignDraftEquipment(draft)
    return draft
  })
  completeTaskStep(task, processMessage, 3, '字段解析完成')

  activateTaskStep(task, processMessage, 4, '正在生成可编辑草稿')
  drafts.value.unshift(...newDrafts.reverse())
  finishTask(task, processMessage, `已生成 ${newDrafts.length} 份草稿`)
  addMessage('assistant', `已完成 ${file.name} 的表格解析，共生成 ${newDrafts.length} 份草稿。`)
}

async function runTaskQueue(taskEntries, concurrency = MAX_CONCURRENT_TASKS) {
  let cursor = 0

  async function consume() {
    while (cursor < taskEntries.length) {
      const currentIndex = cursor
      cursor += 1
      const entry = taskEntries[currentIndex]
      await executeTask(entry.task, entry.runner)
    }
  }

  const workerCount = Math.min(concurrency, taskEntries.length)
  await Promise.all(Array.from({ length: workerCount }, () => consume()))
}

function createTaskEntries(files, batchLabel = '') {
  return files.map((file) => {
    const isPdf = /pdf$/i.test(file.name) || file.type === 'application/pdf'
    const isExcel = isExcelFile(file)
    const task = createTask(file.name, [
      '上传文件',
      isExcel ? '读取表格' : isPdf ? '渲染页面' : '压缩图片',
      isExcel ? '整理字段' : '提取文本',
      '解析字段',
      '生成草稿'
    ], {
      fileType: isExcel ? 'excel' : isPdf ? 'pdf' : 'image',
      initialStatus: 'pending'
    })
    const processMessage = createProcessMessage(task)
    const runner = async () => {
      if (isExcel) {
        await fileToExcelDrafts(file, {
          name: file.name,
          fileType: 'excel',
          task,
          processMessage
        })
      } else if (isPdf) {
        const firstPage = await processPdfFirstPageInWorker(file)
        task.previewUrl = firstPage.previewUrl
        task.name = firstPage.name
        processMessage.title = firstPage.name
        await fileToImageDraft(firstPage.file, {
          name: firstPage.name,
          fileType: 'pdf',
          previewUrl: firstPage.previewUrl,
          directText: firstPage.directText,
          task,
          processMessage
        })
      } else {
        await fileToImageDraft(file, {
          name: file.name,
          fileType: 'image',
          task,
          processMessage
        })
      }
    }

    if (batchLabel) {
      task.summary = `${batchLabel} 等待开始`
      processMessage.summary = task.summary
    }

    return { task, runner }
  })
}

async function drainUploadBatches() {
  if (queueDrainPromise) return queueDrainPromise

  queueDrainPromise = (async () => {
    uploading.value = true
    try {
      while (pendingUploadBatches.length) {
        const currentBatch = pendingUploadBatches.shift()
        addMessage(
          'assistant',
          `${currentBatch.label} 开始处理，共 ${currentBatch.entries.length} 个文件。`
        )
        await runTaskQueue(currentBatch.entries, MAX_CONCURRENT_TASKS)
        addMessage('assistant', `${currentBatch.label} 处理完成。`)
      }
    } finally {
      uploading.value = false
      queueDrainPromise = null
    }
  })()

  return queueDrainPromise
}

async function handleFileChange(event) {
  const files = Array.from(event.target.files || [])
  if (!files.length) return

  try {
    const batches = chunkFiles(files, UPLOAD_BATCH_SIZE)
    addMessage(
      'assistant',
      batches.length > 1
        ? `已加入 ${files.length} 个文件，系统会分成 ${batches.length} 批处理。`
        : `已加入 ${files.length} 个文件，开始处理。`
    )

    batches.forEach((batchFiles, index) => {
      const batchLabel = batches.length > 1 ? `第 ${index + 1} 批` : '本批次'
      pendingUploadBatches.push({
        label: batchLabel,
        entries: createTaskEntries(batchFiles, batchLabel)
      })
    })

    await drainUploadBatches()
  } finally {
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
    }
  }
}

function findEquipmentForDraft(draft) {
  const targetName = String(
    draft?.selectedEquipmentName ||
    draft?.extractedData?.equipmentName ||
    draft?.extractedData?.sendUnit ||
    ''
  ).trim()
  if (!targetName) return null

  return equipments.value.find((item) => {
    const equipmentName = String(item.equipmentName || '').trim()
    const equipmentNo = String(item.equipmentNo || '').trim()
    return equipmentName === targetName || equipmentNo === targetName
  }) || null
}

function autoAssignDraftEquipment(draft) {
  const selected = findEquipmentForDraft(draft)
  if (!selected) return

  draft.selectedEquipmentId = selected._id
  draft.selectedEquipmentName = selected.equipmentName || ''
  if (!draft.extractedData.installLocation) {
    draft.extractedData.installLocation = selected.location || ''
  }
}

function syncSelectedEquipment(draft) {
  const selected = equipments.value.find((item) => item._id === draft.selectedEquipmentId)
  draft.selectedEquipmentName = selected?.equipmentName || ''
  if (selected && !draft.extractedData.installLocation) {
    draft.extractedData.installLocation = selected.location || ''
  }
}

function toggleRawText(draft) {
  draft.showRawText = !draft.showRawText
}

function validateDraft(draft) {
  if (!draft.selectedEquipmentId) {
    throw new Error('请选择所属设备')
  }
  if (!draft.extractedData.instrumentName) {
    throw new Error('请补全仪表名称')
  }
  if (!draft.extractedData.verificationDate) {
    throw new Error('请补全检定日期')
  }
  if (!draft.extractedData.installLocation) {
    throw new Error('请填写该压力表的安装位置')
  }
}

async function saveDraft(draft) {
  if (draft.saving || draft.saved) return

  try {
    validateDraft(draft)
  } catch (error) {
    ElMessage.warning(error.message)
    return
  }

  draft.saving = true
  try {
    syncSelectedEquipment(draft)
    const result = await saveEnterpriseAiRecord(userStore.user, {
      extractedData: draft.extractedData,
      equipmentId: draft.selectedEquipmentId,
      installLocation: draft.extractedData.installLocation,
      fileID: draft.fileID
    })
    draft.saved = true
    draft.statusText = `已保存，记录 ${result.recordId}`
    addMessage('assistant', `已保存 ${draft.name}，并同步写入共享台账。`)
    ElMessage.success('已保存到共享台账')
    await loadEquipments()
  } catch (error) {
    ElMessage.error(error.message || '保存失败')
  } finally {
    draft.saving = false
  }
}

function goToEquipments() {
  router.push('/enterprise/equipments')
}

onMounted(async () => {
  await loadEquipments()
})
</script>

<style lang="scss" scoped>
.ai-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  gap: 20px;
  min-height: calc(100vh - 180px);
}

.chat-panel,
.draft-panel {
  padding: 24px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.chat-toolbar,
.draft-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;

  h3 {
    font-size: 20px;
    color: var(--text-main);
  }

  p {
    margin-top: 8px;
    color: var(--text-sub);
    line-height: 1.6;
  }
}

.toolbar-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.hidden-input {
  display: none;
}

.queue-panel {
  margin-bottom: 18px;
  padding: 16px;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(248, 250, 255, 0.96) 0%, rgba(241, 245, 255, 0.96) 100%);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.queue-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;

  h4 {
    font-size: 16px;
    color: var(--text-main);
  }

  p {
    margin-top: 6px;
    color: var(--text-sub);
    font-size: 13px;
  }
}

.queue-head-main {
  min-width: 0;
}

.queue-head-side {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.queue-filter-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.queue-filter-btn {
  border: 0;
  background: transparent;
  color: var(--text-sub);
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.queue-filter-btn.active {
  color: #fff;
  background: linear-gradient(135deg, rgba(30, 94, 255, 0.96) 0%, rgba(63, 140, 255, 0.92) 100%);
  box-shadow: 0 8px 20px rgba(30, 94, 255, 0.18);
}

.queue-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.queue-list {
  display: grid;
  gap: 12px;
  max-height: 320px;
  overflow: auto;
  padding-right: 4px;
}

.queue-card {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  gap: 12px;
  padding: 12px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(148, 163, 184, 0.14);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.queue-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.06);
}

.queue-card.done {
  background: rgba(240, 253, 244, 0.88);
}

.queue-card.error {
  background: rgba(254, 242, 242, 0.92);
}

.queue-preview {
  width: 68px;
  height: 68px;
  border-radius: 14px;
  overflow: hidden;
  background: rgba(226, 232, 240, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.16);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.queue-preview-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-sub);
}

.queue-main {
  min-width: 0;
}

.queue-main-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.queue-card-tools {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.queue-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.4;
}

.queue-status-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  color: var(--text-sub);
  font-size: 12px;
}

.queue-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.8);
}

.queue-status-dot.active {
  background: rgba(59, 130, 246, 0.96);
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
}

.queue-status-dot.done {
  background: rgba(34, 197, 94, 0.96);
}

.queue-status-dot.error {
  background: rgba(239, 68, 68, 0.96);
}

.queue-progress {
  font-size: 16px;
  font-weight: 700;
  color: var(--primary-color);
  flex-shrink: 0;
}

.queue-meta-line {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-sub);
}

.queue-error-copy {
  color: rgba(220, 38, 38, 0.96);
}

.queue-track,
.process-track {
  height: 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.18);
  overflow: hidden;
}

.queue-track {
  margin-top: 10px;
}

.queue-track-bar,
.process-track-bar {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(30, 94, 255, 0.92) 0%, rgba(63, 140, 255, 0.88) 100%);
  transition: width 0.28s ease;
}

.queue-card.done .queue-track-bar {
  background: linear-gradient(90deg, rgba(16, 185, 129, 0.96) 0%, rgba(34, 197, 94, 0.92) 100%);
}

.queue-card.error .queue-track-bar {
  background: linear-gradient(90deg, rgba(239, 68, 68, 0.96) 0%, rgba(248, 113, 113, 0.92) 100%);
}

.queue-steps-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.queue-collapsed-line {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-sub);
}

.queue-card.collapsed .queue-preview {
  opacity: 0.88;
}

.queue-step-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--text-sub);
  background: rgba(248, 250, 252, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.16);
}

.queue-step-chip.active {
  color: rgba(30, 94, 255, 0.96);
  border-color: rgba(30, 94, 255, 0.18);
  background: rgba(239, 246, 255, 0.96);
}

.queue-step-chip.done {
  color: rgba(22, 163, 74, 0.96);
  border-color: rgba(34, 197, 94, 0.18);
  background: rgba(240, 253, 244, 0.96);
}

.queue-step-chip.error {
  color: rgba(220, 38, 38, 0.96);
  border-color: rgba(248, 113, 113, 0.18);
  background: rgba(254, 242, 242, 0.96);
}

.message-list {
  flex: 1;
  min-height: 280px;
  overflow: auto;
  padding-right: 6px;
}

.message-row {
  display: flex;
  margin-bottom: 14px;

  &.assistant {
    justify-content: flex-start;
  }

  &.user {
    justify-content: flex-end;
  }
}

.message-bubble {
  max-width: 82%;
  border-radius: 22px;
  padding: 14px 16px;
  background: rgba(241, 245, 249, 0.9);

  .assistant & {
    background: rgba(30, 94, 255, 0.08);
  }

  .user & {
    background: linear-gradient(135deg, rgba(30, 94, 255, 0.92) 0%, rgba(63, 140, 255, 0.92) 100%);
    color: #fff;
  }
}

.process-bubble {
  width: min(540px, 100%);
}

.message-meta {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
  opacity: 0.72;
}

.message-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.7;
}

.process-card {
  display: grid;
  gap: 12px;
}

.process-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.process-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}

.process-summary {
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-sub);
  line-height: 1.6;
}

.process-percent {
  font-size: 20px;
  font-weight: 700;
  color: var(--primary-color);
}

.process-steps {
  display: grid;
  gap: 10px;
}

.process-step {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 10px;
  align-items: flex-start;
}

.process-step-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-sub);
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.process-step.pending .process-step-icon {
  color: rgba(100, 116, 139, 0.92);
}

.process-step.active .process-step-icon {
  color: #fff;
  background: linear-gradient(135deg, rgba(30, 94, 255, 0.96) 0%, rgba(63, 140, 255, 0.92) 100%);
  border-color: transparent;
  box-shadow: 0 10px 24px rgba(30, 94, 255, 0.22);
}

.process-step.active .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #fff;
  animation: pulse-step 1.1s ease-in-out infinite;
}

.process-step.done .process-step-icon {
  color: #fff;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.96) 0%, rgba(34, 197, 94, 0.92) 100%);
  border-color: transparent;
}

.process-step.error .process-step-icon {
  color: #fff;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.96) 0%, rgba(248, 113, 113, 0.92) 100%);
  border-color: transparent;
}

.process-step-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
}

.process-step-detail {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-sub);
  line-height: 1.5;
}

.chat-input {
  padding-top: 18px;
}

.chat-submit {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-sub);
  background: rgba(241, 245, 249, 0.62);
  border-radius: 20px;
}

.draft-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: auto;
  padding-right: 4px;
}

.draft-card {
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.82);
  padding: 18px;
}

.draft-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;

  h4 {
    font-size: 18px;
    color: var(--text-main);
  }

  p {
    margin-top: 6px;
    color: var(--text-sub);
  }
}

.draft-body {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 18px;
}

.draft-preview {
  img {
    width: 100%;
    border-radius: 18px;
    display: block;
    border: 1px solid rgba(148, 163, 184, 0.16);
  }
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}

.equipment-item {
  grid-column: 1 / -1;
}

.draft-actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
}

.raw-text-box {
  margin-top: 14px;
  padding: 14px;
  border-radius: 18px;
  background: rgba(241, 245, 249, 0.88);
  color: var(--text-sub);
  line-height: 1.7;
  white-space: pre-wrap;
  max-height: 220px;
  overflow: auto;
}

@media (max-width: 1360px) {
  .ai-layout {
    grid-template-columns: 1fr;
  }

  .draft-body {
    grid-template-columns: 1fr;
  }
}

@keyframes pulse-step {
  0%,
  100% {
    transform: scale(0.75);
    opacity: 0.72;
  }

  50% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>

