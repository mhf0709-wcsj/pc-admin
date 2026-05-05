import { callAdminFunction } from './cloud'

export function loginAdmin(username, password) {
  return callAdminFunction('login', { username, password })
}

export function changeAdminPassword(admin, oldPassword, newPassword) {
  return callAdminFunction('changePassword', { admin, oldPassword, newPassword })
}

export function listDistrictAdmins(admin) {
  return callAdminFunction('listDistrictAdmins', { admin })
}

export function saveDistrictAdmin(admin, data) {
  return callAdminFunction('saveDistrictAdmin', { admin, ...data })
}

export function listOperationLogs(admin, filters = {}) {
  return callAdminFunction('listOperationLogs', { admin, ...filters })
}

export function getDashboardData(admin, filters = {}) {
  return callAdminFunction('getDashboard', { admin, ...filters })
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

export function updateEnterpriseRecordRemediation(enterprise, payload = {}) {
  return callAdminFunction('updateEnterpriseRecordRemediation', { enterprise, ...payload })
}

export function sendReminderSms(scope, payload = {}) {
  return callAdminFunction('sendReminderSms', {
    scope,
    ...payload
  })
}

export function batchSendReminderSms(admin, ids = []) {
  return callAdminFunction('batchSendReminderSms', { admin, ids })
}

export function updateRecord(admin, id, data, note = '') {
  return callAdminFunction('updateRecord', { admin, id, data, note })
}

export function getRecordRevisionLogs(admin, recordId) {
  return callAdminFunction('getRecordRevisionLogs', { admin, recordId })
}

export function updateEnterpriseRiskStatus(admin, payload = {}) {
  return callAdminFunction('updateEnterpriseRiskStatus', { admin, ...payload })
}

export function parseEnterpriseExcel(enterprise, payload = {}) {
  return callAdminFunction('parseEnterpriseExcel', { enterprise, ...payload })
}

export function saveEnterpriseAiRecord(enterprise, payload) {
  return callAdminFunction('saveEnterpriseAiRecord', { enterprise, ...payload })
}

export function submitEnterpriseRecognitionTask(enterprise, payload = {}) {
  return callAdminFunction('submitEnterpriseRecognitionTask', { enterprise, ...payload })
}

export function getEnterpriseRecognitionTask(enterprise, jobId) {
  return callAdminFunction('getEnterpriseRecognitionTask', { enterprise, jobId })
}

export function listEnterpriseRecognitionTasks(enterprise, limit = 20) {
  return callAdminFunction('listEnterpriseRecognitionTasks', { enterprise, limit })
}

export function deleteEnterpriseRecognitionTask(enterprise, jobId) {
  return callAdminFunction('deleteEnterpriseRecognitionTask', { enterprise, jobId })
}

export function clearCompletedRecognitionTasks(enterprise) {
  return callAdminFunction('clearCompletedRecognitionTasks', { enterprise })
}

export function retryEnterpriseRecognitionTask(enterprise, jobId, mode = 'full') {
  return callAdminFunction('retryEnterpriseRecognitionTask', { enterprise, jobId, mode })
}

export function batchRetryEnterpriseRecognitionTasks(enterprise, jobIds = [], mode = 'full') {
  return callAdminFunction('batchRetryEnterpriseRecognitionTasks', { enterprise, jobIds, mode })
}
