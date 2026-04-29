function pad(value) {
  return String(value).padStart(2, '0')
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function isExpiredDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return date < startOfToday()
}

function isExpiringDate(value, days = 30) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const today = startOfToday()
  const future = addDays(today, days)
  return date >= today && date <= future
}

function parseDateInput(value) {
  const text = String(value || '').trim()
  if (!text) return null
  const normalized = text
    .replace(/年/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '')
    .replace(/\./g, '-')
    .replace(/\//g, '-')
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function calculateExpiryDate(value) {
  const date = parseDateInput(value)
  if (!date) return ''
  const expiryDate = new Date(date)
  expiryDate.setMonth(expiryDate.getMonth() + 6)
  expiryDate.setDate(expiryDate.getDate() - 1)
  return formatDate(expiryDate)
}

module.exports = {
  pad,
  formatDate,
  formatDateTime,
  startOfToday,
  addDays,
  isExpiredDate,
  isExpiringDate,
  parseDateInput,
  calculateExpiryDate
}
