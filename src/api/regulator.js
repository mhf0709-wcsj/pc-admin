import { callAdminFunction } from './cloud'

export function loginAdmin(username, password) {
  return callAdminFunction('login', { username, password })
}

export function changeAdminPassword(admin, oldPassword, newPassword) {
  return callAdminFunction('changePassword', { admin, oldPassword, newPassword })
}

export function getDashboardData(admin) {
  return callAdminFunction('getDashboard', { admin })
}

export function getRecords(admin, filters = {}) {
  return callAdminFunction('getRecords', { admin, ...filters })
}

export function getEnterprises(admin, filters = {}) {
  return callAdminFunction('getEnterprises', { admin, ...filters })
}

export function loginEnterprise(companyName, phone) {
  return callAdminFunction('enterpriseLogin', { companyName, phone })
}

export function registerEnterprise(data) {
  return callAdminFunction('enterpriseRegister', data)
}

export function getEnterpriseDashboard(enterprise) {
  return callAdminFunction('getEnterpriseDashboard', { enterprise })
}

export function getEnterpriseEquipments(enterprise, filters = {}) {
  return callAdminFunction('getEnterpriseEquipments', { enterprise, ...filters })
}

export function saveEnterpriseEquipment(enterprise, data) {
  return callAdminFunction('saveEnterpriseEquipment', { enterprise, data })
}

export function deleteEnterpriseEquipment(enterprise, id) {
  return callAdminFunction('deleteEnterpriseEquipment', { enterprise, id })
}

export function getEnterpriseGauges(enterprise, filters = {}) {
  return callAdminFunction('getEnterpriseGauges', { enterprise, ...filters })
}

export function getEnterpriseRecords(enterprise, filters = {}) {
  return callAdminFunction('getEnterpriseRecords', { enterprise, ...filters })
}

export function saveEnterpriseAiRecord(enterprise, payload) {
  return callAdminFunction('saveEnterpriseAiRecord', { enterprise, ...payload })
}
