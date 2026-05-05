const axios = require('axios')
const config = require('../config')
const { getKnowledgeBase, getRelevantKnowledge } = require('./knowledge')

function logAiStage(stage, details = {}) {
  console.log(`[ai.service] ${stage}`, details)
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/：/g, ':')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[ \t]+/g, ' ')
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) return match[1].trim()
  }
  return ''
}

function cleanupLineValue(value) {
  if (!value) return ''
  return String(value)
    .split('\n')[0]
    .trim()
}

function extractPressureRange(text) {
  const value = firstMatch(text, [
    /([\(（]?\s*\d+(?:\.\d+)?\s*(?:-|~|－|—|–|一|至|到)\s*\d+(?:\.\d+)?\s*[\)）]?\s*(?:k|K|m|M|g|G)?\s*P\s*a)/i
  ])

  if (!value) return ''
  return value
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[－—–一到至~]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/([kmg])\s*pa/i, (_, prefix) => `${prefix.toUpperCase()}Pa`)
    .replace(/pa/i, 'Pa')
    .trim()
}

function extractDate(text) {
  const match = text.match(/(20\d{2})\s*(?:年|[.\-/])\s*(\d{1,2})\s*(?:月|[.\-/])\s*(\d{1,2})\s*(?:日)?/)
  if (!match) return ''
  const month = String(Number(match[2])).padStart(2, '0')
  const day = String(Number(match[3])).padStart(2, '0')
  return `${match[1]}-${month}-${day}`
}

function heuristicExtractRecord(text) {
  const normalized = normalizeText(text)
  const compact = normalized.replace(/\s+/g, '')

  const result = {
    certNo: firstMatch(normalized, [
      /(?:证书编号|证书号|NO|No)[:\s]*([A-Za-z0-9\-]{5,})/i
    ]),
    factoryNo: firstMatch(normalized, [
      /(?:出厂编号|出厂号|器号|表号)[:\s]*([A-Za-z0-9\-\/]{3,})/i
    ]),
    sendUnit: cleanupLineValue(firstMatch(normalized, [
      /(?:送检单位|委托单位|使用单位)[:\s]*([^\n]+)/i
    ])),
    instrumentName: cleanupLineValue(firstMatch(normalized, [
      /(?:器具名称|仪表名称|名称)[:\s]*([^\n]+)/i
    ])),
    modelSpec: cleanupLineValue(firstMatch(normalized, [
      /(?:型号规格|规格型号|型号|规格)[:\s]*([^\n]+)/i
    ])),
    manufacturer: cleanupLineValue(firstMatch(normalized, [
      /(?:制造单位|生产厂家|制造厂|厂家)[:\s]*([^\n]+)/i
    ])),
    verificationStd: firstMatch(normalized, [/(JJG\s*[\d\-]+)/i]).replace(/\s+/g, ''),
    conclusion: '',
    verificationDate: '',
    gaugeStatus: '在用'
  }

  if (!result.instrumentName && compact.includes('压力表')) {
    result.instrumentName = '压力表'
  }

  if (!result.modelSpec) {
    result.modelSpec = extractPressureRange(normalized)
  }

  if (compact.includes('不合格')) {
    result.conclusion = '不合格'
  } else if (compact.includes('该压力表合格') || compact.includes('合格')) {
    result.conclusion = '合格'
  }

  result.verificationDate = extractDate(normalized)
  return result
}

async function callDashScope(messages, responseFormat = null, meta = {}) {
  if (!config.dashscope.apiKey) return ''

  const body = {
    model: config.dashscope.model,
    messages,
    temperature: 0.2
  }

  if (responseFormat) {
    body.response_format = responseFormat
  }

  const startedAt = Date.now()
  const requestId = meta.requestId || 'unknown'
  logAiStage('dashscope.start', {
    requestId,
    scene: meta.scene || 'unknown',
    model: config.dashscope.model,
    messageCount: Array.isArray(messages) ? messages.length : 0,
    responseFormat: responseFormat?.type || 'text'
  })

  try {
    const response = await axios.post(config.dashscope.endpoint, body, {
      timeout: 60000,
      headers: {
        Authorization: `Bearer ${config.dashscope.apiKey}`,
        'Content-Type': 'application/json'
      }
    })

    const content = response?.data?.choices?.[0]?.message?.content || ''
    logAiStage('dashscope.success', {
      requestId,
      scene: meta.scene || 'unknown',
      durationMs: Date.now() - startedAt,
      contentLength: String(content || '').length
    })
    return content
  } catch (error) {
    logAiStage('dashscope.error', {
      requestId,
      scene: meta.scene || 'unknown',
      durationMs: Date.now() - startedAt,
      message: error?.message || 'Unknown error',
      code: error?.code || '',
      status: error?.response?.status || '',
      data: error?.response?.data || null
    })
    throw error
  }
}

