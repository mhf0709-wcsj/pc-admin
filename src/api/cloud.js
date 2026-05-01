import cloudbase from '@cloudbase/js-sdk'
import axios from 'axios'
import { cloudConfig, collections } from './config'

let app
let auth
let authPromise

function getServerToken() {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem('webToken') || localStorage.getItem('adminToken') || ''
}

function normalizeHttpError(error, fallbackMessage) {
  if (axios.isCancel?.(error) || error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') {
    return new Error('请求已取消，请重试')
  }

  if (error?.code === 'ECONNABORTED') {
    return new Error('请求超时，请稍后重试')
  }

  const message =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallbackMessage

  return new Error(message)
}

async function postServer(path, data = {}, requestOptions = {}) {
  const baseUrl = String(cloudConfig.apiBaseUrl || '').replace(/\/$/, '')
  try {
    const response = await axios.post(`${baseUrl}${path}`, data, {
      timeout: requestOptions.timeout ?? 60000,
      signal: requestOptions.signal,
      headers: getServerToken()
        ? { Authorization: `Bearer ${getServerToken()}` }
        : {}
    })
    return response.data || {}
  } catch (error) {
    throw normalizeHttpError(error, '网络请求失败，请稍后重试')
  }
}

function getCloudApp() {
  if (!app) {
    app = cloudbase.init({
      env: cloudConfig.envId
    })
  }
  return app
}

function getAuth() {
  if (!auth) {
    auth = getCloudApp().auth({
      persistence: 'local'
    })
  }
  return auth
}

export async function ensureCloudReady() {
  if (!authPromise) {
    authPromise = (async () => {
      const authInstance = getAuth()
      const loginState = await authInstance.getLoginState()
      if (!loginState) {
        await authInstance.signInAnonymously()
      }
      return true
    })()
  }
  return authPromise
}

export async function callCloudFunction(name, data = {}) {
  await ensureCloudReady()
  return getCloudApp().callFunction({
    name,
    data
  })
}

export async function callAdminFunction(action, payload = {}) {
  if (cloudConfig.apiBaseUrl) {
    const result = await postServer('/api/admin/call', { action, payload })
    if (!result.success) {
      throw new Error(result.message || '网页接口调用失败')
    }
    return result.data
  }

  const response = await callCloudFunction(cloudConfig.adminFunctionName, {
    action,
    payload
  })

  const result = response?.result || {}
  if (!result.success) {
    throw new Error(result.message || '网页接口调用失败')
  }

  return result.data
}

export async function callAiFunction(payload = {}, requestOptions = {}) {
  if (cloudConfig.apiBaseUrl) {
    const result = await postServer('/api/ai/call', payload, requestOptions)
    if (result.success === false) {
      throw new Error(result.error || result.message || 'AI 服务调用失败')
    }
    return result
  }

  const response = await callCloudFunction(cloudConfig.aiFunctionName, payload)
  const result = response?.result || {}
  if (result.success === false) {
    throw new Error(result.error || result.message || 'AI 服务调用失败')
  }
  return result
}

export async function callOcrFunction(payload = {}, requestOptions = {}) {
  if (cloudConfig.apiBaseUrl) {
    const result = await postServer('/api/ocr/call', payload, requestOptions)
    if (!result.success) {
      throw new Error(result.error || result.message || 'OCR 服务调用失败')
    }
    return result
  }

  const response = await callCloudFunction(cloudConfig.ocrFunctionName, payload)
  const result = response?.result || {}
  if (!result.success) {
    throw new Error(result.error || result.message || 'OCR 服务调用失败')
  }
  return result
}

export async function uploadCloudFile(file, cloudPath) {
  await ensureCloudReady()
  const result = await getCloudApp().uploadFile({
    cloudPath,
    filePath: file
  })
  return result
}

export { collections, getCloudApp }
