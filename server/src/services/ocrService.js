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

async function callBaiduOcr(accessToken, imageBase64, apiType) {
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
      timeout: 30000
    }
  )

  if (response.data.error_code) {
    throw new Error(response.data.error_msg || `Baidu OCR error: ${response.data.error_code}`)
  }

  return response.data
}

async function runOcr(payload = {}) {
  const imageBase64 = String(payload.imageBase64 || '').trim()
  if (!imageBase64) {
    throw new Error('imageBase64 is required')
  }

  const accessToken = await getAccessToken()
  let ocrResult = null
  let apiUsed = ''

  try {
    ocrResult = await callBaiduOcr(accessToken, imageBase64, 'accurate_basic')
    apiUsed = 'accurate_basic'
  } catch (error) {
    try {
      ocrResult = await callBaiduOcr(accessToken, imageBase64, 'general_basic')
      apiUsed = 'general_basic'
    } catch (fallbackError) {
      ocrResult = await callBaiduOcr(accessToken, imageBase64, 'accurate')
      apiUsed = 'accurate'
    }
  }

  if (!ocrResult?.words_result?.length) {
    throw new Error('No OCR text was detected')
  }

  const lines = ocrResult.words_result
    .filter((item) => !item.probability || item.probability.average >= 0.5)
    .map((item) => ({
      text: item.words,
      location: item.location || null,
      probability: item.probability ? item.probability.average : null
    }))

  return {
    success: true,
    text: lines.map((line) => line.text).join('\n'),
    lines,
    total: lines.length,
    apiUsed
  }
}

module.exports = {
  runOcr
}
