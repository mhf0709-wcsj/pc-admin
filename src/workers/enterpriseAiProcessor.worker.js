import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

function normalizeHttpError(payload, fallbackMessage) {
  return payload?.error || payload?.message || fallbackMessage
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer()
  return arrayBufferToBase64(buffer)
}

async function compressImageFile(file, options = {}) {
  const maxWidth = options.maxWidth || 1600
  const maxHeight = options.maxHeight || 1600
  const quality = options.quality || 0.8
  const passThroughMaxBytes = options.passThroughMaxBytes || 1.2 * 1024 * 1024

  const bitmap = await createImageBitmap(file)
  const sourceWidth = bitmap.width
  const sourceHeight = bitmap.height
  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight)

  if (file.size <= passThroughMaxBytes && scale >= 0.98) {
    bitmap.close()
    return {
      file,
      skipped: true,
      reason: '图片尺寸合适，跳过压缩'
    }
  }

  const targetWidth = Math.max(1, Math.round(sourceWidth * scale))
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale))
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(targetWidth, targetHeight)
      : null

  if (!canvas) {
    bitmap.close()
    throw new Error('当前浏览器不支持后台图片处理')
  }

  const context = canvas.getContext('2d', {
    alpha: false,
    desynchronized: true,
    willReadFrequently: false
  })
  context.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
  bitmap.close()

  const mimeType = 'image/jpeg'
  const blob = await canvas.convertToBlob({ type: mimeType, quality })
  if (!blob) {
    throw new Error('图片压缩失败')
  }

  return {
    file: new File([blob], file.name.replace(/\.(png|webp)$/i, '.jpg'), {
      type: mimeType,
      lastModified: Date.now()
    }),
    skipped: false,
    reason:
      scale < 0.98
        ? `已压缩 ${sourceWidth}×${sourceHeight} -> ${targetWidth}×${targetHeight}`
        : '已转换为更轻量的图片格式'
  }
}

function normalizePdfLine(line) {
  let text = String(line || '').replace(/\s+/g, ' ').trim()
  for (let i = 0; i < 4; i += 1) {
    text = text.replace(/([\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, '$1')
  }
  return text
    .replace(/([\u4e00-\u9fa5])\s*\/\s*([\u4e00-\u9fa5])/g, '$1/$2')
    .replace(/\(\s*/g, '(')
    .replace(/\s*\)/g, ')')
    .trim()
}

function buildPdfPageText(items = []) {
  const rows = new Map()
  for (const item of items) {
    const y = Math.round((item.transform?.[5] || 0) / 4) * 4
    if (!rows.has(y)) rows.set(y, [])
    rows.get(y).push({
      str: String(item.str || ''),
      x: item.transform?.[4] || 0
    })
  }

  return Array.from(rows.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, lineItems]) => {
      const sorted = lineItems.sort((a, b) => a.x - b.x)
      const merged = []
      for (const item of sorted) {
        const last = merged[merged.length - 1]
        if (
          last &&
          item.str &&
          item.str === last.str &&
          item.str.length <= 2 &&
          Math.abs(item.x - last.x) < 3
        ) {
          continue
        }
        merged.push(item)
      }
      return merged.map((item) => item.str).join(' ')
    })
    .map(normalizePdfLine)
    .filter(Boolean)
    .join('\n')
}

async function renderPdfFirstPage(file, options = {}) {
  const scale = options.scale || 1.8
  const quality = options.quality || 0.92
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const page = await pdf.getPage(1)
  const textContent = await page.getTextContent()
  const pageText = buildPdfPageText(textContent.items || [])
  const viewport = page.getViewport({ scale })

  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(viewport.width, viewport.height)
      : null

  if (!canvas) {
    throw new Error('当前浏览器不支持后台 PDF 渲染')
  }

  const context = canvas.getContext('2d', {
    alpha: false,
    desynchronized: true,
    willReadFrequently: false
  })

  await page.render({ canvasContext: context, viewport }).promise
  const pageBlob = await canvas.convertToBlob({ type: 'image/png', quality })
  if (!pageBlob) {
    throw new Error('PDF 页面渲染失败')
  }

  return {
    pageBlob,
    pageText,
    pageName: `${file.name.replace(/\.pdf$/i, '')} 第 1 页`
  }
}

async function requestOcr(baseUrl, token, imageBase64, options = {}) {
  const retryLimit = options.retryLimit ?? 2
  const retryDelay = options.retryDelay ?? 800
  const timeout = options.timeout ?? 25000

  let lastError = null
  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(`${String(baseUrl).replace(/\/$/, '')}/api/ocr/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ imageBase64 }),
        signal: controller.signal
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result?.success) {
        throw new Error(normalizeHttpError(result, 'OCR 服务调用失败'))
      }

      clearTimeout(timer)
      return String(result.text || '').trim()
    } catch (error) {
      clearTimeout(timer)
      lastError = error?.name === 'AbortError' ? new Error('OCR 请求超时') : error

      if (attempt >= retryLimit) {
        throw lastError
      }

      await sleep(retryDelay * (attempt + 1))
    }
  }

  throw lastError || new Error('OCR 服务调用失败')
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data || {}

  try {
    if (type === 'process-image') {
      const compressed = await compressImageFile(payload.file, payload.compressOptions)
      const imageBase64 = await fileToBase64(compressed.file)

      let ocrText = ''
      if (payload.baseUrl) {
        ocrText = await requestOcr(payload.baseUrl, payload.token, imageBase64, payload.ocrOptions)
      }

      self.postMessage({
        id,
        ok: true,
        result: {
          compressedFile: compressed.file,
          compressReason: compressed.reason,
          skippedCompression: compressed.skipped,
          imageBase64: payload.baseUrl ? '' : imageBase64,
          ocrText
        }
      })
      return
    }

    if (type === 'process-pdf-first-page') {
      const result = await renderPdfFirstPage(payload.file, payload.pdfOptions)
      self.postMessage({
        id,
        ok: true,
        result
      })
      return
    }

    throw new Error('未知的 worker 任务类型')
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error?.message || '后台文件处理失败'
    })
  }
}
