const crypto = require('crypto')
const { query, one, exec } = require('../lib/db')
const {
  formatDate,
  formatDateTime,
  startOfToday,
  isExpiredDate,
  isExpiringDate,
  parseDateInput,
  calculateExpiryDate
} = require('../utils/dates')

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`
}

function toBool(value) {
  return value ? 1 : 0
}

function normalizeRow(row) {
  if (!row) return null
  return { ...row, _id: row.id }
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
    companyName: enterprise.companyName || enterprise.enterpriseName || '',
    phone: enterprise.phone || enterprise.contactPhone || enterprise.legalPersonPhone || '',
    legalPerson: enterprise.legalPerson || enterprise.contact || '',
    creditCode: enterprise.creditCode || '',
    district: enterprise.district || ''
  }
}

function matchKeyword(fields, keyword) {
  if (!keyword) return true
  const normalized = String(keyword).trim().toLowerCase()
  if (!normalized) return true
  return fields.some((field) => String(field || '').toLowerCase().includes(normalized))
}

function buildScopedWhere(admin) {
  const clauses = []
  const params = {}
  if (admin && admin.role === 'district' && admin.district) {
    clauses.push('district = :district')
    params.district = admin.district
  }
  return { clauses, params }
}

function buildEnterpriseScope(enterprise) {
  const companyName = enterprise.companyName || enterprise.enterpriseName || ''
  if (!companyName) throw new Error('缺少企业身份')
  return companyName
}

async function listRows(table, options = {}) {
  const clauses = [...(options.clauses || [])]
  const params = { ...(options.params || {}) }
  const orderBy = options.orderBy || 'createTime'
  const direction = String(options.direction || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  return query(`SELECT * FROM ${table} ${whereSql} ORDER BY ${orderBy} ${direction}`, params)
}

async function getAdminByCredential(username, password) {
  return one(
    'SELECT * FROM admins WHERE username = :username AND password = :password LIMIT 1',
    { username, password }
  )
}

async function updateById(table, rowId, data) {
  const keys = Object.keys(data).filter((key) => data[key] !== undefined)
  if (!keys.length) return
  const sets = keys.map((key) => `${key} = :${key}`).join(', ')
  await exec(`UPDATE ${table} SET ${sets} WHERE id = :id`, { ...data, id: rowId })
}

async function insertRow(table, data) {
  const keys = Object.keys(data)
  const fields = keys.join(', ')
  const placeholders = keys.map((key) => `:${key}`).join(', ')
  await exec(`INSERT INTO ${table} (${fields}) VALUES (${placeholders})`, data)
  return data
}

async function handleLogin(payload = {}) {
  const username = String(payload.username || '').trim()
  const password = String(payload.password || '').trim()
  if (!username || !password) throw new Error('请输入用户名和密码')

  const admin = await getAdminByCredential(username, password)
  if (!admin) throw new Error('用户名或密码错误')

  return {
    admin: normalizeAdmin(admin),
    token: `web_admin_${Date.now()}`
  }
}

async function handleChangePassword(payload = {}) {
  const admin = payload.admin || {}
  const oldPassword = String(payload.oldPassword || '').trim()
  const newPassword = String(payload.newPassword || '').trim()

  if (!admin.username || !oldPassword || !newPassword) throw new Error('缺少必要参数')
  const target = await getAdminByCredential(admin.username, oldPassword)
  if (!target) throw new Error('原密码错误')

  await updateById('admins', target.id, {
    password: newPassword,
    updateTime: formatDateTime()
  })
  return { success: true }
}

async function handleGetDashboard(payload = {}) {
  const admin = payload.admin || {}
  const scoped = buildScopedWhere(admin)
  const records = await listRows('pressure_records', {
    clauses: [...scoped.clauses, 'isDeleted = 0'],
    params: scoped.params
  })
  const enterprises = await listRows('enterprises', scoped)

  let expiredCount = 0
  let expiringCount = 0
  const districtMap = new Map()
  const conclusionMap = new Map()
  const riskMap = new Map()

  records.forEach((record) => {
    const district = record.district || '未分配辖区'
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
      if (!current.latestExpiryDate || currentDate < current.latestExpiryDate) {
        current.latestExpiryDate = currentDate
      }
    }
  })

  const enterprisePhoneMap = new Map()
  enterprises.forEach((item) => {
    const name = item.companyName || item.enterpriseName
    if (name) enterprisePhoneMap.set(name, item.phone || item.contactPhone || item.legalPersonPhone || '')
  })

  const focusEnterprises = Array.from(riskMap.values())
    .map((item) => ({ ...item, phone: enterprisePhoneMap.get(item.enterpriseName) || item.phone }))
    .sort((a, b) => {
      if (b.expiredCount !== a.expiredCount) return b.expiredCount - a.expiredCount
      if (b.expiringCount !== a.expiringCount) return b.expiringCount - a.expiringCount
      return a.enterpriseName.localeCompare(b.enterpriseName)
    })
    .slice(0, 8)

  const recentRecords = records.slice(0, 8).map((item) => ({
    _id: item.id,
    certNo: item.certNo || '',
    factoryNo: item.factoryNo || '',
    enterpriseName: item.enterpriseName || '',
    district: item.district || '',
    conclusion: item.conclusion || '',
    verificationDate: formatDate(item.verificationDate),
    expiryDate: formatDate(item.expiryDate)
  }))

  return {
    summary: {
      totalRecords: records.length,
      expiredCount,
      expiringCount,
      enterpriseCount: focusEnterprises.length
    },
    recentRecords,
    districtStats: Array.from(districtMap.entries()).map(([name, value]) => ({ name, value })),
    conclusionStats: Array.from(conclusionMap.entries()).map(([name, value]) => ({ name, value })),
    focusEnterprises
  }
}

async function handleGetRecords(payload = {}) {
  const admin = payload.admin || {}
  const scoped = buildScopedWhere(admin)
  const records = await listRows('pressure_records', {
    clauses: [...scoped.clauses, 'isDeleted = 0'],
    params: scoped.params
  })

  const keyword = String(payload.keyword || '').trim()
  const district = String(payload.district || '').trim()
  const enterpriseName = String(payload.enterpriseName || '').trim()
  const conclusion = String(payload.conclusion || '').trim()
  const filterType = String(payload.filterType || '').trim()
  const page = Number(payload.page || 1)
  const pageSize = Number(payload.pageSize || 20)

  const filtered = records.filter((item) => {
    if (district && district !== '全部辖区' && item.district !== district) return false
    if (enterpriseName && enterpriseName !== '全部企业' && item.enterpriseName !== enterpriseName) return false
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
      item.equipmentName
    ], keyword)
  })

  const list = filtered.slice((page - 1) * pageSize, page * pageSize).map((item) => ({
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
    equipmentName: item.equipmentName || item.deviceName || ''
  }))

  const enterpriseOptions = Array.from(new Set(records.map((item) => item.enterpriseName).filter(Boolean))).sort()
  return { list, total: filtered.length, page, pageSize, enterpriseOptions }
}

async function handleGetEnterprises(payload = {}) {
  const admin = payload.admin || {}
  const scoped = buildScopedWhere(admin)
  const [records, enterprises] = await Promise.all([
    listRows('pressure_records', { clauses: [...scoped.clauses, 'isDeleted = 0'], params: scoped.params }),
    listRows('enterprises', scoped)
  ])

  const keyword = String(payload.keyword || '').trim()
  const recordMap = new Map()
  records.forEach((record) => {
    const enterpriseName = record.enterpriseName || '未命名企业'
    if (!recordMap.has(enterpriseName)) {
      recordMap.set(enterpriseName, { totalRecords: 0, expiredCount: 0, expiringCount: 0 })
    }
    const current = recordMap.get(enterpriseName)
    current.totalRecords += 1
    if (isExpiredDate(record.expiryDate)) current.expiredCount += 1
    else if (isExpiringDate(record.expiryDate, 30)) current.expiringCount += 1
  })

  const list = enterprises
    .map((item) => {
      const companyName = item.companyName || item.enterpriseName || ''
      const stats = recordMap.get(companyName) || { totalRecords: 0, expiredCount: 0, expiringCount: 0 }
      return {
        _id: item.id,
        companyName,
        district: item.district || '',
        phone: item.phone || item.contactPhone || item.legalPersonPhone || '',
        contact: item.contact || item.legalPerson || '',
        creditCode: item.creditCode || '',
        totalRecords: stats.totalRecords,
        expiredCount: stats.expiredCount,
        expiringCount: stats.expiringCount,
        createdAt: formatDate(item.createTime || item.createdAt)
      }
    })
    .filter((item) => matchKeyword([item.companyName, item.contact, item.phone, item.district, item.creditCode], keyword))
    .sort((a, b) => {
      if (b.expiredCount !== a.expiredCount) return b.expiredCount - a.expiredCount
      if (b.expiringCount !== a.expiringCount) return b.expiringCount - a.expiringCount
      return a.companyName.localeCompare(b.companyName)
    })

  return { list }
}

async function handleEnterpriseLogin(payload = {}) {
  const companyName = String(payload.companyName || '').trim()
  const phone = String(payload.phone || '').trim()
  if (!companyName || !phone) throw new Error('请输入企业名称和法人手机号')

  const enterprise = await one(
    'SELECT * FROM enterprises WHERE companyName = :companyName AND phone = :phone LIMIT 1',
    { companyName, phone }
  )
  if (!enterprise) throw new Error('企业名称或手机号不匹配')

  await updateById('enterprises', enterprise.id, {
    lastLoginTime: formatDateTime(),
    updateTime: formatDateTime()
  })

  return {
    enterprise: normalizeEnterprise(enterprise),
    token: `web_enterprise_${Date.now()}`
  }
}

async function handleEnterpriseRegister(payload = {}) {
  const companyName = String(payload.companyName || '').trim()
  const creditCode = String(payload.creditCode || '').trim().toUpperCase()
  const legalPerson = String(payload.legalPerson || '').trim()
  const phone = String(payload.phone || '').trim()
  const district = String(payload.district || '').trim()

  if (!companyName) throw new Error('请输入企业名称')
  if (!creditCode || creditCode.length !== 18) throw new Error('请输入18位统一社会信用代码')
  if (!legalPerson) throw new Error('请输入企业法人')
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error('请输入正确的法人手机号')
  if (!district) throw new Error('请选择辖区')

  const duplicate = await one(
    'SELECT * FROM enterprises WHERE companyName = :companyName OR creditCode = :creditCode OR phone = :phone LIMIT 1',
    { companyName, creditCode, phone }
  )
  if (duplicate?.companyName === companyName) throw new Error('该企业已注册')
  if (duplicate?.creditCode === creditCode) throw new Error('该统一社会信用代码已存在')
  if (duplicate?.phone === phone) throw new Error('该手机号已被注册')

  const now = formatDateTime()
  const row = {
    id: id('ent'),
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
  await insertRow('enterprises', row)
  return {
    enterprise: normalizeEnterprise(row),
    token: `web_enterprise_${Date.now()}`
  }
}

async function handleGetEnterpriseDashboard(payload = {}) {
  const enterprise = payload.enterprise || {}
  const companyName = buildEnterpriseScope(enterprise)
  const today = startOfToday()
  const [equipments, gauges, records] = await Promise.all([
    listRows('equipments', { clauses: ['enterpriseName = :companyName', 'isDeleted = 0'], params: { companyName } }),
    listRows('devices', { clauses: ['enterpriseName = :companyName', 'isDeleted = 0'], params: { companyName } }),
    listRows('pressure_records', { clauses: ['enterpriseName = :companyName', 'isDeleted = 0'], params: { companyName } })
  ])

  const expiredCount = records.filter((item) => isExpiredDate(item.expiryDate)).length
  const expiringCount = records.filter((item) => !isExpiredDate(item.expiryDate) && isExpiringDate(item.expiryDate, 30)).length
  const inactiveCount = gauges.filter((item) => ['停用', '报废'].includes(item.status)).length
  const unboundCount = equipments.filter((item) => Number(item.gaugeCount || 0) === 0).length

  return {
    summary: {
      equipmentCount: equipments.length,
      gaugeCount: gauges.length,
      expiredCount,
      expiringCount,
      inactiveCount,
      unboundCount
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
      isExpired: new Date(item.expiryDate) < today
    })),
    unboundEquipments: equipments
      .filter((item) => Number(item.gaugeCount || 0) === 0)
      .slice(0, 8)
      .map((item) => ({
        _id: item.id,
        equipmentName: item.equipmentName || '',
        equipmentNo: item.equipmentNo || '',
        location: item.location || ''
      }))
  }
}

async function handleGetEnterpriseEquipments(payload = {}) {
  const companyName = buildEnterpriseScope(payload.enterprise || {})
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

async function handleSaveEnterpriseEquipment(payload = {}) {
  const enterprise = payload.enterprise || {}
  const data = payload.data || {}
  const companyName = buildEnterpriseScope(enterprise)
  const now = formatDateTime()
  const equipmentName = String(data.equipmentName || '').trim()
  if (!equipmentName) throw new Error('请输入设备名称')

  const doc = {
    equipmentNo: String(data.equipmentNo || '').trim() || `EQ-${Date.now()}`,
    equipmentName,
    enterpriseId: enterprise.id || '',
    enterpriseName: companyName,
    district: data.district || enterprise.district || '',
    location: data.location || '',
    gaugeCount: Number(data.gaugeCount || 0),
    isDeleted: 0,
    updateTime: now
  }

  if (data._id) {
    await updateById('equipments', data._id, doc)
    return { _id: data._id, ...doc }
  }

  const row = {
    id: id('eq'),
    ...doc,
    deletedAt: '',
    deletedBy: '',
    deletedById: '',
    createTime: now
  }
  await insertRow('equipments', row)
  return { _id: row.id, ...doc }
}

async function handleDeleteEnterpriseEquipment(payload = {}) {
  const enterprise = payload.enterprise || {}
  const targetId = String(payload.id || '').trim()
  if (!targetId) throw new Error('缺少设备ID')

  const current = await one('SELECT * FROM equipments WHERE id = :id LIMIT 1', { id: targetId })
  if (!current || current.enterpriseName !== enterprise.companyName) {
    throw new Error('无权删除该设备')
  }

  const now = formatDateTime()
  await updateById('equipments', targetId, {
    isDeleted: 1,
    deletedAt: now,
    deletedBy: enterprise.companyName || '企业用户',
    deletedById: enterprise.id || '',
    updateTime: now
  })
  return { success: true }
}

async function handleGetEnterpriseGauges(payload = {}) {
  const companyName = buildEnterpriseScope(payload.enterprise || {})
  const keyword = String(payload.keyword || '').trim()
  const status = String(payload.status || '').trim()
  const list = await listRows('devices', {
    clauses: ['enterpriseName = :companyName', 'isDeleted = 0'],
    params: { companyName }
  })
  return {
    list: list
      .filter((item) => !status || item.status === status)
      .filter((item) => matchKeyword([item.deviceName, item.deviceNo, item.factoryNo, item.equipmentName, item.modelSpec], keyword))
      .map((item) => ({
        _id: item.id,
        deviceName: item.deviceName || '',
        deviceNo: item.deviceNo || '',
        factoryNo: item.factoryNo || '',
        equipmentId: item.equipmentId || '',
        equipmentName: item.equipmentName || '',
        status: item.status || '',
        manufacturer: item.manufacturer || '',
        modelSpec: item.modelSpec || '',
        createTime: formatDate(item.createTime)
      }))
  }
}

async function handleGetEnterpriseRecords(payload = {}) {
  const companyName = buildEnterpriseScope(payload.enterprise || {})
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
      .filter((item) => matchKeyword([item.certNo, item.factoryNo, item.instrumentName, item.equipmentName, item.deviceName], keyword))
      .map((item) => ({
        _id: item.id,
        certNo: item.certNo || '',
        factoryNo: item.factoryNo || '',
        instrumentName: item.instrumentName || '',
        equipmentName: item.equipmentName || '',
        conclusion: item.conclusion || '',
        verificationDate: formatDate(item.verificationDate),
        expiryDate: formatDate(item.expiryDate),
        status: item.status || ''
      }))
  }
}

async function handleSaveEnterpriseAiRecord(payload = {}) {
  const enterprise = payload.enterprise || {}
  const extractedData = payload.extractedData || {}
  const equipmentId = String(payload.equipmentId || '').trim()
  const fileID = String(payload.fileID || '').trim()
  const companyName = buildEnterpriseScope(enterprise)
  if (!equipmentId) throw new Error('请选择所属设备')

  const equipment = await one('SELECT * FROM equipments WHERE id = :id LIMIT 1', { id: equipmentId })
  if (!equipment || equipment.isDeleted) throw new Error('所选设备不存在')
  if (equipment.enterpriseName !== companyName) throw new Error('无权使用该设备')

  const parsedVerificationDate = parseDateInput(extractedData.verificationDate)
  if (!parsedVerificationDate) throw new Error('请补全检定日期后再保存')
  const verificationDate = formatDate(parsedVerificationDate)

  const now = formatDateTime()
  const deviceId = id('dev')
  const recordId = id('rec')
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
    deviceType: '压力表',
    enterpriseId: enterprise.id || companyName,
    enterpriseName: companyName,
    district,
    factoryNo,
    certNo,
    equipmentId: equipment.id,
    equipmentName: equipment.equipmentName || '',
    status: gaugeStatus,
    manufacturer,
    modelSpec,
    installLocation: equipment.location || '',
    recordCount: 1,
    isDeleted: 0,
    deletedAt: '',
    deletedBy: '',
    deletedById: '',
    createTime: now,
    updateTime: now
  })

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
    enterpriseId: enterprise.id || companyName,
    enterpriseName: companyName,
    enterprisePhone: enterprise.phone || '',
    enterpriseLegalPerson: enterprise.legalPerson || '',
    createdBy: 'enterprise_web_server',
    equipmentId: equipment.id,
    equipmentName: equipment.equipmentName || '',
    deviceId,
    deviceName,
    deviceNo,
    deviceStatus: gaugeStatus
  })

  const countRow = await one(
    'SELECT COUNT(*) AS total FROM devices WHERE equipmentId = :equipmentId AND isDeleted = 0',
    { equipmentId: equipment.id }
  )
  await updateById('equipments', equipment.id, {
    gaugeCount: Number(countRow?.total || 0),
    updateTime: now
  })

  return {
    success: true,
    recordId,
    deviceId
  }
}

async function handleAdminAction(action, payload = {}) {
  if (action === 'login') return handleLogin(payload)
  if (action === 'changePassword') return handleChangePassword(payload)
  if (action === 'getDashboard') return handleGetDashboard(payload)
  if (action === 'getRecords') return handleGetRecords(payload)
  if (action === 'getEnterprises') return handleGetEnterprises(payload)
  if (action === 'enterpriseLogin') return handleEnterpriseLogin(payload)
  if (action === 'enterpriseRegister') return handleEnterpriseRegister(payload)
  if (action === 'getEnterpriseDashboard') return handleGetEnterpriseDashboard(payload)
  if (action === 'getEnterpriseEquipments') return handleGetEnterpriseEquipments(payload)
  if (action === 'saveEnterpriseEquipment') return handleSaveEnterpriseEquipment(payload)
  if (action === 'deleteEnterpriseEquipment') return handleDeleteEnterpriseEquipment(payload)
  if (action === 'getEnterpriseGauges') return handleGetEnterpriseGauges(payload)
  if (action === 'getEnterpriseRecords') return handleGetEnterpriseRecords(payload)
  if (action === 'saveEnterpriseAiRecord') return handleSaveEnterpriseAiRecord(payload)
  throw new Error(`Unsupported admin action: ${action}`)
}

module.exports = {
  handleAdminAction
}
