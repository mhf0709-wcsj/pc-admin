const axios = require('axios')
const config = require('../config')
const { getKnowledgeBase, getRelevantKnowledge } = require('./knowledge')

function normalizeExtractText(text) {
  let next = String(text || '').replace(/\r/g, '')
  for (let i = 0; i < 4; i += 1) {
    next = next.replace(/([\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, '$1')
  }
  return next
}

function cleanupLineValue(value) {
  return String(value || '')
    .replace(/^[：:.\-\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractLineValue(text, labels) {
  const lines = normalizeExtractText(text).split('\n').map((line) => line.trim()).filter(Boolean)
  for (const label of labels) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      const idx = line.indexOf(label)
      if (idx >= 0) {
        const value = cleanupLineValue(line.slice(idx + label.length))
        if (value) return value
        if (lines[i + 1]) return cleanupLineValue(lines[i + 1])
      }
    }
  }
  return ''
}

function extractDate(text, labels) {
  const raw = extractLineValue(text, labels)
  if (!raw) return ''
  const match = raw.match(/(20\d{2})[-./年](\d{1,2})[-./月](\d{1,2})/)
  if (!match) return ''
  return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
}

function heuristicExtract(text) {
  const normalized = normalizeExtractText(text)
  return {
    certNo: extractLineValue(normalized, ['证书编号', '证书号']),
    factoryNo: extractLineValue(normalized, ['出厂编号', '出厂号']),
    sendUnit: extractLineValue(normalized, ['送检单位']),
    instrumentName: extractLineValue(normalized, ['计量器具名称', '仪表名称']),
    modelSpec: extractLineValue(normalized, ['型号/规格', '型号规格', '规格型号']),
    manufacturer: extractLineValue(normalized, ['制造单位', '生产单位']),
    verificationStd: extractLineValue(normalized, ['检定依据']),
    conclusion: extractLineValue(normalized, ['检定结论']) || (normalized.includes('该压力表合格') || normalized.includes('合格') ? '合格' : ''),
    verificationDate: extractDate(normalized, ['检定日期']),
    gaugeStatus: '在用'
  }
}

async function callDashScope(messages) {
  if (!config.dashscope.apiKey) return ''
  const response = await axios.post(
    config.dashscope.endpoint,
    {
      model: config.dashscope.model,
      messages,
      temperature: 0.2,
      response_format: { type: 'json_object' }
    },
    {
      timeout: 60000,
      headers: {
        Authorization: `Bearer ${config.dashscope.apiKey}`,
        'Content-Type': 'application/json'
      }
    }
  )

  return response?.data?.choices?.[0]?.message?.content || ''
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

async function extractRecordFromText(ocrText) {
  const fallback = heuristicExtract(ocrText)
  if (!config.dashscope.apiKey) {
    return fallback
  }

  try {
    const content = await callDashScope([
      {
        role: 'system',
        content: [
          '你是压力表检定证书字段提取器。',
          '只返回 JSON。',
          '字段只允许：certNo,factoryNo,sendUnit,instrumentName,modelSpec,manufacturer,verificationStd,conclusion,verificationDate,gaugeStatus。',
          'verificationDate 输出格式必须为 YYYY-MM-DD。',
          '识别不到时返回空字符串。'
        ].join('\n')
      },
      {
        role: 'user',
        content: `请从下面文本中提取字段：\n${normalizeExtractText(ocrText)}`
      }
    ])
    const parsed = parseJsonSafely(content) || {}
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
    return fallback
  }
}

async function answerQuestion(payload = {}) {
  const question = String(payload.question || '').trim()
  if (!question) {
    return { success: true, answer: '请输入问题。' }
  }

  const contextText = (payload.conversationContext?.recentMessages || [])
    .map((item) => `${item.role === 'assistant' ? 'AI' : '用户'}：${item.content}`)
    .join('\n')
  const knowledge = getRelevantKnowledge(question) || getKnowledgeBase()

  if (!config.dashscope.apiKey) {
    return {
      success: true,
      answer: knowledge ? `参考资料：\n${knowledge}` : '当前未配置大模型，且没有命中本地知识库。'
    }
  }

  const answer = await axios.post(
    config.dashscope.endpoint,
    {
      model: config.dashscope.model,
      messages: [
        {
          role: 'system',
          content: [
            '你是压力表智能管家。',
            '优先根据给定资料回答，不要编造法规、标准或业务数据。',
            '回答使用简体中文，专业直接。'
          ].join('\n')
        },
        {
          role: 'user',
          content: [
            `用户问题：${question}`,
            contextText ? `最近上下文：\n${contextText}` : '',
            `可用资料：\n${knowledge}`
          ].filter(Boolean).join('\n\n')
        }
      ],
      temperature: 0.4
    },
    {
      timeout: 60000,
      headers: {
        Authorization: `Bearer ${config.dashscope.apiKey}`,
        'Content-Type': 'application/json'
      }
    }
  )

  return {
    success: true,
    answer: answer?.data?.choices?.[0]?.message?.content || '未获取到有效回复。'
  }
}

async function handleAiPayload(payload = {}) {
  if (payload.action === 'extractRecordFromImage') {
    const data = await extractRecordFromText(payload.ocrText || '')
    return { success: true, data }
  }
  return answerQuestion(payload)
}

module.exports = {
  handleAiPayload
}
