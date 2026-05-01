const crypto = require('crypto')
const config = require('../config')
const { one, query, exec, withTransaction } = require('../lib/db')
const { comparePassword, hashPassword, signSessionToken } = require('../lib/auth')
const { parseEnterpriseExcel } = require('./excelService')
const { buildReminders, createSmsPlaceholder } = require('./reminderService')
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

function normalizeAdmin(admin) {
  return {
    id: admin.id,
    username: admin.username,
    role: admin.role || 'admin',
    district: admin.district || ''
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

async function handleLogin(payload = {}) {
  const username = String(payload.username || '').trim()
  const password = String(payload.password || '').trim()
  if (!username || !password) {
    throw new Error('请输入用户名和密码')
  }

  const admin = await getAdminByUsername(username)
  if (!admin || !(await comparePassword(password, admin.password))) {
    throw new Error('用户名或密码错误')
  }

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
    throw new Error('请输入旧密码和新密码')
  }

  const admin = await getAdminByUsername(adminSession.username)
  if (!admin || !(await comparePassword(oldPassword, admin.password))) {
    throw new Error('旧密码不正确')
  }

  await updateById('admins', admin.id, {
    password: await hashPassword(newPassword),
    updateTime: formatDateTime()
  })

  return { success: true }
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

  let expiredCount = 0
  let expiringCount = 0
  const districtMap = new Map()
  const conclusionMap = new Map()
  const riskMap = new Map()

  records.forEach((record) => {
    const district = record.district || '未分配'
    districtMap.set(district, (districtMap.get(district) || 0) + 1)

    const conclusion = record.conclusion || '未知'
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
  const reminders = buildReminders(records, {
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
      totalRecords: records.length,
      expiredCount,
      expiringCount,
      enterpriseCount: enterprises.length
    },
    recentRecords: records.slice(0, 8).map((item) => ({
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
    focusEnterprises,
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
  const page = Number(payload.page || 1)
  const pageSize = Number(payload.pageSize || 20)

  const filtered = records.filter((item) => {
    if (district && district !== 'All' && item.district !== district) return false
    if (enterpriseName && item.enterpriseName !== enterpriseName) return false
    if (conclusion && item.conclusion !== conclusion) return false

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
    list: filtered.slice((page - 1) * pageSize, page * pageSize).map((item) => ({
      _id: item.id,
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
      installLocation: item.installLocation || ''
    })),
    total: filtered.length,
    page,
    pageSize,
    enterpriseOptions: Array.from(new Set(records.map((item) => item.enterpriseName).filter(Boolean))).sort()
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
    throw new Error('企业名称或手机号错误')
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
  if (duplicate?.phone === phone) throw new Error('手机号已存在')

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

  const [equipments, gauges, records] = await Promise.all([
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
    })
  ])

  const reminders = buildReminders(records, {
    days: 30,
    limit: 6,
    phoneMap: new Map([[companyName, enterprise.phone || '']])
  })

  return {
    summary: {
      equipmentCount: equipments.length,
      gaugeCount: gauges.length,
      expiredCount: records.filter((item) => isExpiredDate(item.expiryDate)).length,
      expiringCount: records.filter((item) => !isExpiredDate(item.expiryDate) && isExpiringDate(item.expiryDate, 30)).length,
      inactiveCount: gauges.filter((item) => ['停用', '报废'].includes(item.status)).length,
      unboundCount: equipments.filter((item) => Number(item.gaugeCount || 0) === 0).length
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
  if (!equipmentName) throw new Error('设备名称不能为空')

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
  if (!targetId) throw new Error('设备编号不能为空')

  return withTransaction(async (connection) => {
    const current = await one('SELECT * FROM equipments WHERE id = :id LIMIT 1', { id: targetId }, connection)
    if (!current || current.enterpriseName !== companyName) {
      throw new Error('设备不存在或无权操作')
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
        conclusion: item.conclusion || '',
        verificationDate: formatDate(item.verificationDate),
        expiryDate: formatDate(item.expiryDate),
        status: item.status || ''
      }))
  }
}

async function handleSendReminderSms(payload = {}, session) {
  if (!session || !['admin', 'enterprise'].includes(session.userType)) {
    const error = new Error('短信提醒需要登录后使用')
    error.statusCode = 401
    throw error
  }

  return createSmsPlaceholder(payload, session, config.sms)
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
  if (!equipmentId) throw new Error('请选择所属设备')

  const parsedVerificationDate = parseDateInput(extractedData.verificationDate)
  if (!parsedVerificationDate) {
    throw new Error('检定日期不能为空')
  }

  const installLocation = String(payload.installLocation || extractedData.installLocation || '').trim()
  if (!installLocation) {
    throw new Error('请填写该压力表的安装位置')
  }

  return withTransaction(async (connection) => {
    const equipment = await one('SELECT * FROM equipments WHERE id = :id LIMIT 1', { id: equipmentId }, connection)
    if (!equipment || equipment.isDeleted) {
      throw new Error('所属设备不存在')
    }
    if (equipment.enterpriseName !== companyName) {
      throw new Error('无权保存到该设备')
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
      hasInstallPhoto: 0,
      fileID,
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

async function handleAdminAction(action, payload = {}, session = null) {
  if (action === 'login') return handleLogin(payload)
  if (action === 'changePassword') return handleChangePassword(payload, session)
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
  if (action === 'sendReminderSms') return handleSendReminderSms(payload, session)
  if (action === 'parseEnterpriseExcel') return handleParseEnterpriseExcel(payload, session)
  if (action === 'saveEnterpriseAiRecord') return handleSaveEnterpriseAiRecord(payload, session)

  throw new Error(`Unsupported admin action: ${action}`)
}

module.exports = {
  handleAdminAction
}
