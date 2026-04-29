<template>
  <div class="enterprise-ai-page">
    <div class="page-header">
      <h1 class="page-title">AI 管家</h1>
      <p class="page-subtitle">支持知识问答、PDF 检定表解析、多张图片识别，并直接保存到与小程序共用的设备和压力表台账。</p>
    </div>

    <section class="ai-layout">
      <article class="chat-panel card-shell">
        <div class="chat-toolbar">
          <div class="toolbar-copy">
            <h3>对话区</h3>
            <p>可以直接提问，也可以上传 PDF 或多张图片进行识别。</p>
          </div>
          <div class="toolbar-actions">
            <input
              ref="fileInputRef"
              class="hidden-input"
              type="file"
              accept="image/*,.pdf,application/pdf"
              multiple
              @change="handleFileChange"
            >
            <el-button :loading="uploading" @click="triggerFileSelect">上传文件</el-button>
            <el-button type="primary" :loading="uploading" @click="triggerFileSelect">上传 PDF / 图片</el-button>
          </div>
        </div>

        <div ref="messageListRef" class="message-list">
          <div
            v-for="message in messages"
            :key="message.id"
            class="message-row"
            :class="message.role"
          >
            <div class="message-bubble">
              <div class="message-meta">{{ message.role === 'assistant' ? 'AI 管家' : '企业用户' }}</div>
              <div class="message-text">{{ message.content }}</div>
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
                <p>{{ draft.fileType === 'pdf' ? 'PDF 页面' : '图片识别' }} · {{ draft.statusText }}</p>
              </div>
              <div class="draft-card-actions">
                <el-tag :type="draft.saved ? 'success' : 'warning'">{{ draft.saved ? '已保存' : '待保存' }}</el-tag>
              </div>
            </div>

            <div class="draft-body">
              <div class="draft-preview" v-if="draft.previewUrl">
                <img :src="draft.previewUrl" alt="识别预览">
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
                      <el-input v-model="draft.extractedData.modelSpec" placeholder="例如：(0-1.6)MPa" />
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
                      <el-input v-model="draft.extractedData.verificationDate" placeholder="YYYY-MM-DD" />
                    </el-form-item>
                    <el-form-item label="压力表状态">
                      <el-select v-model="draft.extractedData.gaugeStatus" placeholder="请选择状态">
                        <el-option label="在用" value="在用" />
                        <el-option label="停用" value="停用" />
                        <el-option label="报废" value="报废" />
                      </el-select>
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
                      <el-button link type="primary" @click="goToEquipments">没有想要的设备，去新增</el-button>
                    </el-form-item>
                  </div>
                </el-form>

                <div class="draft-actions">
                  <el-button @click="toggleRawText(draft)">
                    {{ draft.showRawText ? '收起原文' : '查看提取原文' }}
                  </el-button>
                  <el-button type="primary" :loading="draft.saving" :disabled="draft.saved" @click="saveDraft(draft)">
                    {{ draft.saved ? '已保存到台账' : '保存到共用台账' }}
                  </el-button>
                </div>

                <div v-if="draft.showRawText" class="raw-text-box">{{ draft.ocrText || '无提取原文' }}</div>
              </div>
            </div>
          </section>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { callAiFunction, callOcrFunction } from '@/api/cloud'
import { getEnterpriseEquipments, saveEnterpriseAiRecord } from '@/api/regulator'
import { useUserStore } from '@/stores/user'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

const userStore = useUserStore()
const router = useRouter()

const fileInputRef = ref(null)
const messageListRef = ref(null)
const question = ref('')
const asking = ref(false)
const uploading = ref(false)
const drafts = ref([])
const equipments = ref([])
const messages = ref([
  {
    id: `msg_${Date.now()}`,
    role: 'assistant',
    content: '请输入问题，或直接上传 PDF / 多张图片。我会先提取检定表内容，再生成可编辑的压力表存档草稿。'
  }
])

