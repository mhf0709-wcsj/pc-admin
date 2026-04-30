const express = require('express')
const cors = require('cors')
const config = require('./config')
const { readSessionFromRequest } = require('./lib/auth')
const { handleAdminAction } = require('./services/adminService')
const { handleAiPayload } = require('./services/aiService')
const { runOcr } = require('./services/ocrService')

const OPEN_ADMIN_ACTIONS = new Set([
  'login',
  'enterpriseLogin',
  'enterpriseRegister'
])

const app = express()

app.use(cors({
  origin(origin, callback) {
    if (!origin || !config.corsOrigins.length || config.corsOrigins.includes(origin)) {
      callback(null, true)
      return
    }
    callback(new Error(`Origin not allowed: ${origin}`))
  }
}))

app.use(express.json({ limit: '20mb' }))
app.use(express.urlencoded({ extended: true, limit: '20mb' }))

function requireSession(req) {
  const session = readSessionFromRequest(req)
  if (!session) {
    const error = new Error('Unauthorized')
    error.statusCode = 401
    throw error
  }
  return session
}

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'pc-admin server ok'
  })
})

app.post('/api/admin/call', async (req, res, next) => {
  try {
    const action = String(req.body?.action || '').trim()
    const payload = req.body?.payload || {}
    const session = OPEN_ADMIN_ACTIONS.has(action) ? null : requireSession(req)
    const data = await handleAdminAction(action, payload, session)
    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
})

app.post('/api/ai/call', async (req, res, next) => {
  try {
    const session = requireSession(req)
    const result = await handleAiPayload(req.body || {}, session)
    res.json(result)
  } catch (error) {
    next(error)
  }
})

app.post('/api/ocr/call', async (req, res, next) => {
  try {
    requireSession(req)
    const result = await runOcr(req.body || {})
    res.json(result)
  } catch (error) {
    next(error)
  }
})

app.use((error, req, res, next) => {
  const statusCode = Number(error.statusCode || 400)
  const payload = {
    success: false,
    message: error.message || 'Server error'
  }

  if (req.path.includes('/api/ai/') || req.path.endsWith('/api/ai/call')) {
    payload.error = payload.message
  }

  if (req.path.includes('/api/ocr/') || req.path.endsWith('/api/ocr/call')) {
    payload.error = payload.message
  }

  res.status(statusCode).json(payload)
})

app.listen(config.port, () => {
  console.log(`pc-admin server listening on :${config.port}`)
})
