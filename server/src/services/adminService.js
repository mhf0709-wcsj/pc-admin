const crypto = require('crypto')
const config = require('../config')
const { one, query, exec, withTransaction } = require('../lib/db')
const { comparePassword, hashPassword, signSessionToken } = require('../lib/auth')
const { parseEnterpriseExcel } = require('./excelService')
const { buildReminders, createSmsPlaceholder } = require('./reminderService')
const {
  submitEnterpriseRecognitionTask,
  getEnterpriseRecognitionTask,
  listEnterpriseRecognitionTasks,
  deleteEnterpriseRecognitionTask,
  clearCompletedRecognitionTasks,
  retryEnterpriseRecognitionTask,
  batchRetryEnterpriseRecognitionTasks
} = require('./enterpriseAiQueueService')
const {
  formatDate,
  formatDateTime,
  startOfToday,
  isExpiredDate,
  isExpiringDate,
  parseDateInput,
  calculateExpiryDate
} = require('../utils/dates')

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`
}

function toBool(value) {
  return value ? 1 : 0
}

function createServiceError(code, message, statusCode = 400) {
  const error = new Error(message)
  error.code = code
  error.statusCode = statusCode
  return error
}

function normalizeAdmin(admin) {
  return {
    id: admin.id,
    username: admin.username,
    role: admin.role || 'admin',
    district: admin.district || '',
    isDisabled: !!Number(admin.isDisabled || 0),
    lastLoginTime: admin.lastLoginTime || '',
    createTime: admin.createTime || '',
    updateTime: admin.updateTime || ''
  }
}

function normalizeEnterprise(enterprise) {
  return {
    id: enterprise.id,
    companyName: enterprise.companyName || '',
    phone: enterprise.phone || '',
    legalPerson: enterprise.legalPerson || '',
    creditCode: enterprise.creditCode || '',
    district: enterprise.district || ''
  }
}

function buildAdminToken(admin) {
  return signSessionToken({
    sub: admin.id,
    userType: 'admin',
    username: admin.username,
    role: admin.role || 'admin',
    district: admin.district || ''
  })
}

function buildEnterpriseToken(enterprise) {
  return signSessionToken({
    sub: enterprise.id,
    userType: 'enterprise',
    companyName: enterprise.companyName || '',
    phone: enterprise.phone || '',
    legalPerson: enterprise.legalPerson || '',
    district: enterprise.district || ''
  })
}

function assertAdminSession(session) {
  if (!session || session.userType !== 'admin') {
    const error = new Error('需要监管端登录状态')
    error.statusCode = 401
    throw error
  }

  return {
    id: session.sub,
    username: session.username || '',
    role: session.role || 'admin',
    district: session.district || ''
  }
}

function assertSuperAdminSession(session) {
  const admin = assertAdminSession(session)
  if (admin.role !== 'admin' && admin.role !== 'super') {
    const error = new Error('仅总管理员可以维护辖区管理员账号')
    error.statusCode = 403
    throw error
  }
  return admin
}

function assertEnterpriseSession(session) {
  if (!session || session.userType !== 'enterprise') {
    const error = new Error('需要企业端登录状态')
    error.statusCode = 401
    throw error
  }

  return {
    id: session.sub,
    companyName: session.companyName || '',
    phone: session.phone || '',
    legalPerson: session.legalPerson || '',
    district: session.district || ''
  }
}

function matchKeyword(fields, keyword) {
  const text = String(keyword || '').trim().toLowerCase()
  if (!text) return true
  return fields.some((field) => String(field || '').toLowerCase().includes(text))
}

function buildAdminScope(admin) {
  const clauses = []
  const params = {}

  if (admin.role === 'district' && admin.district) {
    clauses.push('district = :district')
    params.district = admin.district
  }

  return { clauses, params }
}

function buildEnterpriseScope(enterprise) {
  if (!enterprise.companyName) {
    throw new Error('企业身份信息缺失')
  }
  return enterprise.companyName
}

async function listRows(table, options = {}, executor = null) {
  const clauses = [...(options.clauses || [])]
  const params = { ...(options.params || {}) }
  const orderBy = options.orderBy || 'createTime'
  const direction = String(options.direction || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  return query(`SELECT * FROM ${table} ${whereSql} ORDER BY ${orderBy} ${direction}`, params, executor)
}

async function insertRow(table, data, executor = null) {
  const keys = Object.keys(data)
  const fields = keys.join(', ')
  const placeholders = keys.map((key) => `:${key}`).join(', ')
  await exec(`INSERT INTO ${table} (${fields}) VALUES (${placeholders})`, data, executor)
  return data
}

async function updateById(table, rowId, data, executor = null) {
  const keys = Object.keys(data).filter((key) => data[key] !== undefined)
  if (!keys.length) return
  const setSql = keys.map((key) => `${key} = :${key}`).join(', ')
  await exec(`UPDATE ${table} SET ${setSql} WHERE id = :id`, { ...data, id: rowId }, executor)
}

function getOperationCategory(action) {
  if (/Admin|Password|login/i.test(action)) return 'account'
  if (/Record|Equipment|Gauge|EnterpriseAiRecord/i.test(action)) return 'ledger'
  if (/Sms|Reminder/i.test(action)) return 'sms'
  if (/Recognition|Ai|Excel|Ocr/i.test(action)) return 'ai'
  return 'system'
}

function summarizePayload(payload = {}) {
  const result = { ...payload }
  if (result.password) result.password = '***'
  if (result.oldPassword) result.oldPassword = '***'
  if (result.newPassword) result.newPassword = '***'
  if (result.imageBase64) result.imageBase64 = `[base64:${String(result.imageBase64).length}]`
  if (result.fileBase64) result.fileBase64 = `[base64:${String(result.fileBase64).length}]`
  if (result.extractedData) result.extractedData = { ...result.extractedData }
  return result
}

function getOperatorFromSession(session, fallback = {}) {
  if (session?.userType === 'admin') {
    return {
      operatorType: 'admin',
      operatorId: session.sub || '',
      operatorName: session.username || ''
    }
  }
  if (session?.userType === 'enterprise') {
    return {
      operatorType: 'enterprise',
      operatorId: session.sub || '',
      operatorName: session.companyName || ''
    }
  }
  return {
    operatorType: fallback.operatorType || 'guest',
    operatorId: fallback.operatorId || '',
    operatorName: fallback.operatorName || ''
  }
}

async function writeOperationLog({ action, payload, session, success, message, errorCode, durationMs, fallback }) {
  try {
    const operator = getOperatorFromSession(session, fallback)
    await insertRow('operation_logs', {
      id: createId('op'),
      category: getOperationCategory(action),
      action,
      success: toBool(success),
      operatorType: operator.operatorType,
      operatorId: operator.operatorId,
      operatorName: operator.operatorName,
      targetType: String(payload?.targetType || payload?.scene || ''),
      targetId: String(payload?.id || payload?.jobId || payload?.equipmentId || ''),
      message: String(message || ''),
      errorCode: String(errorCode || ''),
      metadata: JSON.stringify(summarizePayload(payload)),
      durationMs: Number(durationMs || 0),
      createTime: formatDateTime()
    })
  } catch (error) {
    console.warn('[operation.log] skipped', {
      action,
      message: error.message
    })
  }
}

async function getAdminByUsername(username, executor = null) {
  return one('SELECT * FROM admins WHERE username = :username LIMIT 1', { username }, executor)
}

function normalizeEnterpriseName(item = {}) {
  return item.companyName || item.enterpriseName || ''
}

function normalizeReminderRecords(records = [], enterprises = []) {
  const phoneMap = new Map()
  enterprises.forEach((item) => {
    const companyName = normalizeEnterpriseName(item)
    if (companyName) {
      phoneMap.set(companyName, item.phone || '')
    }
  })
  return phoneMap
}

function getRecordRiskStatus(record = {}) {
  if (record.riskStatus) return record.riskStatus
  if (isExpiredDate(record.expiryDate) || isExpiringDate(record.expiryDate, 30)) return 'pending'
  return 'normal'
}

function getRecordRiskType(record = {}) {
  const expired = isExpiredDate(record.expiryDate)
  const expiring = !expired && isExpiringDate(record.expiryDate, 30)
  if (expired) return 'expired'
  if (expiring) return 'expiring'
  return 'normal'
}

function normalizeRecord(item = {}) {
  return {
    _id: item.id,
    id: item.id,
    certNo: item.certNo || '',
    factoryNo: item.factoryNo || '',
    enterpriseName: item.enterpriseName || '',
    instrumentName: item.instrumentName || '',
    district: item.district || '',
    conclusion: item.conclusion || '',
    verificationDate: formatDate(item.verificationDate),
    expiryDate: formatDate(item.expiryDate),
    sendUnit: item.sendUnit || '',
    equipmentName: item.equipmentName || item.deviceName || '',
    modelSpec: item.modelSpec || '',
    manufacturer: item.manufacturer || '',
    verificationStd: item.verificationStd || '',
    installLocation: item.installLocation || '',
    hasImage: !!Number(item.hasImage || 0),
    hasInstallPhoto: !!Number(item.hasInstallPhoto || 0),
    fileID: item.fileID || '',
    installPhotoFileID: item.installPhotoFileID || '',
    riskType: getRecordRiskType(item),
    riskStatus: getRecordRiskStatus(item),
    remediationStatus: item.remediationStatus || 'pending',
    remediationNote: item.remediationNote || '',
    remediationUpdateTime: item.remediationUpdateTime || '',
    updateTime: item.updateTime || '',
    createTime: item.createTime || ''
  }
}

function matchesStatisticsFilters(record, payload = {}) {
  const district = String(payload.district || '').trim()
  const enterpriseName = String(payload.enterpriseName || '').trim()
  const month = String(payload.month || '').trim()
  const riskStatus = String(payload.riskStatus || '').trim()

  if (district && district !== '鍏ㄩ儴杈栧尯' && record.district !== district) return false
  if (enterpriseName && record.enterpriseName !== enterpriseName) return false
  if (month) {
    const dateText = formatDate(record.verificationDate || record.expiryDate)
    if (!dateText.startsWith(month)) return false
  }
  if (riskStatus && getRecordRiskStatus(record) !== riskStatus) return false
  return true
}

function getEnterpriseTodoReason(record = {}) {
  if (isExpiredDate(record.expiryDate)) return '已逾期'
  if (String(record.conclusion || '').includes('不合格')) return '检定不合格'
  if (!String(record.installLocation || '').trim()) return '缺少安装位置'
  if (!Number(record.hasInstallPhoto || 0)) return '缺少现场照片'
  if (!Number(record.hasImage || 0)) return '缺少证书图片'
  if (isExpiringDate(record.expiryDate, 30)) return '30 天内到期'
  return ''
}

function buildEnterpriseTodo(record = {}) {
  const reason = getEnterpriseTodoReason(record)
  if (!reason) return null
  return {
    ...normalizeRecord(record),
    todoReason: reason,
    priority: isExpiredDate(record.expiryDate) || String(record.conclusion || '').includes('不合格') ? 'high' : 'normal',
    remediationStatus: record.remediationStatus || 'pending',
    remediationNote: record.remediationNote || '',
    remediationUpdateTime: record.remediationUpdateTime || ''
  }
}

async function handleLogin(payload = {}) {
  const username = String(payload.username || '').trim()
  const password = String(payload.password || '').trim()
  if (!username || !password) {
    throw new Error('请输入用户名和密码')
  }

  const admin = await getAdminByUsername(username)
  if (!admin || !(await comparePassword(password, admin.password))) {
    throw new Error('鐢ㄦ埛鍚嶆垨瀵嗙爜閿欒')
  }

  if (Number(admin.isDisabled || 0)) {
    throw createServiceError('ACCOUNT_DISABLED', '璐﹀彿宸插仠鐢紝璇疯仈绯绘€荤鐞嗗憳', 403)
  }

  await updateById('admins', admin.id, {
    lastLoginTime: formatDateTime(),
    updateTime: formatDateTime()
  })

  return {
    admin: normalizeAdmin(admin),
    token: buildAdminToken(admin)
  }
}

async function handleChangePassword(payload = {}, session) {
  const adminSession = assertAdminSession(session)
  const oldPassword = String(payload.oldPassword || '').trim()
  const newPassword = String(payload.newPassword || '').trim()

  if (!oldPassword || !newPassword) {
    throw new Error('璇疯緭鍏ユ棫瀵嗙爜鍜屾柊瀵嗙爜')
  }

  const admin = await getAdminByUsername(adminSession.username)
  if (!admin || !(await comparePassword(oldPassword, admin.password))) {
    throw new Error('鏃у瘑鐮佷笉姝ｇ‘')
  }

  await updateById('admins', admin.id, {
    password: await hashPassword(newPassword),
    updateTime: formatDateTime()
  })

  return { success: true }
}

async function handleListDistrictAdmins(payload = {}, session) {
  assertSuperAdminSession(session)
  const rows = await query(
    "SELECT id, username, role, district, createTime, updateTime FROM admins WHERE role = 'district' ORDER BY district ASC, username ASC"
  )
  return { list: rows.map(normalizeAdmin) }
}

async function handleSaveDistrictAdmin(payload = {}, session) {
  assertSuperAdminSession(session)
  const id = String(payload.id || '').trim()
  const username = String(payload.username || '').trim()
  const district = String(payload.district || '').trim()
  const password = String(payload.password || '').trim()

  if (!username) throw new Error('请输入辖区管理员用户名')
  if (!district) throw new Error('璇烽€夋嫨杈栧尯')
  if (!id && password.length < 6) throw new Error('新建账号密码不能少于 6 位')
  if (password && password.length < 6) throw new Error('密码不能少于 6 位')

  const duplicate = await getAdminByUsername(username)
  if (duplicate && duplicate.id !== id) {
    throw new Error('该用户名已存在')
  }

  const now = formatDateTime()
  if (id) {
    const existing = await one(
      "SELECT * FROM admins WHERE id = :id AND role = 'district' LIMIT 1",
      { id }
    )
    if (!existing) throw new Error('杈栧尯绠＄悊鍛樿处鍙蜂笉瀛樺湪')

    const updateData = {
      username,
      district,
      role: 'district',
      updateTime: now
    }
    if (password) {
      updateData.password = await hashPassword(password)
    }
    await updateById('admins', id, updateData)
    return { admin: normalizeAdmin({ ...existing, ...updateData }) }
  }

  const admin = {
    id: createId('admin'),
    username,
    password: await hashPassword(password),
    role: 'district',
    district,
    createTime: now,
    updateTime: now
  }
  await insertRow('admins', admin)
  return { admin: normalizeAdmin(admin) }
}

async function handleListDistrictAdminsV2(payload = {}, session) {
  assertSuperAdminSession(session)
  const rows = await query(
    "SELECT id, username, role, district, isDisabled, lastLoginTime, createTime, updateTime FROM admins WHERE role = 'district' ORDER BY district ASC, username ASC"
  )
  return { list: rows.map(normalizeAdmin) }
}

async function handleSaveDistrictAdminV2(payload = {}, session) {
  assertSuperAdminSession(session)
  const id = String(payload.id || '').trim()
  const username = String(payload.username || '').trim()
  const district = String(payload.district || '').trim()
  const password = String(payload.password || '').trim()
  const isDisabled = toBool(payload.isDisabled)

  if (!username) throw createServiceError('VALIDATION_ERROR', '请输入辖区管理员用户名')
  if (!district) throw createServiceError('VALIDATION_ERROR', '璇烽€夋嫨杈栧尯')
  if (!id && password.length < 6) throw createServiceError('VALIDATION_ERROR', '新建账号密码不能少于 6 位')
  if (password && password.length < 6) throw createServiceError('VALIDATION_ERROR', '密码不能少于 6 位')

  const duplicate = await getAdminByUsername(username)
  if (duplicate && duplicate.id !== id) {
    throw createServiceError('DUPLICATE_USERNAME', '该用户名已存在')
  }

  const now = formatDateTime()
  if (id) {
    const existing = await one(
      "SELECT * FROM admins WHERE id = :id AND role = 'district' LIMIT 1",
      { id }
    )
    if (!existing) throw createServiceError('ADMIN_NOT_FOUND', '杈栧尯绠＄悊鍛樿处鍙蜂笉瀛樺湪', 404)

    const updateData = {
      username,
      district,
      role: 'district',
      isDisabled,
      updateTime: now
    }
    if (password) {
      updateData.password = await hashPassword(password)
    }
    await updateById('admins', id, updateData)
    return { admin: normalizeAdmin({ ...existing, ...updateData }) }
  }

  const admin = {
    id: createId('admin'),
    username,
    password: await hashPassword(password),
    role: 'district',
    district,
    isDisabled,
    lastLoginTime: '',
    createTime: now,
    updateTime: now
  }
  await insertRow('admins', admin)
  return { admin: normalizeAdmin(admin) }
}

async function handleGetDashboard(payload = {}, session) {
  const admin = assertAdminSession(session)
  const scoped = buildAdminScope(admin)
  const [records, enterprises] = await Promise.all([
    listRows('pressure_records', {
      clauses: [...scoped.clauses, 'isDeleted = 0'],
      params: scoped.params
    }),
    listRows('enterprises', scoped)
  ])
  const visibleRecords = records.filter((record) => matchesStatisticsFilters(record, payload))

  let expiredCount = 0
  let expiringCount = 0
  const districtMap = new Map()
  const conclusionMap = new Map()
  const riskMap = new Map()

  visibleRecords.forEach((record) => {
    const district = record.district || '未分配'
    districtMap.set(district, (districtMap.get(district) || 0) + 1)

    const conclusion = record.conclusion || '鏈煡'
    conclusionMap.set(conclusion, (conclusionMap.get(conclusion) || 0) + 1)

    const expired = isExpiredDate(record.expiryDate)
    const expiring = !expired && isExpiringDate(record.expiryDate, 30)
    if (expired) expiredCount += 1
    if (expiring) expiringCount += 1

    if (expired || expiring) {
      const enterpriseName = record.enterpriseName || '未命名企业'
      if (!riskMap.has(enterpriseName)) {
        riskMap.set(enterpriseName, {
          enterpriseName,
          district: record.district || '',
          expiredCount: 0,
          expiringCount: 0,
          latestExpiryDate: formatDate(record.expiryDate),
          phone: ''
        })
      }

      const current = riskMap.get(enterpriseName)
      if (expired) current.expiredCount += 1
      if (expiring) current.expiringCount += 1

      const currentDate = formatDate(record.expiryDate)
      if (!current.latestExpiryDate || (currentDate && currentDate < current.latestExpiryDate)) {
        current.latestExpiryDate = currentDate
      }
    }
  })

  const phoneMap = normalizeReminderRecords(records, enterprises)
  const reminders = buildReminders(visibleRecords, {
    days: 30,
    limit: 8,
    phoneMap
  })

  const focusEnterprises = Array.from(riskMap.values())
    .map((item) => ({
      ...item,
      phone: phoneMap.get(item.enterpriseName) || item.phone
    }))
    .sort((a, b) => {
      if (b.expiredCount !== a.expiredCount) return b.expiredCount - a.expiredCount
      if (b.expiringCount !== a.expiringCount) return b.expiringCount - a.expiringCount
      return a.enterpriseName.localeCompare(b.enterpriseName)
    })
    .slice(0, 8)

  return {
    summary: {
      totalRecords: visibleRecords.length,
      expiredCount,
      expiringCount,
      enterpriseCount: enterprises.length
    },
    recentRecords: visibleRecords.slice(0, 8).map((item) => ({
      _id: item.id,
      certNo: item.certNo || '',
      factoryNo: item.factoryNo || '',
      enterpriseName: item.enterpriseName || '',
      district: item.district || '',
      conclusion: item.conclusion || '',
      verificationDate: formatDate(item.verificationDate),
      expiryDate: formatDate(item.expiryDate)
    })),
    districtStats: Array.from(districtMap.entries()).map(([name, value]) => ({ name, value })),
    conclusionStats: Array.from(conclusionMap.entries()).map(([name, value]) => ({ name, value })),
    monthStats: Array.from(visibleRecords.reduce((map, item) => {
      const month = formatDate(item.verificationDate || item.expiryDate).slice(0, 7) || '未记录'
      map.set(month, (map.get(month) || 0) + 1)
      return map
    }, new Map()).entries()).map(([name, value]) => ({ name, value })),
    riskStatusStats: Array.from(visibleRecords.reduce((map, item) => {
      const status = getRecordRiskStatus(item)
      map.set(status, (map.get(status) || 0) + 1)
      return map
    }, new Map()).entries()).map(([name, value]) => ({ name, value })),
    enterpriseOptions: Array.from(new Set(records.map((item) => item.enterpriseName).filter(Boolean))).sort(),
    focusEnterprises,
    todos: todos.slice(0, 20),
    calendarItems: reminders.map((item) => ({
      ...item,
      recordId: item.recordId || item.id || '',
      expiryDate: formatDate(item.expiryDate),
      statusGroup: isExpiredDate(item.expiryDate) ? 'expired' : 'expiring'
    })),
    reminders
  }
}

async function handleGetRecords(payload = {}, session) {
  const admin = assertAdminSession(session)
  const scoped = buildAdminScope(admin)
  const records = await listRows('pressure_records', {
    clauses: [...scoped.clauses, 'isDeleted = 0'],
    params: scoped.params
  })

  const keyword = String(payload.keyword || '').trim()
  const district = String(payload.district || '').trim()
  const enterpriseName = String(payload.enterpriseName || payload.enterprise || '').trim()
  const conclusion = String(payload.conclusion || '').trim()
  const filterType = String(payload.filterType || payload.filter || '').trim()
  const riskStatus = String(payload.riskStatus || '').trim()
  const month = String(payload.month || '').trim()
  const page = Number(payload.page || 1)
  const pageSize = Number(payload.pageSize || 20)

  const filtered = records.filter((item) => {
    if (district && district !== 'All' && item.district !== district) return false
    if (enterpriseName && item.enterpriseName !== enterpriseName) return false
    if (conclusion && item.conclusion !== conclusion) return false
    if (riskStatus && getRecordRiskStatus(item) !== riskStatus) return false
    if (month) {
      const dateText = formatDate(item.verificationDate || item.expiryDate)
      if (!dateText.startsWith(month)) return false
    }

    const expired = isExpiredDate(item.expiryDate)
    const expiring = !expired && isExpiringDate(item.expiryDate, 30)
    if (filterType === 'expired' && !expired) return false
    if (filterType === 'expiring' && !expiring) return false
    if (filterType === 'risk' && !(expired || expiring)) return false

    return matchKeyword([
      item.certNo,
      item.factoryNo,
      item.sendUnit,
      item.enterpriseName,
      item.instrumentName,
      item.deviceName,
      item.equipmentName,
      item.installLocation
    ], keyword)
  })

  return {
    list: filtered.slice((page - 1) * pageSize, page * pageSize).map(normalizeRecord),
    total: filtered.length,
    page,
    pageSize,
    enterpriseOptions: Array.from(new Set(records.map((item) => item.enterpriseName).filter(Boolean))).sort(),
    monthOptions: Array.from(new Set(records
      .map((item) => formatDate(item.verificationDate || item.expiryDate).slice(0, 7))
      .filter(Boolean))).sort().reverse()
  }
}

async function handleGetEnterprises(payload = {}, session) {
  const admin = assertAdminSession(session)
  const scoped = buildAdminScope(admin)
  const [records, enterprises] = await Promise.all([
    listRows('pressure_records', {
      clauses: [...scoped.clauses, 'isDeleted = 0'],
      params: scoped.params
    }),
    listRows('enterprises', scoped)
  ])

  const keyword = String(payload.keyword || '').trim()
  const statsMap = new Map()

  records.forEach((record) => {
    const enterpriseName = record.enterpriseName || '未命名企业'
    if (!statsMap.has(enterpriseName)) {
      statsMap.set(enterpriseName, {
        totalRecords: 0,
        expiredCount: 0,
        expiringCount: 0
      })
    }

    const current = statsMap.get(enterpriseName)
    current.totalRecords += 1
    if (isExpiredDate(record.expiryDate)) current.expiredCount += 1
    else if (isExpiringDate(record.expiryDate, 30)) current.expiringCount += 1
  })

  return {
    list: enterprises
      .map((item) => {
        const companyName = item.companyName || ''
        const stats = statsMap.get(companyName) || {
          totalRecords: 0,
          expiredCount: 0,
          expiringCount: 0
        }

        return {
          _id: item.id,
          companyName,
          district: item.district || '',
          phone: item.phone || '',
          contact: item.legalPerson || '',
          creditCode: item.creditCode || '',
          riskStatus: item.riskStatus || 'pending',
          riskStatusNote: item.riskStatusNote || '',
          riskStatusUpdateTime: item.riskStatusUpdateTime || '',
          totalRecords: stats.totalRecords,
          expiredCount: stats.expiredCount,
          expiringCount: stats.expiringCount,
          createdAt: formatDate(item.createTime || item.createdAt)
        }
      })
      .filter((item) => matchKeyword([
        item.companyName,
        item.contact,
        item.phone,
        item.district,
        item.creditCode
      ], keyword))
      .sort((a, b) => {
        if (b.expiredCount !== a.expiredCount) return b.expiredCount - a.expiredCount
        if (b.expiringCount !== a.expiringCount) return b.expiringCount - a.expiringCount
        return a.companyName.localeCompare(b.companyName)
      })
  }
}

async function handleEnterpriseLogin(payload = {}) {
  const companyName = String(payload.companyName || '').trim()
  const phone = String(payload.phone || '').trim()
  if (!companyName || !phone) {
    throw new Error('请输入企业名称和手机号')
  }

  const enterprise = await one(
    'SELECT * FROM enterprises WHERE companyName = :companyName AND phone = :phone LIMIT 1',
    { companyName, phone }
  )

  if (!enterprise) {
    throw new Error('浼佷笟鍚嶇О鎴栨墜鏈哄彿閿欒')
  }

  await updateById('enterprises', enterprise.id, {
    lastLoginTime: formatDateTime(),
    updateTime: formatDateTime()
  })

  return {
    enterprise: normalizeEnterprise(enterprise),
    token: buildEnterpriseToken(enterprise)
  }
}

async function handleEnterpriseRegister(payload = {}) {
  const companyName = String(payload.companyName || '').trim()
  const creditCode = String(payload.creditCode || '').trim().toUpperCase()
  const legalPerson = String(payload.legalPerson || '').trim()
  const phone = String(payload.phone || '').trim()
  const district = String(payload.district || '').trim()

  if (!companyName) throw new Error('请输入企业名称')
  if (!creditCode || creditCode.length !== 18) throw new Error('统一社会信用代码必须为 18 位')
  if (!legalPerson) throw new Error('请输入企业法人')
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error('请输入正确的手机号')
  if (!district) throw new Error('请选择所在辖区')

  const duplicate = await one(
    'SELECT * FROM enterprises WHERE companyName = :companyName OR creditCode = :creditCode OR phone = :phone LIMIT 1',
    { companyName, creditCode, phone }
  )

  if (duplicate?.companyName === companyName) throw new Error('企业名称已存在')
  if (duplicate?.creditCode === creditCode) throw new Error('统一社会信用代码已存在')
  if (duplicate?.phone === phone) throw new Error('鎵嬫満鍙峰凡瀛樺湪')

  const now = formatDateTime()
  const enterprise = {
    id: createId('ent'),
    companyName,
    creditCode,
    legalPerson,
    phone,
    district,
    authType: 'web',
    createTime: now,
    updateTime: now,
    lastLoginTime: now
  }

  await insertRow('enterprises', enterprise)

  return {
    enterprise: normalizeEnterprise(enterprise),
    token: buildEnterpriseToken(enterprise)
  }
}

async function handleGetEnterpriseDashboard(payload = {}, session) {
  const enterprise = assertEnterpriseSession(session)
  const companyName = buildEnterpriseScope(enterprise)
  const today = startOfToday()

  const [equipments, gauges, records, aiJobs] = await Promise.all([
    listRows('equipments', {
      clauses: ['enterpriseName = :companyName', 'isDeleted = 0'],
      params: { companyName }
    }),
    listRows('devices', {
      clauses: ['enterpriseName = :companyName', 'isDeleted = 0'],
      params: { companyName }
    }),
    listRows('pressure_records', {
      clauses: ['enterpriseName = :companyName', 'isDeleted = 0'],
      params: { companyName }
    }),
    listRows('ai_recognition_jobs', {
      clauses: ['ownerId = :ownerId'],
      params: { ownerId: enterprise.id },
      orderBy: 'updatedAt'
    })
  ])

  const reminders = buildReminders(records, {
    days: 30,
    limit: 60,
    phoneMap: new Map([[companyName, enterprise.phone || '']])
  })

  const todos = records
    .map(buildEnterpriseTodo)
    .filter(Boolean)
    .filter((item) => item.remediationStatus !== 'closed')
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1
      return String(a.expiryDate || '').localeCompare(String(b.expiryDate || ''))
    })

  return {
    summary: {
      equipmentCount: equipments.length,
      gaugeCount: gauges.length,
      expiredCount: records.filter((item) => isExpiredDate(item.expiryDate)).length,
      expiringCount: records.filter((item) => !isExpiredDate(item.expiryDate) && isExpiringDate(item.expiryDate, 30)).length,
      nonConformingCount: records.filter((item) => String(item.conclusion || '').includes('不合格')).length,
      missingLocationCount: records.filter((item) => !String(item.installLocation || '').trim()).length,
      inactiveCount: gauges.filter((item) => ['停用', '报废', '鍋滅敤', '鎶ュ簾'].includes(item.status)).length,
      unboundCount: equipments.filter((item) => Number(item.gaugeCount || 0) === 0).length,
      todoCount: todos.length,
      missingPhotoCount: records.filter((item) => !Number(item.hasInstallPhoto || 0)).length
    },
    recentRecords: records.slice(0, 8).map((item) => ({
      _id: item.id,
      certNo: item.certNo || '',
      factoryNo: item.factoryNo || '',
      instrumentName: item.instrumentName || '',
      equipmentName: item.equipmentName || '',
      conclusion: item.conclusion || '',
      verificationDate: formatDate(item.verificationDate),
      expiryDate: formatDate(item.expiryDate),
      isExpired: !!item.expiryDate && new Date(item.expiryDate) < today
    })),
    unboundEquipments: equipments
      .filter((item) => Number(item.gaugeCount || 0) === 0)
      .slice(0, 8)
      .map((item) => ({
        _id: item.id,
        equipmentName: item.equipmentName || '',
        equipmentNo: item.equipmentNo || '',
        location: item.location || ''
      })),
    todos: todos.slice(0, 20),
    calendarItems: reminders.map((item) => ({
      ...item,
      recordId: item.recordId || item.id || '',
      expiryDate: formatDate(item.expiryDate),
      statusGroup: isExpiredDate(item.expiryDate) ? 'expired' : 'expiring'
    })),
    recentTasks: aiJobs.slice(0, 8).map((item) => ({
      jobId: item.id,
      name: item.name || '识别任务',
      fileType: item.fileType || 'image',
      status: item.status || 'queued',
      stage: item.stage || '',
      progress: Number(item.progress || 0),
      summary: item.summary || item.error || '',
      updatedAt: item.updatedAt || 0,
      durationMs: Number(item.durationMs || 0)
    })),
    reminders
  }
}

async function handleGetEnterpriseEquipments(payload = {}, session) {
  const enterprise = assertEnterpriseSession(session)
  const companyName = buildEnterpriseScope(enterprise)
  const keyword = String(payload.keyword || '').trim()
  const list = await listRows('equipments', {
    clauses: ['enterpriseName = :companyName', 'isDeleted = 0'],
    params: { companyName }
  })

  return {
    list: list
      .filter((item) => matchKeyword([item.equipmentName, item.equipmentNo, item.location], keyword))
      .map((item) => ({
        _id: item.id,
        equipmentName: item.equipmentName || '',
        equipmentNo: item.equipmentNo || '',
        location: item.location || '',
        district: item.district || '',
        gaugeCount: Number(item.gaugeCount || 0),
        createTime: formatDate(item.createTime)
      }))
  }
}

async function handleSaveEnterpriseEquipment(payload = {}, session) {
  const enterprise = assertEnterpriseSession(session)
  const companyName = buildEnterpriseScope(enterprise)
  const data = payload.data || {}
  const equipmentName = String(data.equipmentName || '').trim()
  if (!equipmentName) throw new Error('璁惧鍚嶇О涓嶈兘涓虹┖')

  const now = formatDateTime()
  const row = {
    equipmentNo: String(data.equipmentNo || '').trim() || `EQ-${Date.now()}`,
    equipmentName,
    enterpriseId: enterprise.id,
    enterpriseName: companyName,
    district: String(data.district || enterprise.district || '').trim(),
    location: String(data.location || '').trim(),
    gaugeCount: Number(data.gaugeCount || 0),
    isDeleted: 0,
    updateTime: now
  }

  if (data._id) {
    await updateById('equipments', String(data._id), row)
    return { _id: String(data._id), ...row }
  }

  const nextRow = {
    id: createId('eq'),
    ...row,
    deletedAt: '',
    deletedBy: '',
    deletedById: '',
    createTime: now
  }

  await insertRow('equipments', nextRow)
  return { _id: nextRow.id, ...row }
}

async function handleDeleteEnterpriseEquipment(payload = {}, session) {
  const enterprise = assertEnterpriseSession(session)
  const companyName = buildEnterpriseScope(enterprise)
  const targetId = String(payload.id || '').trim()
  if (!targetId) throw new Error('璁惧缂栧彿涓嶈兘涓虹┖')

  return withTransaction(async (connection) => {
    const current = await one('SELECT * FROM equipments WHERE id = :id LIMIT 1', { id: targetId }, connection)
    if (!current || current.enterpriseName !== companyName) {
      throw new Error('璁惧涓嶅瓨鍦ㄦ垨鏃犳潈鎿嶄綔')
    }

    const now = formatDateTime()
    await updateById('equipments', targetId, {
      isDeleted: 1,
      deletedAt: now,
      deletedBy: companyName,
      deletedById: enterprise.id,
      updateTime: now
    }, connection)

    await insertRow('deletion_logs', {
      id: createId('del'),
      enterpriseName: companyName,
      targetType: 'equipment',
      targetId,
      targetName: current.equipmentName || '',
      operatorName: companyName,
      operatorId: enterprise.id,
      deleteTime: now,
      snapshot: JSON.stringify(current)
    }, connection)

    return { success: true }
  })
}

async function handleGetEnterpriseGauges(payload = {}, session) {
  const enterprise = assertEnterpriseSession(session)
  const companyName = buildEnterpriseScope(enterprise)
  const keyword = String(payload.keyword || '').trim()
  const status = String(payload.status || '').trim()
  const list = await listRows('devices', {
    clauses: ['enterpriseName = :companyName', 'isDeleted = 0'],
    params: { companyName }
  })

  return {
    list: list
      .filter((item) => !status || item.status === status)
      .filter((item) => matchKeyword([
        item.deviceName,
        item.deviceNo,
        item.factoryNo,
        item.equipmentName,
        item.modelSpec,
        item.installLocation
      ], keyword))
      .map((item) => ({
        _id: item.id,
        deviceName: item.deviceName || '',
        deviceNo: item.deviceNo || '',
        factoryNo: item.factoryNo || '',
        equipmentId: item.equipmentId || '',
        equipmentName: item.equipmentName || '',
        installLocation: item.installLocation || '',
        status: item.status || '',
        manufacturer: item.manufacturer || '',
        modelSpec: item.modelSpec || '',
        createTime: formatDate(item.createTime)
      }))
  }
}

async function handleGetEnterpriseRecords(payload = {}, session) {
  const enterprise = assertEnterpriseSession(session)
  const companyName = buildEnterpriseScope(enterprise)
  const keyword = String(payload.keyword || '').trim()
  const filterType = String(payload.filterType || '').trim()
  const remediationStatus = String(payload.remediationStatus || '').trim()
  const equipmentName = String(payload.equipmentName || '').trim()
  const installLocation = String(payload.installLocation || '').trim()
  const records = await listRows('pressure_records', {
    clauses: ['enterpriseName = :companyName', 'isDeleted = 0'],
    params: { companyName }
  })

  return {
    list: records
      .filter((item) => {
        const expired = isExpiredDate(item.expiryDate)
        if (filterType === 'expired' && !expired) return false
        if (filterType === 'expiring' && (expired || !isExpiringDate(item.expiryDate, 30))) return false
        if (filterType === 'todo' && !getEnterpriseTodoReason(item)) return false
        if (remediationStatus && String(item.remediationStatus || 'pending') !== remediationStatus) return false
        if (equipmentName && String(item.equipmentName || '') !== equipmentName) return false
        if (installLocation && !String(item.installLocation || '').includes(installLocation)) return false
        return true
      })
      .filter((item) => matchKeyword([
        item.certNo,
        item.factoryNo,
        item.instrumentName,
        item.equipmentName,
        item.deviceName,
        item.installLocation
      ], keyword))
      .map((item) => ({
        _id: item.id,
        certNo: item.certNo || '',
        factoryNo: item.factoryNo || '',
        instrumentName: item.instrumentName || '',
        equipmentName: item.equipmentName || '',
        installLocation: item.installLocation || '',
        hasImage: !!Number(item.hasImage || 0),
        hasInstallPhoto: !!Number(item.hasInstallPhoto || 0),
        installPhotoFileID: item.installPhotoFileID || '',
        conclusion: item.conclusion || '',
        verificationDate: formatDate(item.verificationDate),
        expiryDate: formatDate(item.expiryDate),
        status: item.status || '',
        riskType: getRecordRiskType(item),
        remediationStatus: item.remediationStatus || 'pending',
        remediationNote: item.remediationNote || '',
        remediationUpdateTime: item.remediationUpdateTime || ''
      }))
  }
}

async function handleSendReminderSms(payload = {}, session) {
  if (!session || !['admin', 'enterprise'].includes(session.userType)) {
    const error = new Error('鐭俊鎻愰啋闇€瑕佺櫥褰曞悗浣跨敤')
    error.statusCode = 401
    throw error
  }

  return createSmsPlaceholder(payload, session, config.sms)
}

async function handleUpdateEnterpriseRecordRemediation(payload = {}, session) {
  const enterprise = assertEnterpriseSession(session)
  const companyName = buildEnterpriseScope(enterprise)
  const id = String(payload.id || payload.recordId || '').trim()
  const remediationStatus = String(payload.remediationStatus || 'pending').trim()
  const remediationNote = String(payload.remediationNote || '').trim()
  const allowed = new Set(['pending', 'notified', 'rechecked', 'closed'])
  if (!id) throw createServiceError('VALIDATION_ERROR', '缺少记录编号')
  if (!allowed.has(remediationStatus)) throw createServiceError('VALIDATION_ERROR', '处置状态不正确')

  const record = await one('SELECT * FROM pressure_records WHERE id = :id AND isDeleted = 0 LIMIT 1', { id })
  if (!record || record.enterpriseName !== companyName) {
    throw createServiceError('RECORD_NOT_FOUND', '台账记录不存在或无权操作', 404)
  }

  const updateData = {
    remediationStatus,
    remediationNote,
    remediationUpdateTime: formatDateTime(),
    updateTime: formatDateTime()
  }
  await updateById('pressure_records', id, updateData)

  return {
    success: true,
    record: normalizeRecord({ ...record, ...updateData })
  }
}

async function handleBatchSendReminderSms(payload = {}, session) {
  const admin = assertAdminSession(session)
  const ids = Array.isArray(payload.ids) ? payload.ids.map((id) => String(id).trim()).filter(Boolean) : []
  if (!ids.length) throw createServiceError('VALIDATION_ERROR', '璇烽€夋嫨闇€瑕佸彂閫佹彁閱掔殑鍙拌处璁板綍')

  const scoped = buildAdminScope(admin)
  const records = await listRows('pressure_records', {
    clauses: [...scoped.clauses, 'isDeleted = 0'],
    params: scoped.params
  })
  const selected = records.filter((item) => ids.includes(item.id))
  if (!selected.length) throw createServiceError('RECORD_NOT_FOUND', '鏈壘鍒板彲鍙戦€佹彁閱掔殑璁板綍', 404)

  const enterpriseRows = await listRows('enterprises', scoped)
  const phoneMap = normalizeReminderRecords(selected, enterpriseRows)
  const sentAt = formatDateTime()
  const reminders = selected.map((record) => createSmsPlaceholder({
    recordId: record.id,
    certNo: record.certNo,
    enterpriseName: record.enterpriseName,
    phone: phoneMap.get(record.enterpriseName) || record.enterprisePhone || '',
    expiryDate: formatDate(record.expiryDate),
    message: `${record.enterpriseName || '相关企业'}的压力表 ${record.certNo || record.factoryNo || ''} 将于 ${formatDate(record.expiryDate) || '近期'} 到期，请尽快安排复检。`
  }, session, config.sms))

  return {
    success: true,
    sentAt,
    total: selected.length,
    list: reminders
  }
}

async function handleUpdateRecord(payload = {}, session) {
  const admin = assertAdminSession(session)
  const id = String(payload.id || payload._id || '').trim()
  const data = payload.data || {}
  const note = String(payload.note || '').trim()
  if (!id) throw createServiceError('VALIDATION_ERROR', '缂哄皯璁板綍缂栧彿')

  const existing = await one('SELECT * FROM pressure_records WHERE id = :id AND isDeleted = 0 LIMIT 1', { id })
  if (!existing) throw createServiceError('RECORD_NOT_FOUND', '台账记录不存在', 404)
  if (admin.role === 'district' && admin.district && existing.district !== admin.district) {
    throw createServiceError('FORBIDDEN', '鏃犳潈淇敼鍏朵粬杈栧尯璁板綍', 403)
  }

  const allowedFields = [
    'certNo',
    'factoryNo',
    'sendUnit',
    'instrumentName',
    'modelSpec',
    'manufacturer',
    'verificationStd',
    'conclusion',
    'verificationDate',
    'expiryDate',
    'district',
    'enterpriseName',
    'equipmentName',
    'installLocation',
    'riskStatus'
  ]
  const updateData = {}
  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      updateData[field] = String(data[field] ?? '').trim()
    }
  })
  if (!Object.keys(updateData).length) {
    throw createServiceError('VALIDATION_ERROR', '娌℃湁鍙繚瀛樼殑淇敼鍐呭')
  }
  updateData.updateTime = formatDateTime()

  await withTransaction(async (connection) => {
    await updateById('pressure_records', id, updateData, connection)
    await insertRow('record_revision_logs', {
      id: createId('rev'),
      recordId: id,
      operatorId: admin.id,
      operatorName: admin.username,
      beforeJson: JSON.stringify(normalizeRecord(existing)),
      afterJson: JSON.stringify({ ...normalizeRecord(existing), ...updateData }),
      note,
      createTime: updateData.updateTime
    }, connection)
  })

  return {
    success: true,
    record: normalizeRecord({ ...existing, ...updateData })
  }
}

async function handleGetRecordRevisionLogs(payload = {}, session) {
  const admin = assertAdminSession(session)
  const recordId = String(payload.recordId || payload.id || '').trim()
  if (!recordId) throw createServiceError('VALIDATION_ERROR', '缂哄皯璁板綍缂栧彿')

  const record = await one('SELECT * FROM pressure_records WHERE id = :id LIMIT 1', { id: recordId })
  if (!record) throw createServiceError('RECORD_NOT_FOUND', '台账记录不存在', 404)
  if (admin.role === 'district' && admin.district && record.district !== admin.district) {
    throw createServiceError('FORBIDDEN', '鏃犳潈鏌ョ湅鍏朵粬杈栧尯璁板綍', 403)
  }

  const rows = await query(
    'SELECT * FROM record_revision_logs WHERE recordId = :recordId ORDER BY createTime DESC',
    { recordId }
  )
  return {
    list: rows.map((item) => ({
      id: item.id,
      recordId: item.recordId,
      operatorName: item.operatorName || '',
      note: item.note || '',
      createTime: item.createTime || '',
      before: item.beforeJson ? JSON.parse(item.beforeJson) : null,
      after: item.afterJson ? JSON.parse(item.afterJson) : null
    }))
  }
}

async function handleUpdateEnterpriseRiskStatus(payload = {}, session) {
  const admin = assertAdminSession(session)
  const id = String(payload.id || payload._id || '').trim()
  const companyName = String(payload.companyName || '').trim()
  const riskStatus = String(payload.riskStatus || 'pending').trim()
  const riskStatusNote = String(payload.riskStatusNote || '').trim()
  const allowed = new Set(['pending', 'notified', 'rechecked', 'closed'])
  if (!allowed.has(riskStatus)) throw createServiceError('VALIDATION_ERROR', '风险处置状态不正确')

  const enterprise = id
    ? await one('SELECT * FROM enterprises WHERE id = :id LIMIT 1', { id })
    : await one('SELECT * FROM enterprises WHERE companyName = :companyName LIMIT 1', { companyName })
  if (!enterprise) throw createServiceError('ENTERPRISE_NOT_FOUND', '企业不存在', 404)
  if (admin.role === 'district' && admin.district && enterprise.district !== admin.district) {
    throw createServiceError('FORBIDDEN', '鏃犳潈淇敼鍏朵粬杈栧尯浼佷笟', 403)
  }

  const now = formatDateTime()
  await updateById('enterprises', enterprise.id, {
    riskStatus,
    riskStatusNote,
    riskStatusUpdateTime: now,
    updateTime: now
  })

  return {
    success: true,
    enterprise: {
      ...normalizeEnterprise(enterprise),
      riskStatus,
      riskStatusNote,
      riskStatusUpdateTime: now
    }
  }
}

async function handleListOperationLogs(payload = {}, session) {
  assertSuperAdminSession(session)
  const category = String(payload.category || '').trim()
  const success = String(payload.success || '').trim()
  const keyword = String(payload.keyword || '').trim().toLowerCase()
  const page = Math.max(Number(payload.page || 1), 1)
  const pageSize = Math.min(Math.max(Number(payload.pageSize || 20), 1), 100)

  const rows = await listRows('operation_logs', {
    orderBy: 'createTime'
  })

  const filtered = rows.filter((item) => {
    if (category && item.category !== category) return false
    if (success === 'success' && !Number(item.success || 0)) return false
    if (success === 'failed' && Number(item.success || 0)) return false
    if (!keyword) return true
    return [
      item.action,
      item.operatorName,
      item.targetType,
      item.targetId,
      item.message,
      item.errorCode
    ].some((field) => String(field || '').toLowerCase().includes(keyword))
  })

  return {
    list: filtered.slice((page - 1) * pageSize, page * pageSize).map((item) => ({
      id: item.id,
      category: item.category || '',
      action: item.action || '',
      success: !!Number(item.success || 0),
      operatorType: item.operatorType || '',
      operatorId: item.operatorId || '',
      operatorName: item.operatorName || '',
      targetType: item.targetType || '',
      targetId: item.targetId || '',
      message: item.message || '',
      errorCode: item.errorCode || '',
      durationMs: Number(item.durationMs || 0),
      createTime: item.createTime || ''
    })),
    total: filtered.length,
    page,
    pageSize
  }
}

async function handleExportEnterpriseCompliancePackage(payload = {}, session) {
  const enterprise = assertEnterpriseSession(session)
  const companyName = buildEnterpriseScope(enterprise)
  const equipmentName = String(payload.equipmentName || '').trim()
  const month = String(payload.month || '').trim()

  const [records, logs] = await Promise.all([
    listRows('pressure_records', {
      clauses: ['enterpriseName = :companyName', 'isDeleted = 0'],
      params: { companyName }
    }),
    listRows('operation_logs', {
      clauses: ['operatorType = :operatorType', 'operatorId = :operatorId'],
      params: { operatorType: 'enterprise', operatorId: enterprise.id },
      orderBy: 'createTime'
    })
  ])

  const filteredRecords = records.filter((item) => {
    if (equipmentName && item.equipmentName !== equipmentName) return false
    if (month) {
      const dateText = formatDate(item.verificationDate || item.expiryDate)
      if (!dateText.startsWith(month)) return false
    }
    return true
  })

  return {
    exportedAt: formatDateTime(),
    enterprise: normalizeEnterprise(enterprise),
    filters: { equipmentName, month },
    records: filteredRecords.map(normalizeRecord),
    evidence: filteredRecords.map((item) => ({
      recordId: item.id,
      certNo: item.certNo || '',
      certificateImage: item.fileID || '',
      installPhoto: item.installPhotoFileID || '',
      hasCertificateImage: !!Number(item.hasImage || 0),
      hasInstallPhoto: !!Number(item.hasInstallPhoto || 0)
    })),
    remediation: filteredRecords.map((item) => ({
      recordId: item.id,
      certNo: item.certNo || '',
      remediationStatus: item.remediationStatus || 'pending',
      remediationNote: item.remediationNote || '',
      remediationUpdateTime: item.remediationUpdateTime || ''
    })),
    operationLogs: logs.slice(0, 200).map((item) => ({
      action: item.action || '',
      success: !!Number(item.success || 0),
      operatorName: item.operatorName || '',
      targetType: item.targetType || '',
      targetId: item.targetId || '',
      message: item.message || '',
      createTime: item.createTime || ''
    }))
  }
}

async function handleParseEnterpriseExcel(payload = {}, session) {
  assertEnterpriseSession(session)
  return parseEnterpriseExcel(payload)
}

async function handleSaveEnterpriseAiRecord(payload = {}, session) {
  const enterprise = assertEnterpriseSession(session)
  const companyName = buildEnterpriseScope(enterprise)
  const extractedData = payload.extractedData || {}
  const equipmentId = String(payload.equipmentId || '').trim()
  const fileID = String(payload.fileID || '').trim()
  const installPhotoFileID = String(payload.installPhotoFileID || '').trim()
  if (!equipmentId) throw new Error('请选择所属设备')

  const parsedVerificationDate = parseDateInput(extractedData.verificationDate)
  if (!parsedVerificationDate) {
    throw new Error('检定日期不能为空')
  }

  const installLocation = String(payload.installLocation || extractedData.installLocation || '').trim()
  if (!installLocation) {
    throw new Error('璇峰～鍐欒鍘嬪姏琛ㄧ殑瀹夎浣嶇疆')
  }

  return withTransaction(async (connection) => {
    const equipment = await one('SELECT * FROM equipments WHERE id = :id LIMIT 1', { id: equipmentId }, connection)
    if (!equipment || equipment.isDeleted) {
      throw new Error('鎵€灞炶澶囦笉瀛樺湪')
    }
    if (equipment.enterpriseName !== companyName) {
      throw new Error('鏃犳潈淇濆瓨鍒拌璁惧')
    }

    const now = formatDateTime()
    const verificationDate = formatDate(parsedVerificationDate)
    const deviceId = createId('dev')
    const recordId = createId('rec')
    const deviceNo = `DEV-${Date.now()}`
    const deviceName = String(extractedData.instrumentName || '压力表').trim() || '压力表'
    const factoryNo = String(extractedData.factoryNo || '').trim()
    const modelSpec = String(extractedData.modelSpec || '').trim()
    const manufacturer = String(extractedData.manufacturer || '').trim()
    const conclusion = String(extractedData.conclusion || '合格').trim() || '合格'
    const sendUnit = String(extractedData.sendUnit || '').trim()
    const certNo = String(extractedData.certNo || '').trim()
    const verificationStd = String(extractedData.verificationStd || '').trim()
    const district = String(extractedData.district || equipment.district || enterprise.district || '').trim()
    const gaugeStatus = String(extractedData.gaugeStatus || '在用').trim() || '在用'

    await insertRow('devices', {
      id: deviceId,
      deviceNo,
      deviceName,
      deviceType: 'pressure_gauge',
      enterpriseId: enterprise.id,
      enterpriseName: companyName,
      district,
      factoryNo,
      certNo,
      equipmentId: equipment.id,
      equipmentName: equipment.equipmentName || '',
      status: gaugeStatus,
      manufacturer,
      modelSpec,
      installLocation,
      recordCount: 1,
      isDeleted: 0,
      deletedAt: '',
      deletedBy: '',
      deletedById: '',
      createTime: now,
      updateTime: now
    }, connection)

    await insertRow('pressure_records', {
      id: recordId,
      certNo,
      sendUnit,
      instrumentName: deviceName,
      modelSpec,
      factoryNo,
      manufacturer,
      verificationStd,
      conclusion,
      verificationDate,
      expiryDate: calculateExpiryDate(verificationDate),
      district,
      status: 'valid',
      isDeleted: 0,
      deletedAt: '',
      deletedBy: '',
      createTime: now,
      updateTime: now,
      ocrSource: 'web_ai_assistant_server',
      hasImage: toBool(fileID),
      hasInstallPhoto: toBool(installPhotoFileID),
      fileID,
      installPhotoFileID,
      enterpriseId: enterprise.id,
      enterpriseName: companyName,
      enterprisePhone: enterprise.phone || '',
      enterpriseLegalPerson: enterprise.legalPerson || '',
      createdBy: 'enterprise_web_server',
      equipmentId: equipment.id,
      equipmentName: equipment.equipmentName || '',
      deviceId,
      deviceName,
      deviceNo,
      deviceStatus: gaugeStatus,
      installLocation
    }, connection)

    const countRow = await one(
      'SELECT COUNT(*) AS total FROM devices WHERE equipmentId = :equipmentId AND isDeleted = 0',
      { equipmentId: equipment.id },
      connection
    )

    await updateById('equipments', equipment.id, {
      gaugeCount: Number(countRow?.total || 0),
      updateTime: now
    }, connection)

    return {
      success: true,
      recordId,
      deviceId,
      equipmentId: equipment.id
    }
  })
}

async function handleSubmitEnterpriseRecognitionTask(payload = {}, session) {
  assertEnterpriseSession(session)
  return submitEnterpriseRecognitionTask(payload, session)
}

async function handleGetEnterpriseRecognitionTask(payload = {}, session) {
  assertEnterpriseSession(session)
  return getEnterpriseRecognitionTask(payload, session)
}

async function handleListEnterpriseRecognitionTasks(payload = {}, session) {
  assertEnterpriseSession(session)
  return listEnterpriseRecognitionTasks(payload, session)
}

async function handleDeleteEnterpriseRecognitionTask(payload = {}, session) {
  assertEnterpriseSession(session)
  return deleteEnterpriseRecognitionTask(payload, session)
}

async function handleClearCompletedRecognitionTasks(payload = {}, session) {
  assertEnterpriseSession(session)
  return clearCompletedRecognitionTasks(payload, session)
}

async function handleRetryEnterpriseRecognitionTask(payload = {}, session) {
  assertEnterpriseSession(session)
  return retryEnterpriseRecognitionTask(payload, session)
}

async function handleBatchRetryEnterpriseRecognitionTasks(payload = {}, session) {
  assertEnterpriseSession(session)
  return batchRetryEnterpriseRecognitionTasks(payload, session)
}

async function dispatchAdminAction(action, payload = {}, session = null) {
  if (action === 'login') return handleLogin(payload)
  if (action === 'changePassword') return handleChangePassword(payload, session)
  if (action === 'listDistrictAdmins') return handleListDistrictAdminsV2(payload, session)
  if (action === 'saveDistrictAdmin') return handleSaveDistrictAdminV2(payload, session)
  if (action === 'getDashboard') return handleGetDashboard(payload, session)
  if (action === 'getRecords') return handleGetRecords(payload, session)
  if (action === 'getEnterprises') return handleGetEnterprises(payload, session)
  if (action === 'enterpriseLogin') return handleEnterpriseLogin(payload)
  if (action === 'enterpriseRegister') return handleEnterpriseRegister(payload)
  if (action === 'getEnterpriseDashboard') return handleGetEnterpriseDashboard(payload, session)
  if (action === 'getEnterpriseEquipments') return handleGetEnterpriseEquipments(payload, session)
  if (action === 'saveEnterpriseEquipment') return handleSaveEnterpriseEquipment(payload, session)
  if (action === 'deleteEnterpriseEquipment') return handleDeleteEnterpriseEquipment(payload, session)
  if (action === 'getEnterpriseGauges') return handleGetEnterpriseGauges(payload, session)
  if (action === 'getEnterpriseRecords') return handleGetEnterpriseRecords(payload, session)
  if (action === 'updateEnterpriseRecordRemediation') return handleUpdateEnterpriseRecordRemediation(payload, session)
  if (action === 'sendReminderSms') return handleSendReminderSms(payload, session)
  if (action === 'batchSendReminderSms') return handleBatchSendReminderSms(payload, session)
  if (action === 'updateRecord') return handleUpdateRecord(payload, session)
  if (action === 'getRecordRevisionLogs') return handleGetRecordRevisionLogs(payload, session)
  if (action === 'updateEnterpriseRiskStatus') return handleUpdateEnterpriseRiskStatus(payload, session)
  if (action === 'listOperationLogs') return handleListOperationLogs(payload, session)
  if (action === 'parseEnterpriseExcel') return handleParseEnterpriseExcel(payload, session)
  if (action === 'saveEnterpriseAiRecord') return handleSaveEnterpriseAiRecord(payload, session)
  if (action === 'submitEnterpriseRecognitionTask') return handleSubmitEnterpriseRecognitionTask(payload, session)
  if (action === 'getEnterpriseRecognitionTask') return handleGetEnterpriseRecognitionTask(payload, session)
  if (action === 'listEnterpriseRecognitionTasks') return handleListEnterpriseRecognitionTasks(payload, session)
  if (action === 'deleteEnterpriseRecognitionTask') return handleDeleteEnterpriseRecognitionTask(payload, session)
  if (action === 'clearCompletedRecognitionTasks') return handleClearCompletedRecognitionTasks(payload, session)
  if (action === 'retryEnterpriseRecognitionTask') return handleRetryEnterpriseRecognitionTask(payload, session)
  if (action === 'batchRetryEnterpriseRecognitionTasks') return handleBatchRetryEnterpriseRecognitionTasks(payload, session)

  throw new Error(`Unsupported admin action: ${action}`)
}

async function handleAdminAction(action, payload = {}, session = null) {
  const startedAt = Date.now()
  let fallback = {}

  try {
    const data = await dispatchAdminAction(action, payload, session)

    if (action === 'login' && data?.admin) {
      fallback = {
        operatorType: 'admin',
        operatorId: data.admin.id,
        operatorName: data.admin.username
      }
    }
    if (action === 'enterpriseLogin' && data?.enterprise) {
      fallback = {
        operatorType: 'enterprise',
        operatorId: data.enterprise.id,
        operatorName: data.enterprise.companyName
      }
    }

    await writeOperationLog({
      action,
      payload,
      session,
      success: true,
      message: 'ok',
      durationMs: Date.now() - startedAt,
      fallback
    })

    return data
  } catch (error) {
    await writeOperationLog({
      action,
      payload,
      session,
      success: false,
      message: error.message || 'failed',
      errorCode: error.code || 'ACTION_FAILED',
      durationMs: Date.now() - startedAt
    })

    if (!error.code) {
      error.code = 'ACTION_FAILED'
    }
    throw error
  }
}

module.exports = {
  handleAdminAction
}

