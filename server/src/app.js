const express = require('express')
const cors = require('cors')
const config = require('./config')
const { handleAdminAction } = require('./services/adminService')
const { handleAiPayload } = require('./services/aiService')
const { runOcr } = require('./services/ocrService')

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

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'pc-admin server ok' })
})

app.post('/api/admin/call', async (req, res) => {
  try {
    const action = req.body?.action
    const payload = req.body?.payload || {}
    const data = await handleAdminAction(action, payload)
    res.json({ success: true, data })
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Admin API failed' })
  }
})

app.post('/api/ai/call', async (req, res) => {
  try {
    const result = await handleAiPayload(req.body || {})
    res.json(result)
  } catch (error) {
    res.status(400).json({ success: false, error: error.message || 'AI API failed' })
  }
})

app.post('/api/ocr/call', async (req, res) => {
  try {
    const result = await runOcr(req.body || {})
    res.json(result)
  } catch (error) {
    res.status(400).json({ success: false, error: error.message || 'OCR API failed' })
  }
})

app.use((error, req, res, next) => {
  res.status(500).json({
    success: false,
    message: error.message || 'Server error'
  })
})

app.listen(config.port, () => {
  console.log(`pc-admin server listening on :${config.port}`)
})
