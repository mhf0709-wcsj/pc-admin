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

        <section class="quick-prompt-panel">
          <button
            v-for="prompt in quickPrompts"
            :key="prompt.title"
            type="button"
            class="quick-prompt-card"
            :disabled="asking"
            @click="sendQuestion(prompt.question)"
          >
            <span class="quick-prompt-kicker">{{ prompt.kicker }}</span>
            <span class="quick-prompt-title">{{ prompt.title }}</span>
            <span class="quick-prompt-copy">{{ prompt.question }}</span>
          </button>
        </section>

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
            <div class="message-avatar" :class="message.role">
              <svg
                v-if="message.role === 'assistant'"
                class="avatar-svg"
                viewBox="0 0 48 48"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="aiAvatarFill" x1="0%" x2="100%" y1="0%" y2="100%">
                    <stop offset="0%" stop-color="#ffffff" stop-opacity="0.92" />
                    <stop offset="100%" stop-color="#c7d2fe" stop-opacity="0.78" />
                  </linearGradient>
                </defs>
                <rect x="8" y="8" width="32" height="32" rx="12" fill="url(#aiAvatarFill)" />
                <circle cx="19" cy="21" r="2.6" fill="#1e3a8a" />
                <circle cx="29" cy="21" r="2.6" fill="#1e3a8a" />
                <path d="M18 29c2.6 2.4 9.4 2.4 12 0" fill="none" stroke="#1e3a8a" stroke-linecap="round" stroke-width="2.4" />
                <path d="M24 5v7" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-width="2.4" />
                <circle cx="24" cy="4.5" r="2.4" fill="#ffffff" />
              </svg>
              <svg
                v-else
                class="avatar-svg"
                viewBox="0 0 48 48"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="userAvatarFill" x1="0%" x2="100%" y1="0%" y2="100%">
                    <stop offset="0%" stop-color="#ecfeff" />
                    <stop offset="100%" stop-color="#bfdbfe" />
                  </linearGradient>
                </defs>
                <circle cx="24" cy="18" r="8" fill="url(#userAvatarFill)" />
                <path d="M12 40c1.8-7.6 8-11.8 12-11.8S34.2 32.4 36 40" fill="url(#userAvatarFill)" />
              </svg>
            </div>

            <div class="message-stack">
              <div class="message-identity">
                <span class="message-name">{{ message.role === 'assistant' ? 'AI 管家' : '企业用户' }}</span>
                <span v-if="message.badgeText" class="message-badge">{{ message.badgeText }}</span>
              </div>

              <div class="message-bubble" :class="{ 'process-bubble': message.type === 'process' }">
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

                <template v-else-if="message.type === 'typing'">
                  <div class="typing-card">
                    <div class="typing-copy">{{ message.summary }}</div>
                    <div class="typing-dots" aria-hidden="true">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </template>

                <div v-else class="message-text">{{ message.content }}</div>
              </div>

              <div class="message-footer">
                <span>{{ message.timeLabel }}</span>
                <span v-if="message.statusText">{{ message.statusText }}</span>
              </div>
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

        <section class="history-panel">
          <div class="history-head">
            <div>
              <h4>历史识别任务</h4>
              <p>刷新页面后，仍可继续查看处理中任务和已完成结果。</p>
            </div>
            <div class="history-tools">
              <div class="queue-filter-group">
                <button
                  v-for="option in historyFilterOptions"
                  :key="option.value"
                  type="button"
                  class="queue-filter-btn"
                  :class="{ active: historyFilter === option.value }"
                  @click="historyFilter = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
              <el-button link type="primary" :loading="historyLoading" @click="refreshRecognitionHistory">
                刷新
              </el-button>
              <el-button
                v-if="recognitionHistory.some((item) => item.status === 'error')"
                link
                type="warning"
                :loading="historyBatchRetrying"
                @click="retryAllFailedHistory"
              >
                一键重试失败
              </el-button>
              <el-button
                v-if="recognitionHistory.some((item) => item.status === 'done')"
                link
                type="danger"
                :loading="historyClearing"
                @click="clearCompletedHistory"
              >
                清理已完成
              </el-button>
            </div>
          </div>

          <div v-if="filteredRecognitionHistory.length" class="history-list">
            <div
              v-for="item in filteredRecognitionHistory"
              :key="item.jobId"
              class="history-card"
              :class="item.status"
            >
              <div class="history-card-main">
                <div class="history-card-head">
                  <div class="history-name">{{ item.name }}</div>
                  <el-tag size="small" :type="getTaskStatusMeta(item.status === 'processing' ? 'active' : item.status).tagType">
                    {{ item.statusLabel }}
                  </el-tag>
                </div>
                <div class="history-meta">
                  <span>{{ item.fileTypeLabel }}</span>
                  <span>{{ item.timeLabel }}</span>
                  <span>第 {{ item.attempts || 0 }} 次尝试</span>
                </div>
                <div class="history-summary">{{ item.summary || '暂无状态说明' }}</div>
              </div>
              <div class="history-actions">
                <el-button
                  link
                  type="danger"
                  :loading="historyDeletingId === item.jobId"
                  @click="removeHistoryTask(item)"
                >
                  删除
                </el-button>
                <el-button
                  v-if="item.status === 'error'"
                  link
                  type="warning"
                  :loading="historyRetryingId === item.jobId"
                  @click="retryHistoryTask(item, 'full')"
                >
                  整任务重跑
                </el-button>
                <el-button
                  v-if="item.status === 'error'"
                  link
                  type="primary"
                  :disabled="!item.imageStored"
                  :loading="historyRetryingId === item.jobId"
                  @click="retryHistoryTask(item, 'ocr')"
                >
                  重新 OCR
                </el-button>
                <el-button
                  v-if="item.status === 'error'"
                  link
                  type="success"
                  :loading="historyRetryingId === item.jobId"
                  @click="retryHistoryTask(item, 'parse')"
                >
                  重新解析
                </el-button>
                <el-button
                  v-else-if="item.status === 'done'"
                  link
                  type="primary"
                  @click="restoreDraftFromHistory(item)"
                >
                  恢复草稿
                </el-button>
                <el-button
                  v-else-if="item.status === 'processing' || item.status === 'queued'"
                  link
                  type="primary"
                  @click="resumeHistoryTask(item)"
                >
                  继续跟踪
                </el-button>
                <el-button link type="info" @click="openHistoryDetail(item)">
                  详情
                </el-button>
              </div>
            </div>
          </div>
          <div v-else class="history-empty">
            还没有历史识别任务。
          </div>
        </section>

        <el-drawer v-model="historyDetailVisible" title="任务详情" size="560px" append-to-body>
          <template v-if="selectedHistoryTask">
            <section class="job-detail-hero">
              <div>
                <h4>{{ selectedHistoryTask.name }}</h4>
                <p>{{ selectedHistoryTask.fileTypeLabel }} · {{ selectedHistoryTask.timeLabel }}</p>
              </div>
              <el-tag :type="getTaskStatusMeta(selectedHistoryTask.status === 'processing' ? 'active' : selectedHistoryTask.status).tagType">
                {{ selectedHistoryTask.statusLabel }}
              </el-tag>
            </section>

            <el-descriptions :column="1" border>
              <el-descriptions-item label="失败原因">
                {{ selectedHistoryTask.error || selectedHistoryTask.summary || '暂无' }}
              </el-descriptions-item>
              <el-descriptions-item label="耗时">
                {{ formatDuration(selectedHistoryTask.durationMs) }}
              </el-descriptions-item>
              <el-descriptions-item label="尝试次数">
                {{ selectedHistoryTask.attempts || 0 }}
              </el-descriptions-item>
              <el-descriptions-item label="阶段">
                {{ selectedHistoryTask.stage || '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="文件缓存">
                {{ selectedHistoryTask.imageStored ? '保留原图，可重新 OCR' : '已瘦身存储，仅保留 OCR 文本/解析结果' }}
              </el-descriptions-item>
              <el-descriptions-item label="处理文件大小">
                {{ formatFileSize(selectedHistoryTask.sourceSize) }}
              </el-descriptions-item>
            </el-descriptions>

            <h4 class="job-section-title">OCR 原文</h4>
            <pre class="job-raw-text">{{ selectedHistoryOcrText || '暂无 OCR 原文' }}</pre>

            <h4 class="job-section-title">AI 解析结果</h4>
            <pre class="job-raw-text">{{ selectedHistoryAiJson }}</pre>

            <div v-if="selectedHistoryTask.status === 'error'" class="job-detail-actions">
              <el-button
                type="primary"
                :disabled="!selectedHistoryTask.imageStored"
                :loading="historyRetryingId === selectedHistoryTask.jobId"
                @click="retryHistoryTask(selectedHistoryTask, 'ocr')"
              >
                重新 OCR
              </el-button>
              <el-button type="success" :loading="historyRetryingId === selectedHistoryTask.jobId" @click="retryHistoryTask(selectedHistoryTask, 'parse')">重新解析字段</el-button>
              <el-button type="warning" :loading="historyRetryingId === selectedHistoryTask.jobId" @click="retryHistoryTask(selectedHistoryTask, 'full')">整任务重跑</el-button>
            </div>
          </template>
        </el-drawer>

        <div v-if="!drafts.length" class="empty-state">
          还没有识别结果，请先上传 PDF 或图片。
        </div>

        <section v-if="drafts.length && draftConflictItems.length && !hideConflictDesk" class="conflict-desk">
          <div class="conflict-head">
            <div>
              <h4>批量导入冲突处理台</h4>
              <p>先集中处理重复证书、重复出厂编号、缺字段和日期异常，减少逐条保存返工。</p>
            </div>
            <div class="conflict-actions">
              <el-tag type="warning">{{ draftConflictItems.length }} 个问题</el-tag>
              <el-button link type="info" @click="hideConflictDesk = true">本轮先忽略</el-button>
            </div>
          </div>
          <div class="conflict-list">
            <div v-for="item in draftConflictItems" :key="item.key" class="conflict-item">
              <el-tag :type="item.level === 'danger' ? 'danger' : 'warning'" size="small">
                {{ item.type }}
              </el-tag>
              <span>{{ item.message }}</span>
              <el-button link type="primary" @click="scrollDraftIntoView(item.draftId)">定位草稿</el-button>
            </div>
          </div>
        </section>

        <div v-if="drafts.length" class="draft-list">
          <section v-for="draft in drafts" :key="draft.id" class="draft-card" :data-draft-id="draft.id">
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
                <div class="confidence-summary">
                  <span>字段置信度：</span>
                  <el-tag size="small" type="success">{{ countConfidence(draft, 'high') }} 高</el-tag>
                  <el-tag size="small" type="warning">{{ countConfidence(draft, 'medium') }} 中</el-tag>
                  <el-tag size="small" type="danger">{{ countConfidence(draft, 'low') }} 低</el-tag>
                </div>
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
                    <el-form-item label="证书编号" :class="confidenceClass(draft, 'certNo')">
                      <el-input v-model="draft.extractedData.certNo" />
                      <span class="confidence-badge">{{ confidenceLabel(draft, 'certNo') }}</span>
                    </el-form-item>
                    <el-form-item label="出厂编号" :class="confidenceClass(draft, 'factoryNo')">
                      <el-input v-model="draft.extractedData.factoryNo" />
                      <span class="confidence-badge">{{ confidenceLabel(draft, 'factoryNo') }}</span>
                    </el-form-item>
                    <el-form-item label="送检单位" :class="confidenceClass(draft, 'sendUnit')">
                      <el-input v-model="draft.extractedData.sendUnit" />
                      <span class="confidence-badge">{{ confidenceLabel(draft, 'sendUnit') }}</span>
                    </el-form-item>
                    <el-form-item label="仪表名称" :class="confidenceClass(draft, 'instrumentName')">
                      <el-input v-model="draft.extractedData.instrumentName" />
                      <span class="confidence-badge">{{ confidenceLabel(draft, 'instrumentName') }}</span>
                    </el-form-item>
                    <el-form-item label="型号规格" :class="confidenceClass(draft, 'modelSpec')">
                      <el-input
                        v-model="draft.extractedData.modelSpec"
                        placeholder="例如：(0-1.6)MPa"
                      />
                      <span class="confidence-badge">{{ confidenceLabel(draft, 'modelSpec') }}</span>
                    </el-form-item>
                    <el-form-item label="制造单位" :class="confidenceClass(draft, 'manufacturer')">
                      <el-input v-model="draft.extractedData.manufacturer" />
                      <span class="confidence-badge">{{ confidenceLabel(draft, 'manufacturer') }}</span>
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
                    <el-form-item label="检定日期" :class="confidenceClass(draft, 'verificationDate')">
                      <el-input
                        v-model="draft.extractedData.verificationDate"
                        placeholder="YYYY-MM-DD"
                      />
                      <span class="confidence-badge">{{ confidenceLabel(draft, 'verificationDate') }}</span>
                    </el-form-item>
                    <el-form-item label="压力表状态">
                      <el-select v-model="draft.extractedData.gaugeStatus" placeholder="请选择状态">
                        <el-option label="在用" value="在用" />
                        <el-option label="停用" value="停用" />
                        <el-option label="报废" value="报废" />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="安装位置" :class="confidenceClass(draft, 'installLocation')">
                      <el-input
                        v-model="draft.extractedData.installLocation"
                        placeholder="请填写该压力表的安装位置"
                      />
                      <span class="confidence-badge">{{ confidenceLabel(draft, 'installLocation') }}</span>
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
                    <el-form-item class="equipment-item" label="安装位置/现场照片">
                      <div class="site-photo-box">
                        <img
                          v-if="draft.installPhotoPreviewUrl"
                          :src="draft.installPhotoPreviewUrl"
                          alt="现场照片"
                        />
                        <div v-else class="site-photo-empty">未上传现场照片</div>
                        <el-upload
                          :auto-upload="false"
                          :show-file-list="false"
                          accept="image/*"
                          :on-change="(file) => handleInstallPhotoChange(file, draft)"
                        >
                          <el-button size="small" type="primary" plain>
                            {{ draft.installPhotoFileID ? '更换现场照片' : '上传现场照片' }}
                          </el-button>
                        </el-upload>
                      </div>
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
import { ElMessage, ElMessageBox } from 'element-plus'
import { callAiFunction, callOcrFunction } from '@/api/cloud'
import {
  getEnterpriseEquipments,
  parseEnterpriseExcel,
  saveEnterpriseAiRecord,
  submitEnterpriseRecognitionTask,
  getEnterpriseRecognitionTask,
  listEnterpriseRecognitionTasks,
  deleteEnterpriseRecognitionTask,
  clearCompletedRecognitionTasks,
  retryEnterpriseRecognitionTask,
  batchRetryEnterpriseRecognitionTasks,
  getEnterpriseRecords
} from '@/api/regulator'
import { useUserStore } from '@/stores/user'
import EnterpriseAiProcessorWorker from '@/workers/enterpriseAiProcessor.worker.js?worker'

const MAX_CONCURRENT_TASKS = 3
const UPLOAD_BATCH_SIZE = 6
const BACKGROUND_POLL_INTERVAL_MS = 1500
const MAX_OCR_CONCURRENCY = 2
const OCR_RETRY_LIMIT = 2
const OCR_TIMEOUT_MS = 25000
const MAX_AI_PARSE_CONCURRENCY = 2
const AI_PARSE_TIMEOUT_MS = 60000
const PDF_TEXT_ONLY_MIN_LENGTH = 80
const EXCEL_EXT_PATTERN = /\.(xlsx|csv)$/i

const userStore = useUserStore()
const router = useRouter()
const pendingUploadBatches = []
const aiParseCache = new Map()
const aiParsePending = new Map()
const notifiedRecognitionJobs = new Set()
let isDrainingUploadBatches = false

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
const recognitionHistory = ref([])
const historyFilter = ref('all')
const historyLoading = ref(false)
const historyDeletingId = ref('')
const historyClearing = ref(false)
const historyRetryingId = ref('')
const historyBatchRetrying = ref(false)
const historyDetailVisible = ref(false)
const selectedHistoryTask = ref(null)
const hideConflictDesk = ref(false)
const quickPrompts = [
  {
    kicker: '风险扫描',
    title: '检查这批台账风险',
    question: '帮我检查这批台账里已过期和 30 天内到期的压力表风险，并给我一个处理建议。'
  },
  {
    kicker: '上传协助',
    title: '帮我整理上传文件',
    question: '我准备上传一批 PDF、图片和 Excel 表格，请先告诉我怎么上传更高效、怎么减少识别错误。'
  },
  {
    kicker: '到期提醒',
    title: '看看 30 天内到期压力表',
    question: '帮我看看企业里 30 天内到期的压力表应该优先处理哪些，并按风险高低给我排序。'
  }
]

function formatMessageTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDuration(value) {
  const ms = Number(value || 0)
  if (!ms) return '暂无'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatFileSize(value) {
  const bytes = Number(value || 0)
  if (!bytes) return '暂无'
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`
}

function buildMessage(role, type = 'text', extra = {}) {
  return {
    id: extra.id || `msg_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    role,
    type,
    content: extra.content || '',
    title: extra.title || '',
    summary: extra.summary || '',
    progress: extra.progress || 0,
    steps: extra.steps || [],
    timeLabel: extra.timeLabel || formatMessageTime(),
    statusText: extra.statusText || (role === 'user' ? '已发送' : ''),
    badgeText: extra.badgeText || (role === 'assistant' ? '在线' : '')
  }
}

const messages = ref([
  buildMessage('assistant', 'text', {
    content: '你好，我是你的 AI 管家。你可以直接把问题发给我，也可以一次上传 PDF、多张图片或 Excel 表格。我会帮你提取检定信息、整理字段，并生成可以直接保存的压力表台账草稿。',
    statusText: '欢迎使用'
  })
])

const queueFilterOptions = [
  { label: '全部', value: 'all' },
  { label: '进行中', value: 'active' },
  { label: '失败', value: 'error' },
  { label: '已完成', value: 'done' }
]
const historyFilterOptions = [
  { label: '全部', value: 'all' },
  { label: '处理中', value: 'processing' },
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

const filteredRecognitionHistory = computed(() => {
  if (historyFilter.value === 'all') return recognitionHistory.value
  return recognitionHistory.value.filter((item) => item.status === historyFilter.value)
})

const selectedHistoryOcrText = computed(() => {
  const job = selectedHistoryTask.value
  return String(job?.result?.ocrText || job?.ocrText || '').trim()
})

const selectedHistoryAiJson = computed(() => {
  const data = selectedHistoryTask.value?.result?.extractedData || null
  return data ? JSON.stringify(data, null, 2) : '暂无 AI 解析结果'
})

const draftConflictItems = computed(() => {
  const issues = []
  const certMap = new Map()
  const factoryMap = new Map()

  drafts.value.forEach((draft) => {
    const data = draft.extractedData || {}
    const certNo = String(data.certNo || '').trim()
    const factoryNo = String(data.factoryNo || '').trim()

    if (certNo) {
      certMap.set(certNo, [...(certMap.get(certNo) || []), draft])
    } else {
      issues.push(buildDraftIssue(draft, '缺字段', '缺少证书编号', 'warning'))
    }

    if (factoryNo) {
      factoryMap.set(factoryNo, [...(factoryMap.get(factoryNo) || []), draft])
    } else {
      issues.push(buildDraftIssue(draft, '缺字段', '缺少出厂编号', 'warning'))
    }

    if (!String(data.instrumentName || '').trim()) {
      issues.push(buildDraftIssue(draft, '缺字段', '缺少仪表名称', 'warning'))
    }
    if (!String(data.installLocation || '').trim()) {
      issues.push(buildDraftIssue(draft, '缺字段', '缺少安装位置', 'danger'))
    }
    if (!draft.installPhotoFileID) {
      issues.push(buildDraftIssue(draft, '缺现场照片', '保存前需要上传安装位置/现场照片', 'danger'))
    }
    if (!isValidDateText(data.verificationDate)) {
      issues.push(buildDraftIssue(draft, '日期异常', '检定日期为空或格式不是 YYYY-MM-DD', 'danger'))
    }
  })

  certMap.forEach((items, certNo) => {
    if (items.length > 1) {
      items.forEach((draft) => issues.push(buildDraftIssue(draft, '重复证书', `证书编号 ${certNo} 在本批次重复`, 'danger')))
    }
  })
  factoryMap.forEach((items, factoryNo) => {
    if (items.length > 1) {
      items.forEach((draft) => issues.push(buildDraftIssue(draft, '重复出厂编号', `出厂编号 ${factoryNo} 在本批次重复`, 'danger')))
    }
  })

  return issues
})

function buildDraftIssue(draft, type, message, level = 'warning') {
  return {
    key: `${draft.id}_${type}_${message}`,
    draftId: draft.id,
    type,
    message: `${draft.name}：${message}`,
    level
  }
}

function isValidDateText(value) {
  const text = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const date = new Date(`${text}T00:00:00`)
  return !Number.isNaN(date.getTime())
}

const CONFIDENCE_FIELDS = [
  'certNo',
  'factoryNo',
  'sendUnit',
  'instrumentName',
  'modelSpec',
  'manufacturer',
  'verificationDate',
  'installLocation'
]

function inferFieldConfidence(draft, field) {
  const value = String(draft?.extractedData?.[field] || '').trim()
  const rawText = String(draft?.ocrText || '')
  if (!value) return 'low'
  if (field === 'verificationDate') return isValidDateText(value) ? 'high' : 'low'
  if (['certNo', 'factoryNo'].includes(field) && value.length < 5) return 'low'
  if (field === 'installLocation') return value.length >= 3 ? 'medium' : 'low'
  if (rawText && rawText.includes(value)) return 'high'
  if (value.length >= 4) return 'medium'
  return 'low'
}

function getFieldConfidence(draft, field) {
  draft.fieldConfidence ||= {}
  const current = draft.fieldConfidence[field]
  return current || inferFieldConfidence(draft, field)
}

function confidenceLabel(draft, field) {
  const level = getFieldConfidence(draft, field)
  return level === 'high' ? '高置信度' : level === 'medium' ? '中置信度' : '低置信度，建议核对'
}

function confidenceClass(draft, field) {
  return `confidence-${getFieldConfidence(draft, field)}`
}

function countConfidence(draft, level) {
  return CONFIDENCE_FIELDS.filter((field) => getFieldConfidence(draft, field) === level).length
}

function scrollMessagesToBottom() {
  nextTick(() => {
    const container = messageListRef.value
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  })
}

function addMessage(role, content, extra = {}) {
  messages.value.push(buildMessage(role, 'text', {
    ...extra,
    content
  }))
  scrollMessagesToBottom()
}

function updateLatestUserMessageStatus(statusText = '已读') {
  const latestUserMessage = [...messages.value].reverse().find((item) => item.role === 'user')
  if (latestUserMessage) {
    latestUserMessage.statusText = statusText
  }
}

function createTypingMessage(summary = '正在思考你的问题…') {
  const message = buildMessage('assistant', 'typing', {
    summary,
    statusText: '思考中'
  })
  messages.value.push(message)
  scrollMessagesToBottom()
  return message
}

function removeMessageById(messageId) {
  messages.value = messages.value.filter((item) => item.id !== messageId)
}

async function streamAssistantMessage(content, extra = {}) {
  const fullText = String(content || '').trim() || '未获得 AI 回复。'
  const message = buildMessage('assistant', 'text', {
    ...extra,
    content: '',
    statusText: '回复中'
  })
  messages.value.push(message)
  scrollMessagesToBottom()

  const segments = fullText
    .split(/(?<=[。！？；\n])/)
    .map((item) => item.trim())
    .filter(Boolean)

  if (!segments.length) {
    message.content = fullText
    message.statusText = '已送达'
    scrollMessagesToBottom()
    return
  }

  for (const segment of segments) {
    message.content += `${message.content ? '\n' : ''}${segment}`
    scrollMessagesToBottom()
    await sleep(Math.min(320, Math.max(120, segment.length * 18)))
  }

  message.statusText = '已送达'
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
      serverJobId: '',
      monitorToken: '',
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

function getTaskStepLabels(fileType = 'image') {
  return [
    '上传文件',
    fileType === 'excel' ? '读取表格' : fileType === 'pdf' ? '渲染页面' : '压缩图片',
    fileType === 'excel' ? '整理字段' : '提取文本',
    '解析字段',
    '生成草稿'
  ]
}

function createProcessMessage(task) {
  const message = buildMessage('assistant', 'process', {
    id: `process_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    title: task.name,
    summary: task.summary,
    progress: task.progress,
    steps: task.steps.map((step) => ({ ...step })),
    statusText: '处理中'
  })
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
  message.statusText = task.status === 'done' ? '已完成' : task.status === 'error' ? '失败' : '处理中'
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

function findDraftByJobId(jobId) {
  return drafts.value.find((item) => item.jobId === jobId) || null
}

function buildDraftFromRecognitionJob(job, meta = {}) {
  const existing = findDraftByJobId(job.jobId)
  if (existing) return existing

  const draft = createDraftEntry({
    name: meta.name || job.name || '识别草稿',
    fileType: meta.fileType || job.fileType || 'image',
    previewUrl: meta.previewUrl || '',
    fileID: '',
    ocrText: String(job.result?.ocrText || '').trim(),
    extractedData: repairExtractedData(job.result?.extractedData || {}, job.result?.ocrText || '')
  })
  draft.jobId = job.jobId
  drafts.value.unshift(draft)
  autoAssignDraftEquipment(draft)
  return draft
}

function normalizeHistoryItem(job) {
  const fileType = String(job.fileType || 'image')
  return {
    ...job,
    status: String(job.status || 'queued'),
    statusLabel:
      job.status === 'processing'
        ? '处理中'
        : job.status === 'queued'
          ? '排队中'
          : job.status === 'done'
            ? '已完成'
            : job.status === 'error'
              ? '失败'
              : '未知',
    fileTypeLabel:
      fileType === 'pdf'
        ? 'PDF 页面'
        : fileType === 'excel'
          ? '表格导入'
          : '图片识别',
    timeLabel: formatMessageTime(Number(job.updatedAt || job.createdAt || Date.now()))
  }
}

function openHistoryDetail(item) {
  selectedHistoryTask.value = item
  historyDetailVisible.value = true
}

async function refreshRecognitionHistory() {
  historyLoading.value = true
  try {
    const before = new Map(recognitionHistory.value.map((item) => [item.jobId, item.status]))
    const result = await listEnterpriseRecognitionTasks(userStore.user, 24)
    const nextList = (Array.isArray(result.list) ? result.list : []).map(normalizeHistoryItem)
    recognitionHistory.value = nextList
    notifyRecognitionChanges(nextList, before)
  } finally {
    historyLoading.value = false
  }
}

function notifyRecognitionChanges(nextList, before) {
  const completed = nextList.filter((item) => {
    const previous = before.get(item.jobId)
    return ['done', 'error'].includes(item.status) && previous && previous !== item.status && !notifiedRecognitionJobs.has(item.jobId)
  })
  if (!completed.length) return

  completed.forEach((item) => notifiedRecognitionJobs.add(item.jobId))
  const done = completed.filter((item) => item.status === 'done').length
  const failed = completed.filter((item) => item.status === 'error').length
  const message = `后台识别完成：${done} 个成功，${failed} 个失败`
  ElMessage.info(message)

  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification('压力表识别任务', { body: message })
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          new Notification('压力表识别任务', { body: message })
        }
      })
    }
  }
}

function resumeHistoryTask(item) {
  const existing = taskQueue.value.find((task) => task.serverJobId === item.jobId)
  if (existing) {
    existing.expanded = true
    return
  }

  const { task, processMessage } = buildTaskFromServerJob(item)
  task.monitorToken = `resume_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
  void monitorRecognitionTask(task, processMessage, task.monitorToken, {
    name: item.name,
    fileType: item.fileType,
    previewUrl: ''
  })
}

function restoreDraftFromHistory(item) {
  const draft = buildDraftFromRecognitionJob(item, {
    name: item.name,
    fileType: item.fileType,
    previewUrl: ''
  })
  draft.showRawText = true
  ElMessage.success(`已恢复 ${draft.name} 的草稿`)
}

async function retryHistoryTask(item, mode = 'full') {
  historyRetryingId.value = item.jobId
  try {
    const job = await retryEnterpriseRecognitionTask(userStore.user, item.jobId, mode)
    await refreshRecognitionHistory()

    const existing = taskQueue.value.find((task) => task.serverJobId === item.jobId)
    if (existing) {
      existing.monitorToken = `retry_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
      existing.expanded = true
      const processMessage = getTaskProcessMessage(existing)
      resetTaskForRetry(existing, processMessage)
      syncTaskToProcess(existing, processMessage)
      void monitorRecognitionTask(existing, processMessage, existing.monitorToken, {
        name: existing.name,
        fileType: existing.fileType,
        previewUrl: existing.previewUrl || ''
      })
      ElMessage.success(job.summary || '识别任务已重新加入后台队列')
      return
    }

    resumeHistoryTask(normalizeHistoryItem(job))
    if (selectedHistoryTask.value?.jobId === item.jobId) {
      selectedHistoryTask.value = normalizeHistoryItem(job)
    }
    ElMessage.success(job.summary || '识别任务已重新加入后台队列')
  } finally {
    historyRetryingId.value = ''
  }
}

async function retryAllFailedHistory() {
  const failedIds = recognitionHistory.value
    .filter((item) => item.status === 'error')
    .map((item) => item.jobId)
  if (!failedIds.length) return

  historyBatchRetrying.value = true
  try {
    const result = await batchRetryEnterpriseRecognitionTasks(userStore.user, failedIds, 'full')
    await refreshRecognitionHistory()
    recognitionHistory.value
      .filter((item) => failedIds.includes(item.jobId))
      .forEach((item) => resumeHistoryTask(item))
    ElMessage.success(`已重试 ${result.successCount || 0} 个失败任务`)
  } catch (error) {
    ElMessage.error(error?.message || '批量重试失败')
  } finally {
    historyBatchRetrying.value = false
  }
}

async function removeHistoryTask(item) {
  historyDeletingId.value = item.jobId
  try {
    await deleteEnterpriseRecognitionTask(userStore.user, item.jobId)
    recognitionHistory.value = recognitionHistory.value.filter((history) => history.jobId !== item.jobId)
    taskQueue.value = taskQueue.value.filter((task) => {
      if (task.serverJobId === item.jobId) {
        task.monitorToken = ''
        return false
      }
      return true
    })
    drafts.value = drafts.value.filter((draft) => draft.jobId !== item.jobId)
    ElMessage.success('历史任务已删除')
  } finally {
    historyDeletingId.value = ''
  }
}

async function clearCompletedHistory() {
  historyClearing.value = true
  try {
    const result = await clearCompletedRecognitionTasks(userStore.user)
    const doneIds = new Set(
      recognitionHistory.value
        .filter((item) => item.status === 'done')
        .map((item) => item.jobId)
    )
    recognitionHistory.value = recognitionHistory.value.filter((item) => item.status !== 'done')
    taskQueue.value = taskQueue.value.filter((task) => {
      if (doneIds.has(task.serverJobId)) {
        task.monitorToken = ''
        return false
      }
      return true
    })
    drafts.value = drafts.value.filter((draft) => !doneIds.has(draft.jobId))
    ElMessage.success(`已清理 ${Number(result.count || 0)} 个已完成任务`)
  } finally {
    historyClearing.value = false
  }
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
  return limitOcrProcessing(async () => {
    return runProcessorWorker('process-image', {
      file,
      baseUrl: '',
      token: '',
      compressOptions: {
        maxWidth: 1400,
        maxHeight: 1400,
        quality: 0.74,
        passThroughMaxBytes: 900 * 1024
      },
      ocrOptions: {
        retryLimit: OCR_RETRY_LIMIT,
        timeout: OCR_TIMEOUT_MS
      }
    })
  })
}

async function processPdfFirstPageInWorker(file) {
  const result = await runProcessorWorker('process-pdf-first-page', {
    file,
    pdfOptions: {
      scale: 1.2,
      quality: 0.76
    }
  })

  const pageBlob = result.pageBlob
  if (!(pageBlob instanceof Blob)) {
    throw new Error('未解析出有效页面')
  }

  const pageName = String(result.pageName || `${file.name.replace(/\.pdf$/i, '')} 第 1 页`)
  const previewUrl = URL.createObjectURL(pageBlob)
  const imageFile = new File([pageBlob], `${file.name.replace(/\.pdf$/i, '')}_page_1.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now()
  })

  const directText = String(result.pageText || '').trim()
  const imageBase64 = directText.length >= PDF_TEXT_ONLY_MIN_LENGTH ? '' : await blobToBase64(imageFile)

  return {
    file: imageFile,
    previewUrl,
    directText,
    imageBase64,
    sourceSize: imageFile.size,
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
  installPhotoFileID = '',
  installPhotoPreviewUrl = '',
  ocrText = '',
  extractedData = {},
  fieldConfidence = {},
  selectedEquipmentId = '',
  selectedEquipmentName = ''
}) {
  const repairedData = repairExtractedData(extractedData, ocrText)
  return {
    id: `draft_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    name: name || '识别草稿',
    fileType,
    statusText: '识别完成',
    previewUrl,
    fileID,
    installPhotoFileID,
    installPhotoPreviewUrl,
    ocrText,
    extractedData: repairedData,
    fieldConfidence: {
      ...Object.fromEntries(CONFIDENCE_FIELDS.map((field) => [field, inferFieldConfidence({ extractedData: repairedData, ocrText }, field)])),
      ...fieldConfidence
    },
    selectedEquipmentId,
    selectedEquipmentName,
    saved: false,
    saving: false,
    showRawText: false
  }
}

function cloneExtractedData(data = {}) {
  return JSON.parse(JSON.stringify(data || {}))
}

function createAiParseCacheKey(sourceText) {
  return String(sourceText || '')
    .replace(/\s+/g, ' ')
    .trim()
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

async function parseFieldsWithCache(sourceText, task, processMessage) {
  const cacheKey = createAiParseCacheKey(sourceText)

  if (cacheKey && aiParseCache.has(cacheKey)) {
    activateTaskStep(task, processMessage, 3, '命中解析缓存，正在回填字段')
    return cloneExtractedData(aiParseCache.get(cacheKey))
  }

  if (cacheKey && aiParsePending.has(cacheKey)) {
    activateTaskStep(task, processMessage, 3, '复用同批解析结果')
    return cloneExtractedData(await aiParsePending.get(cacheKey))
  }

  activateTaskStep(task, processMessage, 3, '等待 AI 解析槽位')

  const runner = limitAiParsing(async () => {
    activateTaskStep(task, processMessage, 3, '正在解析字段')
    const aiRes = await callAiWithTimeout({
      action: 'extractRecordFromImage',
      ocrText: sourceText,
      userType: 'enterprise',
      userInfo: userStore.user
    })
    return repairExtractedData(aiRes?.data || {}, sourceText)
  })

  if (cacheKey) {
    aiParsePending.set(cacheKey, runner)
  }

  try {
    const parsed = await runner
    if (cacheKey) {
      aiParseCache.set(cacheKey, cloneExtractedData(parsed))
    }
    return cloneExtractedData(parsed)
  } finally {
    if (cacheKey) {
      aiParsePending.delete(cacheKey)
    }
  }
}

async function sendQuestion(textOverride = '') {
  const text = String(textOverride || question.value).trim()
  if (!text || asking.value) return

  addMessage('user', text)
  if (!textOverride) {
    question.value = ''
  }
  asking.value = true
  const typingMessage = createTypingMessage()

  try {
    const result = await callAiFunction({
      question: text,
      userType: 'enterprise',
      userInfo: userStore.user,
      conversationContext: buildConversationContext()
    })
    updateLatestUserMessageStatus('已读')
    removeMessageById(typingMessage.id)
    await streamAssistantMessage(result.answer || '未获得 AI 回复。')
  } catch (error) {
    updateLatestUserMessageStatus('已读')
    removeMessageById(typingMessage.id)
    addMessage('assistant', `AI 调用失败：${error.message || '未知错误'}`)
  } finally {
    asking.value = false
  }
}

async function monitorRecognitionTask(task, processMessage, monitorToken, meta = {}) {
  while (task.monitorToken === monitorToken) {
    const status = await getEnterpriseRecognitionTask(userStore.user, task.serverJobId)
    task.serverJobId = status.jobId || task.serverJobId

    if (status.status === 'queued') {
      activateTaskStep(task, processMessage, 2, status.summary || '已进入后台队列')
    } else if (status.status === 'processing') {
      if (status.stage === 'ocr') {
        activateTaskStep(task, processMessage, 2, status.summary || '后台正在识别文本')
      } else if (status.stage === 'ai') {
        completeTaskStep(task, processMessage, 2, '文本提取完成')
        activateTaskStep(task, processMessage, 3, status.summary || '后台正在解析字段')
      }
    } else if (status.status === 'done') {
      completeTaskStep(task, processMessage, 2, '文本提取完成')
      completeTaskStep(task, processMessage, 3, '字段解析完成')
      activateTaskStep(task, processMessage, 4, '正在生成可编辑草稿')
      const previewUrl = meta.previewUrl || task.previewUrl || ''
      const draft = buildDraftFromRecognitionJob(status, {
        name: meta.name || task.name,
        fileType: meta.fileType || 'image',
        previewUrl
      })
      finishTask(task, processMessage, '处理完成，可确认字段后保存')
      addMessage('assistant', `已完成 ${draft.name} 的识别，请确认字段后保存到共享台账。`)
      await refreshRecognitionHistory()
      return
    } else if (status.status === 'error') {
      const failedStepIndex = status.stage === 'ai' ? 3 : 2
      failTaskStep(task, processMessage, failedStepIndex, status.error || status.summary || '后台识别失败')
      task.expanded = true
      addMessage('assistant', `${task.name} 处理失败：${status.error || status.summary || '后台识别失败'}`)
      await refreshRecognitionHistory()
      return
    }

    await sleep(BACKGROUND_POLL_INTERVAL_MS)
  }
}

async function submitRecognitionTaskInBackground(file, meta = {}) {
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
  task.previewUrl = meta.previewUrl || URL.createObjectURL(file)
  completeTaskStep(task, processMessage, 0, '文件已接收')

  let workingFile = file
  let sourceText = String(meta.directText || '').trim()
  let imageBase64 = String(meta.imageBase64 || '').trim()
  let imageHash = String(meta.imageHash || '').trim()
  let sourceSize = Number(meta.sourceSize || file.size || 0)

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
    imageBase64 = String(processed.imageBase64 || '').trim()
    imageHash = String(processed.imageHash || '').trim()
    sourceSize = Number(processed.sourceSize || workingFile.size || sourceSize)
    completeTaskStep(task, processMessage, 1, processed.compressReason || '图片压缩完成')
  }

  if (!imageBase64 && !sourceText) {
    imageBase64 = await blobToBase64(workingFile)
    sourceSize = workingFile.size || sourceSize
  }

  activateTaskStep(
    task,
    processMessage,
    2,
    sourceText && !imageBase64 ? '已提取 PDF 文本，正在提交后台解析' : '正在提交后台识别任务'
  )
  const submitted = await submitEnterpriseRecognitionTask(userStore.user, {
    name: meta.name || file.name,
    fileType: meta.fileType || 'image',
    imageBase64,
    ocrText: sourceText,
    imageHash,
    sourceSize
  })

  task.serverJobId = submitted.jobId
  task.monitorToken = `monitor_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
  activateTaskStep(task, processMessage, 2, submitted.summary || '已进入后台队列')
  await refreshRecognitionHistory()

  void monitorRecognitionTask(task, processMessage, task.monitorToken, {
    name: meta.name || file.name,
    fileType: meta.fileType || 'image',
    previewUrl: task.previewUrl
  })
}

function buildTaskFromServerJob(job) {
  const task = createTask(job.name || '识别任务', getTaskStepLabels(job.fileType || 'image'), {
    fileType: job.fileType || 'image',
    initialStatus:
      job.status === 'processing' ? 'active' : job.status === 'error' ? 'error' : job.status === 'done' ? 'done' : 'pending',
    attempts: job.attempts || 1
  })

  task.serverJobId = job.jobId
  task.progress = Number(job.progress || 0)
  task.summary = job.summary || '已恢复后台任务'
  task.status = job.status === 'processing' ? 'active' : job.status
  const statusMeta = getTaskStatusMeta(task.status)
  task.statusLabel = statusMeta.label
  task.statusTagType = statusMeta.tagType
  task.lastError = job.error || ''
  task.expanded = task.status !== 'done'

  if (task.steps[0]) task.steps[0].status = 'done'
  if (job.fileType === 'pdf' || job.fileType === 'image') {
    if (task.steps[1]) task.steps[1].status = 'done'
  }
  if (job.stage === 'queued') {
    if (task.steps[2]) task.steps[2].status = 'active'
  } else if (job.stage === 'ocr') {
    if (task.steps[2]) task.steps[2].status = 'active'
  } else if (job.stage === 'ai') {
    if (task.steps[2]) task.steps[2].status = 'done'
    if (task.steps[3]) task.steps[3].status = 'active'
  } else if (job.stage === 'done') {
    task.steps.forEach((step) => {
      step.status = 'done'
    })
  } else if (job.stage === 'error') {
    const failedIndex = task.steps[3] && (job.summary || '').includes('解析') ? 3 : 2
    task.steps.forEach((step, index) => {
      step.status = index < failedIndex ? 'done' : index === failedIndex ? 'error' : 'pending'
    })
  }

  const processMessage = createProcessMessage(task)
  syncTaskToProcess(task, processMessage)
  return { task, processMessage }
}

async function restoreRecognitionTasks() {
  await refreshRecognitionHistory()
  const jobs = recognitionHistory.value

  for (const job of jobs.reverse()) {
    if (taskQueue.value.some((item) => item.serverJobId === job.jobId)) continue

    const { task, processMessage } = buildTaskFromServerJob(job)
    if (job.status === 'done' && job.result) {
      buildDraftFromRecognitionJob(job, {
        name: job.name,
        fileType: job.fileType,
        previewUrl: task.previewUrl || ''
      })
      finishTask(task, processMessage, '已从后台恢复识别结果')
      continue
    }

    if (job.status === 'queued' || job.status === 'processing') {
      task.monitorToken = `restore_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
      void monitorRecognitionTask(task, processMessage, task.monitorToken, {
        name: job.name,
        fileType: job.fileType,
        previewUrl: ''
      })
    }
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

  const extractedData = await parseFieldsWithCache(sourceText, task, processMessage)
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
          await submitRecognitionTaskInBackground(firstPage.file, {
            name: firstPage.name,
            fileType: 'pdf',
            previewUrl: firstPage.previewUrl,
            directText: firstPage.directText,
            imageBase64: firstPage.imageBase64,
            sourceSize: firstPage.sourceSize,
            task,
            processMessage
          })
        } else {
          await submitRecognitionTaskInBackground(file, {
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
  if (isDrainingUploadBatches) return

  isDrainingUploadBatches = true
  try {
    while (pendingUploadBatches.length) {
      const currentBatch = pendingUploadBatches.shift()
      addMessage(
        'assistant',
        `${currentBatch.label} 已转入后台处理，共 ${currentBatch.entries.length} 个文件。你可以继续提问或继续上传其他文件。`
      )
      await runTaskQueue(currentBatch.entries, MAX_CONCURRENT_TASKS)
      addMessage('assistant', `${currentBatch.label} 已全部提交到后台识别。`)
    }
  } finally {
    isDrainingUploadBatches = false
    if (pendingUploadBatches.length) {
      void drainUploadBatches()
    }
  }
}

async function handleFileChange(event) {
  const files = Array.from(event.target.files || [])
  if (!files.length) return

  try {
    uploading.value = true
    const batches = chunkFiles(files, UPLOAD_BATCH_SIZE)
    addMessage(
      'assistant',
      batches.length > 1
        ? `已加入 ${files.length} 个文件，系统会分成 ${batches.length} 批在后台处理。`
        : `已加入 ${files.length} 个文件，已转入后台处理。`
    )

    batches.forEach((batchFiles, index) => {
      const batchLabel = batches.length > 1 ? `第 ${index + 1} 批` : '本批次'
      pendingUploadBatches.push({
        label: batchLabel,
        entries: createTaskEntries(batchFiles, batchLabel)
      })
    })

    void drainUploadBatches()
  } finally {
    uploading.value = false
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

function scrollDraftIntoView(draftId) {
  hideConflictDesk.value = true
  nextTick(() => {
    const el = document.querySelector(`[data-draft-id="${draftId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

async function handleInstallPhotoChange(uploadFile, draft) {
  const file = uploadFile?.raw || uploadFile
  if (!file) return
  try {
    const dataUrl = await fileToCompactDataUrl(file, 960, 0.68)
    draft.installPhotoFileID = dataUrl
    draft.installPhotoPreviewUrl = dataUrl
    hideConflictDesk.value = false
    ElMessage.success('现场照片已压缩并暂存')
  } catch (error) {
    ElMessage.error(error.message || '现场照片处理失败')
  }
}

function fileToCompactDataUrl(file, maxWidth = 960, quality = 0.68) {
  return new Promise((resolve, reject) => {
    if (!file.type?.startsWith('image/')) {
      reject(new Error('请上传图片格式的现场照片'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('现场照片读取失败'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('现场照片解析失败'))
      img.onload = () => {
        const scale = Math.min(1, maxWidth / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = String(reader.result || '')
    }
    reader.readAsDataURL(file)
  })
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
  if (!draft.installPhotoFileID) {
    throw new Error('请上传安装位置/现场照片')
  }
}

async function checkDuplicateDraftRecord(draft) {
  const certNo = String(draft.extractedData.certNo || '').trim()
  const factoryNo = String(draft.extractedData.factoryNo || '').trim()
  if (!certNo && !factoryNo) return true

  const checks = []
  if (certNo) checks.push(getEnterpriseRecords(userStore.user, { keyword: certNo }))
  if (factoryNo) checks.push(getEnterpriseRecords(userStore.user, { keyword: factoryNo }))

  const results = await Promise.all(checks)
  const duplicates = results
    .flatMap((result) => result.list || [])
    .filter((item) => {
      if (certNo && item.certNo === certNo) return true
      if (factoryNo && item.factoryNo === factoryNo) return true
      return false
    })

  if (!duplicates.length) return true

  await ElMessageBox.confirm(
    `检测到可能重复的台账记录 ${duplicates.length} 条。重复证书或出厂编号可能会造成台账重复，是否仍然保存？`,
    '重复记录提醒',
    { type: 'warning', confirmButtonText: '仍然保存', cancelButtonText: '返回检查' }
  )
  return true
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
    await checkDuplicateDraftRecord(draft)
    const result = await saveEnterpriseAiRecord(userStore.user, {
      extractedData: draft.extractedData,
      equipmentId: draft.selectedEquipmentId,
      installLocation: draft.extractedData.installLocation,
      fileID: draft.fileID,
      installPhotoFileID: draft.installPhotoFileID,
      fieldConfidence: draft.fieldConfidence
    })
    draft.saved = true
    draft.statusText = `已保存，记录 ${result.recordId}`
    addMessage('assistant', `已保存 ${draft.name}，并同步写入共享台账。`)
    ElMessage.success('已保存到共享台账')
    await loadEquipments()
  } catch (error) {
    if (error === 'cancel' || error?.message === 'cancel') return
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
  await restoreRecognitionTasks()
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

.quick-prompt-panel {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.quick-prompt-card {
  display: grid;
  gap: 8px;
  border: 1px solid rgba(30, 94, 255, 0.14);
  border-radius: 20px;
  padding: 16px 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(243, 247, 255, 0.96) 100%);
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.05);
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    border-color: rgba(30, 94, 255, 0.3);
    box-shadow: 0 18px 36px rgba(30, 94, 255, 0.12);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.72;
  }
}

.quick-prompt-kicker {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #2563eb;
}

.quick-prompt-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
}

.quick-prompt-copy {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-sub);
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
  width: 100%;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 14px;

  &.assistant {
    justify-content: flex-start;
  }

  &.user {
    flex-direction: row-reverse;
    justify-content: flex-start;
  }
}

.message-avatar {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.12);

  &.assistant {
    background:
      radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.78) 0 16%, transparent 17%),
      linear-gradient(135deg, rgba(15, 23, 42, 0.96) 0%, rgba(30, 94, 255, 0.94) 100%);
    color: #fff;
  }

  &.user {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.95) 0%, rgba(14, 165, 233, 0.9) 100%);
    color: #fff;
  }
}

.avatar-glyph {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.avatar-svg {
  width: 28px;
  height: 28px;
  display: block;
}

.message-stack {
  max-width: 82%;
  display: grid;
  gap: 6px;

  .user & {
    justify-items: end;
    text-align: right;
  }
}

.message-identity {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px;

  .user & {
    justify-content: flex-end;
  }
}

.message-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-sub);
}

.message-badge {
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
  color: rgba(22, 163, 74, 0.96);
  background: rgba(220, 252, 231, 0.92);
  border: 1px solid rgba(34, 197, 94, 0.18);
}

.message-bubble {
  border-radius: 24px;
  padding: 14px 16px;
  background: rgba(241, 245, 249, 0.9);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.06);
  width: fit-content;
  max-width: 100%;

  .assistant & {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.94) 0%, rgba(243, 247, 255, 0.94) 100%);
    border-top-left-radius: 10px;
    border: 1px solid rgba(30, 94, 255, 0.08);
  }

  .user & {
    background: linear-gradient(135deg, rgba(30, 94, 255, 0.92) 0%, rgba(63, 140, 255, 0.92) 100%);
    color: #fff;
    border-top-right-radius: 10px;
  }
}

.process-bubble {
  width: min(540px, 100%);
}

.message-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.7;
}

.message-footer {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 0 4px;
  font-size: 11px;
  color: rgba(100, 116, 139, 0.9);

  .user & {
    justify-content: flex-end;
  }
}

.typing-card {
  display: grid;
  gap: 12px;
}

.typing-copy {
  color: var(--text-main);
  line-height: 1.7;
}

.typing-dots {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(30, 94, 255, 0.42);
    animation: typing-bounce 1.2s ease-in-out infinite;
  }

  span:nth-child(2) {
    animation-delay: 0.16s;
  }

  span:nth-child(3) {
    animation-delay: 0.32s;
  }
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

.history-panel {
  margin-bottom: 18px;
  padding: 16px;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(248, 250, 255, 0.96) 0%, rgba(241, 245, 255, 0.96) 100%);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.history-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;

  h4 {
    font-size: 16px;
    color: var(--text-main);
  }

  p {
    margin-top: 6px;
    color: var(--text-sub);
    line-height: 1.6;
    font-size: 13px;
  }
}

.history-tools {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 280px;
  overflow: auto;
  padding-right: 4px;
}

.history-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(148, 163, 184, 0.12);

  &.done {
    border-color: rgba(16, 185, 129, 0.22);
  }

  &.error {
    border-color: rgba(239, 68, 68, 0.2);
  }
}

