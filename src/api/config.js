export const cloudConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
  envId: 'cloud1-3gxphq02b0e0bee4',
  region: 'ap-shanghai',
  adminFunctionName: 'webAdmin',
  aiFunctionName: 'aiAssistant',
  ocrFunctionName: 'baiduOcr'
}

export const collections = {
  RECORDS: 'pressure_records',
  ADMINS: 'admins',
  ENTERPRISES: 'enterprises',
  DEVICES: 'devices',
  EQUIPMENTS: 'equipments'
}

export const districts = [
  '全部辖区',
  '大峃所',
  '珊溪所',
  '峃口所',
  '黄坦所',
  '西坑所',
  '玉壶所',
  '南田所',
  '百丈漈所'
]

export const conclusions = ['合格', '不合格']
