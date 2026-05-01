const path = require('path')
const fs = require('fs')
const os = require('os')
const dotenv = require('dotenv')

const rootDir = path.resolve(__dirname, '..')

function loadEnvFile(filename, override = false) {
  const filePath = path.resolve(rootDir, filename)
  if (!fs.existsSync(filePath)) return
  dotenv.config({ path: filePath, override })
}

loadEnvFile('.env')
loadEnvFile('.env.local', true)

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
  db: {
    client: String(process.env.DB_CLIENT || 'mysql').trim().toLowerCase()
  },
  mysql: {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'pc_admin',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'pressure_admin'
  },
  sqlite: {
    path: path.isAbsolute(process.env.SQLITE_PATH || '')
      ? process.env.SQLITE_PATH
      : path.resolve(rootDir, process.env.SQLITE_PATH || './data/pc-admin.local.sqlite')
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
  python: {
    executable: (() => {
      const bundled = path.resolve(
        os.homedir(),
        '.cache',
        'codex-runtimes',
        'codex-primary-runtime',
        'dependencies',
        'python',
        'python.exe'
      )
      if (process.env.PYTHON_EXECUTABLE) return process.env.PYTHON_EXECUTABLE
      if (fs.existsSync(bundled)) return bundled
      return 'python'
    })(),
    excelParserScript: path.resolve(rootDir, 'scripts/parse_excel.py'),
    excelParserTimeoutMs: Number(process.env.EXCEL_PARSER_TIMEOUT_MS || 30000)
  },
  sms: {
    provider: process.env.SMS_PROVIDER || 'placeholder',
    signName: process.env.SMS_SIGN_NAME || '',
    templateCode: process.env.SMS_TEMPLATE_CODE || ''
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