.history-card-main {
  min-width: 0;
  display: grid;
  gap: 8px;
}

.history-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.history-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}

.history-meta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  color: var(--text-soft);
  font-size: 12px;
}

.history-summary {
  color: var(--text-sub);
  line-height: 1.6;
  font-size: 13px;
}

.history-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.history-empty {
  border-radius: 18px;
  padding: 18px 16px;
  text-align: center;
  color: var(--text-sub);
  background: rgba(255, 255, 255, 0.7);
}

.job-detail-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 18px;

  h4 {
    color: var(--text-main);
    font-size: 18px;
  }

  p {
    margin-top: 6px;
    color: var(--text-sub);
  }
}

.job-section-title {
  margin: 18px 0 10px;
  color: var(--text-main);
  font-size: 16px;
}

.job-raw-text {
  margin: 0;
  padding: 14px;
  max-height: 240px;
  overflow: auto;
  border-radius: 16px;
  background: rgba(241, 245, 249, 0.9);
  color: var(--text-sub);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.job-detail-actions {
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.draft-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: auto;
  padding-right: 4px;
}

.conflict-desk {
  margin-bottom: 16px;
  padding: 16px;
  border: 1px solid rgba(245, 158, 11, 0.26);
  border-radius: 22px;
  background: linear-gradient(135deg, rgba(255, 251, 235, 0.96), rgba(255, 247, 237, 0.82));
}

.conflict-head,
.conflict-actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.conflict-head h4 {
  color: var(--text-main);
  font-size: 16px;
}

.conflict-head p {
  margin-top: 4px;
  color: var(--text-sub);
  font-size: 13px;
}

.conflict-actions {
  align-items: center;
}

.conflict-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.conflict-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  color: var(--text-sub);
  font-size: 13px;
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

.confidence-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-top: 8px;
  color: var(--text-soft);
  font-size: 12px;
}

