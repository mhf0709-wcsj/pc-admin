CREATE DATABASE IF NOT EXISTS pressure_admin DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE pressure_admin;

CREATE TABLE IF NOT EXISTS admins (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'admin',
  district VARCHAR(80) DEFAULT '',
  createTime VARCHAR(32) DEFAULT '',
  updateTime VARCHAR(32) DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS enterprises (
  id VARCHAR(64) PRIMARY KEY,
  companyName VARCHAR(200) NOT NULL UNIQUE,
  creditCode VARCHAR(64) DEFAULT '',
  legalPerson VARCHAR(80) DEFAULT '',
  phone VARCHAR(40) DEFAULT '',
  district VARCHAR(80) DEFAULT '',
  authType VARCHAR(40) DEFAULT 'web',
  createTime VARCHAR(32) DEFAULT '',
  updateTime VARCHAR(32) DEFAULT '',
  lastLoginTime VARCHAR(32) DEFAULT '',
  INDEX idx_enterprise_district (district),
  INDEX idx_enterprise_phone (phone),
  INDEX idx_enterprise_credit (creditCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equipments (
  id VARCHAR(64) PRIMARY KEY,
  equipmentNo VARCHAR(100) DEFAULT '',
  equipmentName VARCHAR(200) NOT NULL,
  enterpriseId VARCHAR(64) DEFAULT '',
  enterpriseName VARCHAR(200) NOT NULL,
  district VARCHAR(80) DEFAULT '',
  location VARCHAR(240) DEFAULT '',
  gaugeCount INT NOT NULL DEFAULT 0,
  isDeleted TINYINT(1) NOT NULL DEFAULT 0,
  deletedAt VARCHAR(32) DEFAULT '',
  deletedBy VARCHAR(120) DEFAULT '',
  deletedById VARCHAR(64) DEFAULT '',
  createTime VARCHAR(32) DEFAULT '',
  updateTime VARCHAR(32) DEFAULT '',
  INDEX idx_equipment_enterprise_deleted_time (enterpriseName, isDeleted, createTime),
  INDEX idx_equipment_district (district)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS devices (
  id VARCHAR(64) PRIMARY KEY,
  deviceNo VARCHAR(100) DEFAULT '',
  deviceName VARCHAR(200) DEFAULT '',
  deviceType VARCHAR(80) DEFAULT 'pressure_gauge',
  enterpriseId VARCHAR(64) DEFAULT '',
  enterpriseName VARCHAR(200) NOT NULL,
  district VARCHAR(80) DEFAULT '',
  factoryNo VARCHAR(120) DEFAULT '',
  certNo VARCHAR(120) DEFAULT '',
  equipmentId VARCHAR(64) DEFAULT '',
  equipmentName VARCHAR(200) DEFAULT '',
  status VARCHAR(40) DEFAULT 'in_use',
  manufacturer VARCHAR(200) DEFAULT '',
  modelSpec VARCHAR(200) DEFAULT '',
  installLocation VARCHAR(240) DEFAULT '',
  recordCount INT NOT NULL DEFAULT 0,
  isDeleted TINYINT(1) NOT NULL DEFAULT 0,
  deletedAt VARCHAR(32) DEFAULT '',
  deletedBy VARCHAR(120) DEFAULT '',
  deletedById VARCHAR(64) DEFAULT '',
  createTime VARCHAR(32) DEFAULT '',
  updateTime VARCHAR(32) DEFAULT '',
  INDEX idx_device_enterprise_deleted_time (enterpriseName, isDeleted, createTime),
  INDEX idx_device_equipment_status (enterpriseName, equipmentId, status),
  INDEX idx_device_factory (factoryNo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pressure_records (
  id VARCHAR(64) PRIMARY KEY,
  certNo VARCHAR(120) DEFAULT '',
  sendUnit VARCHAR(240) DEFAULT '',
  instrumentName VARCHAR(200) DEFAULT '',
  modelSpec VARCHAR(200) DEFAULT '',
  factoryNo VARCHAR(120) DEFAULT '',
  manufacturer VARCHAR(200) DEFAULT '',
  verificationStd VARCHAR(200) DEFAULT '',
  conclusion VARCHAR(40) DEFAULT '',
  verificationDate VARCHAR(32) DEFAULT '',
  expiryDate VARCHAR(32) DEFAULT '',
  district VARCHAR(80) DEFAULT '',
  status VARCHAR(40) DEFAULT 'valid',
  isDeleted TINYINT(1) NOT NULL DEFAULT 0,
  deletedAt VARCHAR(32) DEFAULT '',
  deletedBy VARCHAR(120) DEFAULT '',
  createTime VARCHAR(32) DEFAULT '',
  updateTime VARCHAR(32) DEFAULT '',
  ocrSource VARCHAR(80) DEFAULT '',
  hasImage TINYINT(1) NOT NULL DEFAULT 0,
  hasInstallPhoto TINYINT(1) NOT NULL DEFAULT 0,
  fileID VARCHAR(500) DEFAULT '',
  enterpriseId VARCHAR(64) DEFAULT '',
  enterpriseName VARCHAR(200) NOT NULL,
  enterprisePhone VARCHAR(40) DEFAULT '',
  enterpriseLegalPerson VARCHAR(80) DEFAULT '',
  createdBy VARCHAR(80) DEFAULT '',
  equipmentId VARCHAR(64) DEFAULT '',
  equipmentName VARCHAR(200) DEFAULT '',
  installLocation VARCHAR(240) DEFAULT '',
  deviceId VARCHAR(64) DEFAULT '',
  deviceName VARCHAR(200) DEFAULT '',
  deviceNo VARCHAR(100) DEFAULT '',
  deviceStatus VARCHAR(40) DEFAULT '',
  INDEX idx_record_enterprise_time (enterpriseName, createTime),
  INDEX idx_record_enterprise_deleted_expiry (enterpriseName, isDeleted, expiryDate),
  INDEX idx_record_district_expiry_status (district, expiryDate, status),
  INDEX idx_record_device_time (enterpriseName, deviceId, createTime),
  INDEX idx_record_factory (factoryNo),
  INDEX idx_record_cert (certNo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS deletion_logs (
  id VARCHAR(64) PRIMARY KEY,
  enterpriseName VARCHAR(200) DEFAULT '',
  targetType VARCHAR(80) DEFAULT '',
  targetId VARCHAR(64) DEFAULT '',
  targetName VARCHAR(200) DEFAULT '',
  operatorName VARCHAR(120) DEFAULT '',
  operatorId VARCHAR(64) DEFAULT '',
  deleteTime VARCHAR(32) DEFAULT '',
  snapshot JSON NULL,
  INDEX idx_delete_enterprise_time (enterpriseName, deleteTime)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
