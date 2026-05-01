const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')
const config = require('../config')

function decodeBase64ToBuffer(fileBase64 = '') {
  const raw = String(fileBase64 || '')
  const normalized = raw.includes(',') ? raw.split(',').pop() : raw
  return Buffer.from(normalized, 'base64')
}

function runPythonParser(filePath) {
  return new Promise((resolve, reject) => {
    execFile(
      config.python.executable,
      [config.python.excelParserScript, filePath],
      {
        timeout: config.python.excelParserTimeoutMs,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr || error.message || '').trim()
          reject(new Error(detail || 'Excel 解析失败'))
          return
        }

        try {
          resolve(JSON.parse(String(stdout || '{}')))
        } catch (parseError) {
          reject(new Error(`Excel 解析结果无效: ${parseError.message}`))
        }
      }
    )
  })
}

async function parseEnterpriseExcel(payload = {}) {
  const fileName = String(payload.fileName || 'upload.xlsx').trim() || 'upload.xlsx'
  const fileBase64 = String(payload.fileBase64 || '').trim()
  if (!fileBase64) {
    throw new Error('Excel 文件内容不能为空')
  }

  const ext = path.extname(fileName).toLowerCase()
  if (ext === '.xls') {
    throw new Error('暂不支持老式 .xls 文件，请另存为 .xlsx 或 .csv 后重试')
  }
  if (!['.xlsx', '.csv'].includes(ext)) {
    throw new Error('仅支持 .xlsx 或 .csv 文件')
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-admin-excel-'))
  const tempFile = path.join(tempDir, fileName)

  try {
    fs.writeFileSync(tempFile, decodeBase64ToBuffer(fileBase64))
    const parsed = await runPythonParser(tempFile)
    const rows = Array.isArray(parsed.rows) ? parsed.rows : []
    if (!rows.length) {
      throw new Error('表格中没有可识别的数据行')
    }

    return {
      fileName,
      rowCount: rows.length,
      rows
    }
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch (error) {
      console.warn('[excel.parse] cleanup failed', error?.message || error)
    }
  }
}

module.exports = {
  parseEnterpriseExcel
}
