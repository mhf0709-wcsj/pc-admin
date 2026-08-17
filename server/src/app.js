const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const { rateLimit } = require('express-rate-limit')
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

if (config.isProduction && config.jwt.isDefaultSecret) {
  throw new Error('JWT_SECRET must be configured in production')
}

app.disable('x-powered-by')
app.set('trust proxy', 1)

function createRequestId(prefix = 'req') {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: config.jwt.cookieMaxAgeMs
  }
}

function setSessionCookie(res, token) {
  res.cookie(config.jwt.cookieName, token, sessionCookieOptions())
}

function clearSessionCookie(res) {
  const { maxAge, ...options } = sessionCookieOptions()
  res.clearCookie(config.jwt.cookieName, options)
}

function buildSessionProfile(session) {
  if (session.userType === 'enterprise') {
    return {
      userType: 'enterprise',
      user: {
        id: session.sub,
        companyName: session.companyName || '',
        phone: session.phone || '',
        legalPerson: session.legalPerson || '',
        district: session.district || ''
      }
    }
  }

  return {
    userType: 'admin',
    user: {
      id: session.sub,
      username: session.username || '',
      role: session.role || 'admin',
      district: session.district || ''
    }
  }
}

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'img-src': ["'self'", 'data:', 'blob:'],
      'worker-src': ["'self'", 'blob:'],
      'connect-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'frame-ancestors': ["'none'"],
      'upgrade-insecure-requests': null
    }
  },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}))

app.use(cors({
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin)) {
      callback(null, true)
      return
    }
    callback(null, false)
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400
}))

app.use((req, res, next) => {
  req.requestId = String(req.headers['x-request-id'] || createRequestId())
  res.setHeader('X-Request-Id', req.requestId)
  res.setHeader('Cache-Control', 'no-store')
  next()
})

app.use(express.json({ limit: '20mb', strict: true }))
app.use(express.urlencoded({ extended: true, limit: '20mb', parameterLimit: 100 }))

function createRateLimitHandler(code, message) {
  return (req, res) => {
    console.warn('[security.rate-limit]', { requestId: req.requestId, ip: req.ip, code })
    res.status(429).json({ success: false, code, message, requestId: req.requestId })
  }
}

const loginLimiter = rateLimit({
  windowMs: config.security.authWindowMs,
  limit: config.security.authLimit,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: createRateLimitHandler('AUTH_RATE_LIMITED', '尝试次数过多，请稍后再试')
})

const registrationLimiter = rateLimit({
  windowMs: config.security.registrationWindowMs,
  limit: config.security.registrationLimit,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('REGISTRATION_RATE_LIMITED', '注册请求过多，请稍后再试')
})

function limitPublicActions(req, res, next) {
  const action = String(req.body?.action || '').trim()
  if (action === 'login' || action === 'enterpriseLogin') return loginLimiter(req, res, next)
  if (action === 'enterpriseRegister') return registrationLimiter(req, res, next)
  return next()
}

function requireSession(req) {
  let session = null
  try {
    session = readSessionFromRequest(req)
  } catch {
    session = null
  }
  if (!session) {
    const error = new Error('Unauthorized')
    error.statusCode = 401
    error.code = 'UNAUTHORIZED'
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

app.get('/api/session', (req, res, next) => {
  try {
    res.json({ success: true, ...buildSessionProfile(requireSession(req)) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/session/logout', (req, res) => {
  clearSessionCookie(res)
  res.json({ success: true })
})

app.post('/api/admin/call', limitPublicActions, async (req, res, next) => {
  try {
    const action = String(req.body?.action || '').trim()
    const payload = req.body?.payload || {}
    const session = OPEN_ADMIN_ACTIONS.has(action) ? null : requireSession(req)
    const data = await handleAdminAction(action, payload, session)
    if (OPEN_ADMIN_ACTIONS.has(action) && data?.token) {
      setSessionCookie(res, data.token)
      delete data.token
    }
    res.json({ success: true, data, requestId: req.requestId })
  } catch (error) {
    next(error)
  }
})

app.post('/api/ai/call', async (req, res, next) => {
  const requestId = req.requestId
  const startedAt = Date.now()
  try {
    const session = requireSession(req)
    const payload = req.body || {}
    const action = String(payload.action || 'question')
    const ocrTextLength = String(payload.ocrText || '').length
    const questionLength = String(payload.question || '').length

    console.log('[ai.call] start', {
      requestId,
      action,
      userType: session?.userType || 'guest',
      scope: session?.companyName || session?.username || session?.sub || '',
      ocrTextLength,
      questionLength
    })

    const result = await handleAiPayload(payload, session, { requestId })

    console.log('[ai.call] success', {
      requestId,
      action,
      durationMs: Date.now() - startedAt
    })
    res.json({ ...result, requestId })
  } catch (error) {
    console.error('[ai.call] error', {
      requestId,
      durationMs: Date.now() - startedAt,
      message: error?.message || 'Unknown error',
      code: error?.code || '',
      stack: error?.stack || ''
    })
    next(error)
  }
})

app.post('/api/ocr/call', async (req, res, next) => {
  try {
    requireSession(req)
    const result = await runOcr(req.body || {})
    res.json({ ...result, requestId: req.requestId })
  } catch (error) {
    next(error)
  }
})

app.use((error, req, res, next) => {
  const isProviderFailure = req.path.includes('/api/ai/') || req.path.includes('/api/ocr/')
  const isPayloadTooLarge = error?.type === 'entity.too.large'
  const requestedStatus = Number(error.statusCode || 0)
  const statusCode = isPayloadTooLarge
    ? 413
    : (requestedStatus >= 400 && requestedStatus <= 599 ? requestedStatus : (isProviderFailure ? 502 : 400))
  const isInternalError = statusCode >= 500
  const payload = {
    success: false,
    code: isPayloadTooLarge ? 'PAYLOAD_TOO_LARGE' : (error.code || `HTTP_${statusCode}`),
    message: isPayloadTooLarge
      ? '上传内容过大，请压缩图片或拆分文件后重试'
      : (isInternalError ? '服务暂时不可用，请稍后重试' : (error.message || '请求失败')),
    requestId: req.requestId
  }

  if (req.path.includes('/api/ai/') || req.path.endsWith('/api/ai/call')) {
    payload.error = payload.message
  }

  if (req.path.includes('/api/ocr/') || req.path.endsWith('/api/ocr/call')) {
    payload.error = payload.message
  }

  if (isInternalError) {
    console.error('[request.error]', {
      requestId: req.requestId,
      path: req.path,
      code: error.code || '',
      message: error.message || 'Unknown error'
    })
  }

  res.status(statusCode).json(payload)
})

app.listen(config.port, config.host, () => {
  console.log(`pc-admin server listening on ${config.host}:${config.port}`)
})