function parseJsonSafely(content) {
  if (!content) return null
  try {
    return JSON.parse(content)
  } catch (error) {
    const match = String(content).match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch (innerError) {
      return null
    }
  }
}

async function extractRecordFromText(ocrText, meta = {}) {
  const fallback = heuristicExtractRecord(ocrText)
  const requestId = meta.requestId || 'unknown'
  const normalizedText = normalizeText(ocrText)
  const textLength = normalizedText.length
  const lineCount = normalizedText ? normalizedText.split('\n').filter(Boolean).length : 0

  logAiStage('extractRecord.start', {
    requestId,
    textLength,
    lineCount,
    mayBeTooLong: textLength > 12000
  })

  if (!config.dashscope.apiKey) {
    logAiStage('extractRecord.noProvider', {
      requestId,
      reason: 'dashscope api key is missing'
    })
    return fallback
  }

  try {
    const content = await callDashScope([
      {
        role: 'system',
        content: [
          'You extract structured fields from pressure gauge inspection text.',
          'Return JSON only.',
          'Allowed keys: certNo,factoryNo,sendUnit,instrumentName,modelSpec,manufacturer,verificationStd,conclusion,verificationDate,gaugeStatus.',
          'verificationDate must use YYYY-MM-DD.',
          'Use an empty string when a field is missing.'
        ].join('\n')
      },
      {
        role: 'user',
        content: `Extract fields from the following OCR text:\n${normalizedText}`
      }
    ], { type: 'json_object' }, {
      requestId,
      scene: 'extractRecordFromImage'
    })

    const parsed = parseJsonSafely(content) || {}
    logAiStage('extractRecord.parsed', {
      requestId,
      parsedKeys: Object.keys(parsed),
      usedFallback: !Object.keys(parsed).length
    })
    return {
      ...fallback,
      certNo: parsed.certNo || fallback.certNo,
      factoryNo: parsed.factoryNo || fallback.factoryNo,
      sendUnit: parsed.sendUnit || fallback.sendUnit,
      instrumentName: parsed.instrumentName || fallback.instrumentName,
      modelSpec: parsed.modelSpec || fallback.modelSpec,
      manufacturer: parsed.manufacturer || fallback.manufacturer,
      verificationStd: parsed.verificationStd || fallback.verificationStd,
      conclusion: parsed.conclusion || fallback.conclusion,
      verificationDate: parsed.verificationDate || fallback.verificationDate,
      gaugeStatus: parsed.gaugeStatus || fallback.gaugeStatus
    }
  } catch (error) {
    logAiStage('extractRecord.fallback', {
      requestId,
      reason: error?.message || 'Unknown error',
      code: error?.code || ''
    })
    return fallback
  }
}

function buildScopeLabel(session) {
  if (!session) return 'guest'
  if (session.userType === 'enterprise') return `enterprise:${session.companyName || session.sub || ''}`
  if (session.userType === 'admin') return `admin:${session.role || 'admin'}:${session.district || 'all'}`
  return String(session.userType || 'guest')
}

async function answerQuestion(payload = {}, session, meta = {}) {
  const question = String(payload.question || '').trim()
  if (!question) {
    return { success: true, answer: 'Please enter a question.' }
  }

  const contextText = (payload.conversationContext?.recentMessages || [])
    .map((item) => `${item.role === 'assistant' ? 'AI' : 'User'}: ${item.content}`)
    .join('\n')

  const knowledge = getRelevantKnowledge(question) || getKnowledgeBase()
  if (!config.dashscope.apiKey) {
    return {
      success: true,
      answer: knowledge
        ? `Reference:\n${knowledge}`
        : 'No AI provider is configured, and no local knowledge matched the question.'
    }
  }

  const answer = await callDashScope([
    {
      role: 'system',
      content: [
        'You are an assistant for pressure gauge records and inspection operations.',
        'Answer in Simplified Chinese unless the user clearly uses another language.',
        'Do not invent regulations or business facts that are not present in the provided material.',
        `Current scope: ${buildScopeLabel(session)}.`
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `Question:\n${question}`,
        contextText ? `Conversation context:\n${contextText}` : '',
        `Reference material:\n${knowledge}`
      ].filter(Boolean).join('\n\n')
    }
  ], null, {
    requestId: meta.requestId,
    scene: 'answerQuestion'
  })

  return {
    success: true,
    answer: answer || 'No answer was produced.'
  }
}

async function handleAiPayload(payload = {}, session, meta = {}) {
  if (payload.action === 'extractRecordFromImage') {
    const data = await extractRecordFromText(String(payload.ocrText || '').trim(), meta)
    return { success: true, data }
  }

  return answerQuestion(payload, session, meta)
}

module.exports = {
  handleAiPayload,
  extractRecordFromText
}
