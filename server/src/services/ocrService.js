const axios = require('axios')
const config = require('../config')

let cachedToken = null
let tokenExpireTime = 0

async function getAccessToken() {
  if (!config.baidu.apiKey || !config.baidu.secretKey) {
    throw new Error('BAIDU_API_KEY / BAIDU_SECRET_KEY is not configured')
  }

  if (cachedToken && Date.now() < tokenExpireTime) {
    return cachedToken
  }

  const response = await axios.post('https://aip.baidubce.com/oauth/2.0/token', null, {
    params: {
      grant_type: 'client_credentials',
      client_id: config.baidu.apiKey,
      client_secret: config.baidu.secretKey
    },
    timeout: 10000
  })

  if (!response.data.access_token) {
    throw new Error('Failed to get Baidu OCR access token')
  }

  cachedToken = response.data.access_token
  tokenExpireTime = Date.now() + (Number(response.data.expires_in || 0) - 3600) * 1000
  return cachedToken
}

function getApiPlan() {
  const mode = String(process.env.BAIDU_OCR_MODE || 'fast').trim().toLowerCase()
  if (mode === 'accurate') return ['accurate_basic', 'accurate', 'general_basic']
  return ['general_basic', 'accurate_basic', 'accurate']
}

function normalizeLines(ocrResult = {}) {
  return (ocrResult.words_result || [])
    .filter((item) => !item.probability || item.probability.average >= 0.45)
    .map((item) => ({
      text: String(item.words || '').trim(),
      location: item.location || null,
      probability: item.probability ? item.probability.average : null
    }))
    .filter((item) => item.text)
}

async function callBaiduOcr(accessToken, imageBase64, apiType) {
  const startedAt = Date.now()
  const params = new URLSearchParams()
  params.append('image', imageBase64)
  params.append('access_token', accessToken)
  params.append('detect_direction', 'true')
  params.append('probability', 'true')

  if (apiType === 'general_basic' || apiType === 'general') {
    params.append('language_type', 'CHN_ENG')
  }

  if (apiType === 'general_basic' || apiType === 'accurate_basic') {
    params.append('paragraph', 'true')
  }

  const response = await axios.post(
    `https://aip.baidubce.com/rest/2.0/ocr/v1/${apiType}`,
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: Number(process.env.BAIDU_OCR_TIMEOUT_MS || 22000)
    }
  )

  if (response.data.error_code) {
    const error = new Error(response.data.error_msg || `Baidu OCR error: ${response.data.error_code}`)
    error.code = response.data.error_code
    throw error
  }

  console.log('[ocr.service] baidu.success', {
    apiType,
    durationMs: Date.now() - startedAt,
    words: response.data.words_result_num || response.data.words_result?.length || 0
  })

  return response.data
}

async function runOcr(payload = {}) {
  const imageBase64 = String(payload.imageBase64 || '').trim()
  if (!imageBase64) {
    throw new Error('imageBase64 is required')
  }

  const accessToken = await getAccessToken()
  const apiPlan = getApiPlan()
  let lastError = null

  for (const apiType of apiPlan) {
    const startedAt = Date.now()
    try {
      const ocrResult = await callBaiduOcr(accessToken, imageBase64, apiType)
      const lines = normalizeLines(ocrResult)

      if (lines.length) {
        return {
          success: true,
          text: lines.map((line) => line.text).join('\n'),
          lines,
          total: lines.length,
          apiUsed: apiType,
          durationMs: Date.now() - startedAt
        }
      }

      lastError = new Error(`${apiType} 未检测到文字`)
    } catch (error) {
      lastError = error
      console.warn('[ocr.service] baidu.failed', {
        apiType,
        durationMs: Date.now() - startedAt,
        message: error.message,
        code: error.code || ''
      })
    }
  }

  throw lastError || new Error('No OCR text was detected')
}

module.exports = {
  runOcr
}
