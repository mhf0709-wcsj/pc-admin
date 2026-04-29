import cloudbase from '@cloudbase/js-sdk'
import { cloudConfig, collections } from './config'

let app
let auth
let authPromise

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

export async function callAiFunction(payload = {}) {
  const response = await callCloudFunction(cloudConfig.aiFunctionName, payload)
  const result = response?.result || {}
  if (result.success === false) {
    throw new Error(result.error || result.message || 'AI 服务调用失败')
  }
  return result
}

export async function callOcrFunction(payload = {}) {
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