function addMessage(role, content) {
  messages.value.push({
    id: `msg_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    role,
    content
  })
  nextTick(() => {
    const container = messageListRef.value
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  })
}

function triggerFileSelect() {
  fileInputRef.value?.click()
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

function normalizeDateText(text) {
  return String(text || '')
    .replace(/\s+/g, '')
    .replace(/年/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '')
    .replace(/\./g, '-')
    .replace(/\//g, '-')
}

function normalizePdfLine(line) {
  let text = String(line || '').replace(/\s+/g, ' ').trim()
  for (let i = 0; i < 4; i += 1) {
    text = text.replace(/([\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, '$1')
  }
  return text
    .replace(/([\u4e00-\u9fa5])\s*\/\s*([\u4e00-\u9fa5])/g, '$1/$2')
    .replace(/\(\s*/g, '(')
    .replace(/\s*\)/g, ')')
    .trim()
}

function buildPdfPageText(items = []) {
  const rows = new Map()
  for (const item of items) {
    const y = Math.round((item.transform?.[5] || 0) / 4) * 4
    if (!rows.has(y)) rows.set(y, [])
    rows.get(y).push({
      str: String(item.str || ''),
      x: item.transform?.[4] || 0
    })
  }

  return Array.from(rows.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, lineItems]) => {
      const sorted = lineItems.sort((a, b) => a.x - b.x)
      const merged = []
      for (const item of sorted) {
        const last = merged[merged.length - 1]
        if (
          last &&
          item.str &&
          item.str === last.str &&
          item.str.length <= 2 &&
          Math.abs(item.x - last.x) < 3
        ) {
          continue
        }
        merged.push(item)
      }
      return merged.map((item) => item.str).join(' ')
    })
    .map(normalizePdfLine)
    .filter(Boolean)
    .join('\n')
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
    gaugeStatus: data?.gaugeStatus || '在用'
  }

  const compactText = String(rawText || '').replace(/\s+/g, '')

  if (!next.modelSpec) {
    const match = compactText.match(/([（(]?\d+(?:\.\d+)?[-~－—–一至到]\d+(?:\.\d+)?[)）]?(?:MPa|KPa|kPa|Pa))/i)
    if (match?.[1]) {
      next.modelSpec = match[1]
        .replace(/（/g, '(')
        .replace(/）/g, ')')
        .replace(/[－—–一至到~]/g, '-')
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

async function loadEquipments() {
  const result = await getEnterpriseEquipments(userStore.user)
  equipments.value = result.list || []
}

function buildConversationContext() {
  const recentMessages = messages.value.slice(-6).map((item) => ({
    role: item.role,
    kind: 'text',
    content: item.content
  }))

  const latestDraft = drafts.value[0]
  const visionDraft = latestDraft ? {
    ...latestDraft.extractedData,
    selectedEquipmentId: latestDraft.selectedEquipmentId || '',
    selectedEquipmentName: latestDraft.selectedEquipmentName || ''
  } : null

  return {
    recentMessages,
    visionDraft
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
  const previewUrl = meta.previewUrl || URL.createObjectURL(file)
  let sourceText = String(meta.directText || '').trim()

  if (!sourceText) {
    const imageBase64 = await blobToBase64(file)
    const ocrRes = await callOcrFunction({ imageBase64 })
    sourceText = String(ocrRes.text || '').trim()
  }

  const aiRes = await callAiFunction({
    action: 'extractRecordFromImage',
    ocrText: sourceText,
    userType: 'enterprise',
    userInfo: userStore.user
  })

  const extractedData = repairExtractedData(aiRes?.data || {}, sourceText)

  const draft = {
    id: `draft_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    name: meta.name || file.name || '识别草稿',
    fileType: meta.fileType || 'image',
    statusText: '识别完成',
    previewUrl,
    fileID: '',
    ocrText: sourceText,
    extractedData,
    selectedEquipmentId: '',
    selectedEquipmentName: '',
    saved: false,
    saving: false,
    showRawText: false
  }

  drafts.value.unshift(draft)
  addMessage('assistant', `已完成 ${draft.name} 的识别，请确认字段后保存到共用台账。`)
}

async function pdfToImageFiles(file) {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const result = []
  const pageNo = 1
  const page = await pdf.getPage(pageNo)
  const textContent = await page.getTextContent()
  const pageText = buildPdfPageText(textContent.items || [])
  const viewport = page.getViewport({ scale: 1.8 })
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: context, viewport }).promise

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.92))
  if (!blob) return result

  result.push({
    file: new File([blob], `${file.name.replace(/\.pdf$/i, '')}_page_1.png`, {
      type: 'image/png'
    }),
    previewUrl: URL.createObjectURL(blob),
    directText: pageText,
    name: `${file.name} 第 1 页`
  })

  return result
}

async function handleFileChange(event) {
  const files = Array.from(event.target.files || [])
  if (!files.length || uploading.value) return

  uploading.value = true
  addMessage('assistant', `开始处理 ${files.length} 个文件。`)

  try {
    for (const file of files) {
      if (/pdf$/i.test(file.name) || file.type === 'application/pdf') {
        const pages = await pdfToImageFiles(file)
        if (!pages.length) {
          addMessage('assistant', `${file.name} 未解析出有效页面。`)
          continue
        }
        for (const page of pages) {
          await fileToImageDraft(page.file, {
            name: page.name,
            fileType: 'pdf',
            previewUrl: page.previewUrl,
            directText: page.directText
          })
        }
      } else {
        await fileToImageDraft(file, {
          name: file.name,
          fileType: 'image'
        })
      }
    }
  } catch (error) {
    addMessage('assistant', `文件处理失败：${error.message || '未知错误'}`)
  } finally {
    uploading.value = false
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
    }
  }
}

function syncSelectedEquipment(draft) {
  const selected = equipments.value.find((item) => item._id === draft.selectedEquipmentId)
  draft.selectedEquipmentName = selected?.equipmentName || ''
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
      fileID: draft.fileID
    })
    draft.saved = true
    draft.statusText = `已保存，记录 ${result.recordId}`
    addMessage('assistant', `已保存 ${draft.name}，并同步写入共用台账。`)
    ElMessage.success('已保存到共用台账')
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

.message-list {
  flex: 1;
  min-height: 340px;
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
}
</style>
