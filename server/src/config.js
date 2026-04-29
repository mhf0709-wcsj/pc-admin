const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

function splitOrigins(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

module.exports = {
  port: Number(process.env.PORT || 3001),
  corsOrigins: splitOrigins(process.env.CORS_ORIGIN),
  tcb: {
    env: process.env.TCB_ENV_ID || '',
    secretId: process.env.TCB_SECRET_ID || '',
    secretKey: process.env.TCB_SECRET_KEY || '',
    sessionToken: process.env.TCB_SESSION_TOKEN || ''
  },
  dashscope: {
    apiKey: process.env.DASHSCOPE_API_KEY || '',
    model: process.env.DASHSCOPE_MODEL || 'qwen3.5-flash',
    endpoint: process.env.DASHSCOPE_ENDPOINT || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
  },
  baidu: {
    apiKey: process.env.BAIDU_API_KEY || '',
    secretKey: process.env.BAIDU_SECRET_KEY || ''
  }
}