.draft-body {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 18px;
}

.draft-form:only-child {
  grid-column: 1 / -1;
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
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0 16px;
}

.draft-form {
  min-width: 0;
}

.draft-form :deep(.el-input),
.draft-form :deep(.el-select) {
  width: 100%;
}

.draft-form :deep(.el-input__wrapper),
.draft-form :deep(.el-select__wrapper) {
  min-height: 40px;
}

.draft-form :deep(.el-input__inner),
.draft-form :deep(.el-select__selected-item) {
  min-width: 0;
}

.equipment-item {
  grid-column: 1 / -1;
}

.confidence-badge {
  display: inline-flex;
  margin-top: 6px;
  font-size: 12px;
  color: #64748b;
}

.draft-form :deep(.confidence-low .el-input__wrapper),
.draft-form :deep(.confidence-low .el-select__wrapper) {
  box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.44) inset;
  background: rgba(254, 242, 242, 0.88);
}

.draft-form :deep(.confidence-low .confidence-badge) {
  color: #dc2626;
}

.draft-form :deep(.confidence-medium .confidence-badge) {
  color: #d97706;
}

.site-photo-box {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.site-photo-box img,
.site-photo-empty {
  width: 120px;
  height: 86px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  object-fit: cover;
}

.site-photo-empty {
  display: grid;
  place-items: center;
  color: var(--text-soft);
  background: rgba(241, 245, 249, 0.82);
  font-size: 12px;
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

  .quick-prompt-panel {
    grid-template-columns: 1fr;
  }

  .history-head,
  .history-card {
    flex-direction: column;
  }

  .history-actions {
    align-self: flex-start;
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

@keyframes typing-bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.38;
  }

  40% {
    transform: translateY(-4px);
    opacity: 1;
  }
}
</style>

