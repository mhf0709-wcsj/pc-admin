CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  district TEXT DEFAULT '',
  createTime TEXT DEFAULT '',
  updateTime TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS enterprises (
  id TEXT PRIMARY KEY,
  companyName TEXT NOT NULL UNIQUE,
  creditCode TEXT DEFAULT '',
  legalPerson TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  district TEXT DEFAULT '',
  authType TEXT DEFAULT 'web',
  createTime TEXT DEFAULT '',
  updateTime TEXT DEFAULT '',
  lastLoginTime TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_enterprise_district ON enterprises (district);
CREATE INDEX IF NOT EXISTS idx_enterprise_phone ON enterprises (phone);
CREATE INDEX IF NOT EXISTS idx_enterprise_credit ON enterprises (creditCode);

CREATE TABLE IF NOT EXISTS equipments (
  id TEXT PRIMARY KEY,
  equipmentNo TEXT DEFAULT '',
  equipmentName TEXT NOT NULL,
  enterpriseId TEXT DEFAULT '',
  enterpriseName TEXT NOT NULL,
  district TEXT DEFAULT '',
  location TEXT DEFAULT '',
  gaugeCount INTEGER NOT NULL DEFAULT 0,
  isDeleted INTEGER NOT NULL DEFAULT 0,
  deletedAt TEXT DEFAULT '',
  deletedBy TEXT DEFAULT '',
  deletedById TEXT DEFAULT '',
  createTime TEXT DEFAULT '',
  updateTime TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_equipment_enterprise_deleted_time
  ON equipments (enterpriseName, isDeleted, createTime);
CREATE INDEX IF NOT EXISTS idx_equipment_district ON equipments (district);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  deviceNo TEXT DEFAULT '',
  deviceName TEXT DEFAULT '',
  deviceType TEXT DEFAULT 'pressure_gauge',
  enterpriseId TEXT DEFAULT '',
  enterpriseName TEXT NOT NULL,
  district TEXT DEFAULT '',
  factoryNo TEXT DEFAULT '',
  certNo TEXT DEFAULT '',
  equipmentId TEXT DEFAULT '',
  equipmentName TEXT DEFAULT '',
  status TEXT DEFAULT 'in_use',
  manufacturer TEXT DEFAULT '',
  modelSpec TEXT DEFAULT '',
  installLocation TEXT DEFAULT '',
  recordCount INTEGER NOT NULL DEFAULT 0,
  isDeleted INTEGER NOT NULL DEFAULT 0,
  deletedAt TEXT DEFAULT '',
  deletedBy TEXT DEFAULT '',
  deletedById TEXT DEFAULT '',
  createTime TEXT DEFAULT '',
  updateTime TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_device_enterprise_deleted_time
  ON devices (enterpriseName, isDeleted, createTime);
CREATE INDEX IF NOT EXISTS idx_device_equipment_status
  ON devices (enterpriseName, equipmentId, status);
CREATE INDEX IF NOT EXISTS idx_device_factory ON devices (factoryNo);

CREATE TABLE IF NOT EXISTS pressure_records (
  id TEXT PRIMARY KEY,
  certNo TEXT DEFAULT '',
  sendUnit TEXT DEFAULT '',
  instrumentName TEXT DEFAULT '',
  modelSpec TEXT DEFAULT '',
  factoryNo TEXT DEFAULT '',
  manufacturer TEXT DEFAULT '',
  verificationStd TEXT DEFAULT '',
  conclusion TEXT DEFAULT '',
  verificationDate TEXT DEFAULT '',
  expiryDate TEXT DEFAULT '',
  district TEXT DEFAULT '',
  status TEXT DEFAULT 'valid',
  isDeleted INTEGER NOT NULL DEFAULT 0,
  deletedAt TEXT DEFAULT '',
  deletedBy TEXT DEFAULT '',
  createTime TEXT DEFAULT '',
  updateTime TEXT DEFAULT '',
  ocrSource TEXT DEFAULT '',
  hasImage INTEGER NOT NULL DEFAULT 0,
  hasInstallPhoto INTEGER NOT NULL DEFAULT 0,
  fileID TEXT DEFAULT '',
  enterpriseId TEXT DEFAULT '',
  enterpriseName TEXT NOT NULL,
  enterprisePhone TEXT DEFAULT '',
  enterpriseLegalPerson TEXT DEFAULT '',
  createdBy TEXT DEFAULT '',
  equipmentId TEXT DEFAULT '',
  equipmentName TEXT DEFAULT '',
  installLocation TEXT DEFAULT '',
  deviceId TEXT DEFAULT '',
  deviceName TEXT DEFAULT '',
  deviceNo TEXT DEFAULT '',
  deviceStatus TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_record_enterprise_time
  ON pressure_records (enterpriseName, createTime);
CREATE INDEX IF NOT EXISTS idx_record_enterprise_deleted_expiry
  ON pressure_records (enterpriseName, isDeleted, expiryDate);
CREATE INDEX IF NOT EXISTS idx_record_district_expiry_status
  ON pressure_records (district, expiryDate, status);
CREATE INDEX IF NOT EXISTS idx_record_device_time
  ON pressure_records (enterpriseName, deviceId, createTime);
CREATE INDEX IF NOT EXISTS idx_record_factory ON pressure_records (factoryNo);
CREATE INDEX IF NOT EXISTS idx_record_cert ON pressure_records (certNo);

CREATE TABLE IF NOT EXISTS deletion_logs (
  id TEXT PRIMARY KEY,
  enterpriseName TEXT DEFAULT '',
  targetType TEXT DEFAULT '',
  targetId TEXT DEFAULT '',
  targetName TEXT DEFAULT '',
  operatorName TEXT DEFAULT '',
  operatorId TEXT DEFAULT '',
  deleteTime TEXT DEFAULT '',
  snapshot TEXT
);
CREATE INDEX IF NOT EXISTS idx_delete_enterprise_time
  ON deletion_logs (enterpriseName, deleteTime);
