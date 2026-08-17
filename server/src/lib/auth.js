const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const config = require('../config')

function signSessionToken(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn
  })
}

function verifySessionToken(token) {
  return jwt.verify(token, config.jwt.secret)
}

function getBearerToken(headerValue = '') {
  const text = String(headerValue || '').trim()
  if (!text.toLowerCase().startsWith('bearer ')) return ''
  return text.slice(7).trim()
}

function getCookieValue(headerValue = '', name = '') {
  const cookieName = String(name || '').trim()
  if (!cookieName) return ''

  const item = String(headerValue || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))

  if (!item) return ''
  try {
    return decodeURIComponent(item.slice(cookieName.length + 1))
  } catch {
    return ''
  }
}

function readSessionFromRequest(req) {
  const token = getCookieValue(req.headers.cookie, config.jwt.cookieName) || getBearerToken(req.headers.authorization)
  if (!token) return null
  return verifySessionToken(token)
}

async function hashPassword(password) {
  return bcrypt.hash(String(password || ''), 10)
}

async function comparePassword(password, storedPassword) {
  const rawPassword = String(password || '')
  const rawStoredPassword = String(storedPassword || '')

  if (!rawStoredPassword) return false
  if (rawStoredPassword.startsWith('$2a$') || rawStoredPassword.startsWith('$2b$') || rawStoredPassword.startsWith('$2y$')) {
    return bcrypt.compare(rawPassword, rawStoredPassword)
  }

  return rawPassword === rawStoredPassword
}

module.exports = {
  signSessionToken,
  verifySessionToken,
  getBearerToken,
  getCookieValue,
  readSessionFromRequest,
  hashPassword,
  comparePassword
}
