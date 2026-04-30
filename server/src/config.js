const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

function splitOrigins(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

module.exports = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 3001),
  corsOrigins: splitOrigins(process.env.CORS_ORIGIN),
  mysql: {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'pc_admin',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'pressure_admin'
  },
  dashscope: {
    apiKey: process.env.DASHSCOPE_API_KEY || '',
    model: process.env.DASHSCOPE_MODEL || 'qwen3.5-flash',
    endpoint: process.env.DASHSCOPE_ENDPOINT || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
  },
  baidu: {
    apiKey: process.env.BAIDU_API_KEY || '',
    secretKey: process.env.BAIDU_SECRET_KEY || ''
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'replace-this-before-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },
  seed: {
    adminUsername: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
    adminPassword: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123',
    adminRole: process.env.DEFAULT_ADMIN_ROLE || 'admin',
    adminDistrict: process.env.DEFAULT_ADMIN_DISTRICT || ''
  }
}
