const { formatDate, isExpiringDate, parseDateInput } = require('../utils/dates')

function getReminderStorageKey(scope = 'default') {
  const today = formatDate(new Date()) || ''
  return `reminder_${scope}_${today}`
}

function calculateDaysLeft(dateValue) {
  const parsed = parseDateInput(dateValue)
  if (!parsed) return null

  const target = new Date(parsed)
  target.setHours(0, 0, 0, 0)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
}

function buildReminders(records = [], options = {}) {
  const days = Number(options.days || 30)
  const limit = Number(options.limit || 8)
  const phoneMap = options.phoneMap || new Map()
  const includeExpired = !!options.includeExpired

  const reminders = records
    .filter((record) => {
      if (!record?.expiryDate) return false
      if (includeExpired) {
        return isExpiringDate(record.expiryDate, days) || calculateDaysLeft(record.expiryDate) < 0
      }
      return isExpiringDate(record.expiryDate, days)
    })
    .map((record) => {
      const expiryDate = formatDate(record.expiryDate)
      const daysLeft = calculateDaysLeft(record.expiryDate)
      const enterpriseName = record.enterpriseName || ''
      return {
        id: record.id,
        certNo: record.certNo || '',
        factoryNo: record.factoryNo || '',
        instrumentName: record.instrumentName || record.deviceName || '压力表',
        enterpriseName,
        district: record.district || '',
        expiryDate,
        daysLeft,
        phone: phoneMap.get(enterpriseName) || record.enterprisePhone || '',
        conclusion: record.conclusion || '',
        statusLabel: daysLeft === 0 ? '今日到期' : `${daysLeft} 天后到期`
      }
    })
    .sort((a, b) => {
      if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft
      return String(a.enterpriseName || '').localeCompare(String(b.enterpriseName || ''))
    })

  return reminders.slice(0, limit)
}

function createSmsPlaceholder(payload = {}, session = null, config = {}) {
  const provider = config.provider || 'placeholder'
  const request = {
    scene: payload.scene || 'expiry_notice',
    recipients: payload.recipients || [],
    message: payload.message || '',
    operator: session?.companyName || session?.username || session?.sub || ''
  }

  console.log('[sms.placeholder] send', {
    provider,
    request
  })

  return {
    success: true,
    accepted: false,
    provider,
    message: '短信提醒接口已预留，当前未接入真实短信服务',
    request
  }
}

module.exports = {
  buildReminders,
  createSmsPlaceholder,
  getReminderStorageKey
}
