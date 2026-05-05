const crypto = require('crypto')
const { query, one, exec } = require('../lib/db')
const { runOcr } = require('./ocrService')
const { extractRecordFromText } = require('./aiService')

const MAX_ACTIVE_JOBS = Number(process.env.AI_JOB_CONCURRENCY || 2)
const MAX_BOOTSTRAP_JOBS = Number(process.env.AI_JOB_BOOTSTRAP_LIMIT || 80)
const MAX_LIST_JOBS = 60

const jobs = new Map()
const pendingJobIds = []
let activeJobs = 0
let bootstrapped = false
let bootstrapPromise = null

function createJobId() {
  return `aiq_${crypto.randomUUID()}`
}

function createImageHash(imageBase64 = '') {
  const source = String(imageBase64 || '').trim()
  if (!source) return ''
  return crypto.createHash('sha256').update(source).digest('hex')
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function assertEnterpriseSession(session) {
  if (!session || session.userType !== 'enterprise') {
    const error = new Error('需要企业端登录状态')
    error.statusCode = 401
    throw error
  }
}

function safeParseJson(value) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function serializeJob(job) {
  return {
    id: job.id,
    ownerId: job.ownerId,
    enterpriseName: job.enterpriseName || '',
    name: job.name || '',
    fileType: job.fileType || 'image',
    imageHash: job.imageHash || '',
    sourceSize: Number(job.sourceSize || 0),
    imageBase64: job.imageBase64 || '',
    ocrText: job.ocrText || '',
    status: job.status || 'queued',
    stage: job.stage || 'queued',
    progress: Number(job.progress || 0),
    summary: job.summary || '',
    attempts: Number(job.attempts || 0),
    error: job.error || '',
    durationMs: Number(job.durationMs || 0),
    resultJson: JSON.stringify(job.result || null),
    createdAt: Number(job.createdAt || Date.now()),
    updatedAt: Number(job.updatedAt || Date.now())
  }
}

function hydrateJob(row) {
  return {
    id: row.id,
    ownerId: row.ownerId || '',
    enterpriseName: row.enterpriseName || '',
    name: row.name || '',
    fileType: row.fileType || 'image',
    imageHash: row.imageHash || '',
    sourceSize: Number(row.sourceSize || 0),
    imageBase64: row.imageBase64 || '',
    ocrText: row.ocrText || '',
    status: row.status || 'queued',
    stage: row.stage || 'queued',
    progress: Number(row.progress || 0),
    summary: row.summary || '',
    attempts: Number(row.attempts || 0),
    error: row.error || '',
    durationMs: Number(row.durationMs || 0),
    result: safeParseJson(row.resultJson),
    createdAt: Number(row.createdAt || Date.now()),
    updatedAt: Number(row.updatedAt || Date.now())
  }
}

function formatJobResponse(job) {
  return {
    jobId: job.id,
    name: job.name,
    fileType: job.fileType,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    summary: job.summary,
    attempts: job.attempts,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    durationMs: Number(job.durationMs || 0),
    sourceSize: Number(job.sourceSize || 0),
    imageStored: !!job.imageBase64,
    error: job.error || '',
    result: job.result ? clone(job.result) : null
  }
}

async function persistJob(job) {
  const payload = serializeJob(job)
  const existing = await one('SELECT id FROM ai_recognition_jobs WHERE id = :id LIMIT 1', {
    id: payload.id
  })

  if (existing) {
    await exec(
      `UPDATE ai_recognition_jobs SET
        ownerId = :ownerId,
        enterpriseName = :enterpriseName,
        name = :name,
        fileType = :fileType,
        imageHash = :imageHash,
        sourceSize = :sourceSize,
        imageBase64 = :imageBase64,
        ocrText = :ocrText,
        status = :status,
        stage = :stage,
        progress = :progress,
        summary = :summary,
        attempts = :attempts,
        error = :error,
        durationMs = :durationMs,
        resultJson = :resultJson,
        createdAt = :createdAt,
        updatedAt = :updatedAt
       WHERE id = :id`,
      payload
    )
    return
  }

  await exec(
    `INSERT INTO ai_recognition_jobs (
      id, ownerId, enterpriseName, name, fileType, imageHash, sourceSize,
      imageBase64, ocrText, status, stage, progress, summary, attempts,
      error, durationMs, resultJson, createdAt, updatedAt
    ) VALUES (
      :id, :ownerId, :enterpriseName, :name, :fileType, :imageHash, :sourceSize,
      :imageBase64, :ocrText, :status, :stage, :progress, :summary, :attempts,
      :error, :durationMs, :resultJson, :createdAt, :updatedAt
    )`,
    payload
  )
}

async function upsertJob(job) {
  jobs.set(job.id, job)
  await persistJob(job)
  return job
}

async function updateJob(jobId, patch = {}) {
  const current = jobs.get(jobId)
  if (!current) return null
  const next = {
    ...current,
    ...patch,
    updatedAt: Date.now()
  }
  await upsertJob(next)
  return next
}

async function findCachedOcrText(ownerId, imageHash, currentJobId = '') {
  if (!ownerId || !imageHash) return ''

  for (const job of jobs.values()) {
    if (
      job.id !== currentJobId &&
      job.ownerId === ownerId &&
      job.imageHash === imageHash &&
      String(job.ocrText || job.result?.ocrText || '').trim()
    ) {
      return String(job.ocrText || job.result?.ocrText || '').trim()
    }
  }

  const row = await one(
    `SELECT ocrText, resultJson FROM ai_recognition_jobs
     WHERE ownerId = :ownerId
       AND imageHash = :imageHash
       AND id <> :currentJobId
       AND (ocrText <> '' OR resultJson <> '')
     ORDER BY updatedAt DESC
     LIMIT 1`,
    { ownerId, imageHash, currentJobId }
  )

  if (!row) return ''
  const parsed = safeParseJson(row.resultJson)
  return String(row.ocrText || parsed?.ocrText || '').trim()
}

async function ensureQueueBootstrapped() {
  if (bootstrapped) return
  if (bootstrapPromise) {
    await bootstrapPromise
    return
  }

  bootstrapPromise = (async () => {
    const rows = await query(
      `SELECT * FROM ai_recognition_jobs
       WHERE status IN ('queued', 'processing', 'error', 'done')
       ORDER BY updatedAt DESC
       LIMIT :limit`,
      { limit: MAX_BOOTSTRAP_JOBS }
    )

    rows.forEach((row) => {
      const job = hydrateJob(row)
      if (job.status === 'processing') {
        job.status = 'queued'
        job.stage = 'queued'
        job.summary = '服务重启后已恢复到后台队列'
        job.progress = Math.min(Number(job.progress || 12), 20)
      }
      jobs.set(job.id, job)
      if (job.status === 'queued' && !pendingJobIds.includes(job.id)) {
        pendingJobIds.push(job.id)
      }
    })

    bootstrapped = true
    bootstrapPromise = null
    scheduleQueueDrain()
  })()

  await bootstrapPromise
}

async function processJob(jobId) {
  const job = jobs.get(jobId)
  if (!job) return
  const startedAt = Date.now()

  await updateJob(jobId, {
    status: 'processing',
    stage: 'ocr',
    summary: job.ocrText ? '正在整理页面文本' : '后台正在识别文本',
    progress: job.ocrText ? 45 : 30,
    attempts: Number(job.attempts || 0) + 1
  })

  try {
    let ocrText = String(job.ocrText || '').trim()

    if (!ocrText && job.imageHash) {
      ocrText = await findCachedOcrText(job.ownerId, job.imageHash, job.id)
      if (ocrText) {
        await updateJob(jobId, {
          ocrText,
          imageBase64: '',
          stage: 'ocr',
          summary: '命中历史 OCR 缓存，跳过重复识别',
          progress: 58
        })
      }
    }

    if ((!ocrText || ocrText.length < 24) && job.imageBase64) {
      const ocrRes = await runOcr({
        imageBase64: String(job.imageBase64 || '').trim()
      })
      ocrText = String(ocrRes.text || '').trim()
      await updateJob(jobId, {
        ocrText,
        imageBase64: '',
        stage: 'ocr',
        summary: `文本提取完成，使用 ${ocrRes.apiUsed || 'OCR'}，等待解析字段`,
        progress: 60
      })
    }

    if (!ocrText) {
      throw new Error('未提取到可解析文本')
    }

    await updateJob(jobId, {
      stage: 'ai',
      summary: '后台正在解析字段',
      progress: 75
    })

    const extractedData = await extractRecordFromText(ocrText, {
      requestId: jobId
    })

    await updateJob(jobId, {
      status: 'done',
      stage: 'done',
      summary: '后台识别完成',
      progress: 100,
      durationMs: Date.now() - startedAt,
      imageBase64: '',
      result: {
        ocrText,
        extractedData
      },
      error: ''
    })
  } catch (error) {
    await updateJob(jobId, {
      status: 'error',
      stage: 'error',
      summary: error?.message || '后台识别失败',
      progress: 100,
      durationMs: Date.now() - startedAt,
      // OCR 已经成功后失败，多数是解析失败；清掉图片，保留文本即可重跑解析。
      imageBase64: job.ocrText ? '' : job.imageBase64,
      error: error?.message || '后台识别失败'
    })
  } finally {
    activeJobs = Math.max(0, activeJobs - 1)
    scheduleQueueDrain()
  }
}

function scheduleQueueDrain() {
  while (activeJobs < MAX_ACTIVE_JOBS && pendingJobIds.length) {
    const jobId = pendingJobIds.shift()
    const job = jobs.get(jobId)
    if (!job || job.status !== 'queued') continue
    activeJobs += 1
    setImmediate(() => {
      void processJob(jobId)
    })
  }
}

async function submitEnterpriseRecognitionTask(payload = {}, session) {
  assertEnterpriseSession(session)
  await ensureQueueBootstrapped()

  const name = String(payload.name || '').trim() || '识别任务'
  const fileType = String(payload.fileType || 'image').trim() || 'image'
  const imageBase64 = String(payload.imageBase64 || '').trim()
  const ocrText = String(payload.ocrText || '').trim()
  const imageHash = String(payload.imageHash || '').trim() || createImageHash(imageBase64)
  const sourceSize = Number(payload.sourceSize || Math.ceil(imageBase64.length * 0.75) || 0)

  if (!imageBase64 && !ocrText) {
    throw new Error('imageBase64 或 ocrText 至少提供一个')
  }

  const cachedText = ocrText || await findCachedOcrText(session.sub, imageHash)
  const job = {
    id: createJobId(),
    ownerId: session.sub,
    enterpriseName: session.companyName || '',
    name,
    fileType,
    imageHash,
    sourceSize,
    imageBase64: cachedText ? '' : imageBase64,
    ocrText: cachedText,
    status: 'queued',
    stage: 'queued',
    progress: cachedText ? 30 : 12,
    summary: cachedText ? '已复用历史 OCR 文本，进入后台解析队列' : '已进入后台队列',
    attempts: 0,
    error: '',
    durationMs: 0,
    result: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  await upsertJob(job)
  pendingJobIds.push(job.id)
  scheduleQueueDrain()
  return formatJobResponse(job)
}

async function getEnterpriseRecognitionTask(payload = {}, session) {
  assertEnterpriseSession(session)
  await ensureQueueBootstrapped()

  const jobId = String(payload.jobId || '').trim()
  if (!jobId) throw new Error('jobId is required')

  let job = jobs.get(jobId)
  if (!job) {
    const row = await one('SELECT * FROM ai_recognition_jobs WHERE id = :id LIMIT 1', { id: jobId })
    if (row) {
      job = hydrateJob(row)
      jobs.set(job.id, job)
    }
  }

  if (!job) {
    const error = new Error('识别任务不存在')
    error.statusCode = 404
    throw error
  }

  if (job.ownerId !== session.sub) {
    const error = new Error('无权查看该识别任务')
    error.statusCode = 403
    throw error
  }

  return formatJobResponse(job)
}

async function listEnterpriseRecognitionTasks(payload = {}, session) {
  assertEnterpriseSession(session)
  await ensureQueueBootstrapped()

  const limit = Math.min(Math.max(Number(payload.limit || 20), 1), MAX_LIST_JOBS)
  const rows = await query(
    `SELECT * FROM ai_recognition_jobs
     WHERE ownerId = :ownerId
     ORDER BY updatedAt DESC
     LIMIT :limit`,
    {
      ownerId: session.sub,
      limit
    }
  )

  return {
    list: rows.map((row) => formatJobResponse(hydrateJob(row)))
  }
}

async function deleteEnterpriseRecognitionTask(payload = {}, session) {
  assertEnterpriseSession(session)
  await ensureQueueBootstrapped()

  const jobId = String(payload.jobId || '').trim()
  if (!jobId) throw new Error('jobId is required')

  const row = await one('SELECT id, ownerId FROM ai_recognition_jobs WHERE id = :id LIMIT 1', { id: jobId })
  if (!row) {
    const error = new Error('识别任务不存在')
    error.statusCode = 404
    throw error
  }
  if (row.ownerId !== session.sub) {
    const error = new Error('无权删除该识别任务')
    error.statusCode = 403
    throw error
  }

  jobs.delete(jobId)
  const pendingIndex = pendingJobIds.indexOf(jobId)
  if (pendingIndex >= 0) pendingJobIds.splice(pendingIndex, 1)
  await exec('DELETE FROM ai_recognition_jobs WHERE id = :id', { id: jobId })
  return { success: true, jobId }
}

async function clearCompletedRecognitionTasks(payload = {}, session) {
  assertEnterpriseSession(session)
  await ensureQueueBootstrapped()

  const rows = await query(
    `SELECT id FROM ai_recognition_jobs
     WHERE ownerId = :ownerId AND status = 'done'`,
    { ownerId: session.sub }
  )

  rows.forEach((row) => jobs.delete(row.id))
  await exec(
    `DELETE FROM ai_recognition_jobs
     WHERE ownerId = :ownerId AND status = 'done'`,
    { ownerId: session.sub }
  )

  return { success: true, count: rows.length }
}

async function loadOwnedJob(jobId, session) {
  let job = jobs.get(jobId)
  if (!job) {
    const row = await one('SELECT * FROM ai_recognition_jobs WHERE id = :id LIMIT 1', { id: jobId })
    if (row) {
      job = hydrateJob(row)
      jobs.set(job.id, job)
    }
  }

  if (!job) {
    const error = new Error('识别任务不存在')
    error.statusCode = 404
    throw error
  }
  if (job.ownerId !== session.sub) {
    const error = new Error('无权重试该识别任务')
    error.statusCode = 403
    throw error
  }
  return job
}

async function retryEnterpriseRecognitionTask(payload = {}, session) {
  assertEnterpriseSession(session)
  await ensureQueueBootstrapped()

  const jobId = String(payload.jobId || '').trim()
  if (!jobId) throw new Error('jobId is required')

  const job = await loadOwnedJob(jobId, session)
  if (job.status === 'processing' || job.status === 'queued') {
    return formatJobResponse(job)
  }

  const retryMode = String(payload.mode || 'full').trim()
  if (retryMode === 'ocr') {
    if (!job.imageBase64) {
      throw new Error('该任务没有保留原始图片，无法重新 OCR；可选择重新解析字段或重新上传文件')
    }
    job.ocrText = ''
    job.result = null
    job.summary = '已加入重新 OCR 队列'
  } else if (retryMode === 'parse') {
    const text = String(job.ocrText || job.result?.ocrText || '').trim()
    if (!text) {
      throw new Error('该任务没有 OCR 原文，无法只重新解析字段')
    }
    job.ocrText = text
    job.imageBase64 = ''
    job.result = null
    job.summary = '已加入重新解析字段队列'
  } else {
    if (job.imageBase64) job.ocrText = ''
    job.result = null
    job.summary = job.imageBase64 ? '已重新加入完整识别队列' : '原图已清理，已基于 OCR 原文重新解析'
  }

  job.status = 'queued'
  job.stage = 'queued'
  job.progress = 12
  job.error = ''
  job.durationMs = 0
  job.updatedAt = Date.now()

  await upsertJob(job)
  if (!pendingJobIds.includes(job.id)) pendingJobIds.push(job.id)
  scheduleQueueDrain()
  return formatJobResponse(job)
}

async function batchRetryEnterpriseRecognitionTasks(payload = {}, session) {
  assertEnterpriseSession(session)
  await ensureQueueBootstrapped()

  const mode = String(payload.mode || 'full').trim()
  const explicitIds = Array.isArray(payload.jobIds)
    ? payload.jobIds.map((item) => String(item).trim()).filter(Boolean)
    : []
  const targetIds = explicitIds.length
    ? explicitIds
    : (await query(
        `SELECT id FROM ai_recognition_jobs
         WHERE ownerId = :ownerId AND status = 'error'
         ORDER BY updatedAt DESC
         LIMIT 50`,
        { ownerId: session.sub }
      )).map((row) => row.id)

  const results = []
  for (const jobId of targetIds) {
    try {
      const job = await retryEnterpriseRecognitionTask({ jobId, mode }, session)
      results.push({ jobId, success: true, job })
    } catch (error) {
      results.push({ jobId, success: false, error: error?.message || '重试失败' })
    }
  }

  return {
    success: true,
    total: results.length,
    successCount: results.filter((item) => item.success).length,
    failedCount: results.filter((item) => !item.success).length,
    list: results
  }
}

module.exports = {
  submitEnterpriseRecognitionTask,
  getEnterpriseRecognitionTask,
  listEnterpriseRecognitionTasks,
  deleteEnterpriseRecognitionTask,
  clearCompletedRecognitionTasks,
  retryEnterpriseRecognitionTask,
  batchRetryEnterpriseRecognitionTasks
}
