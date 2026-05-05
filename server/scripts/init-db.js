const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const mysql = require('mysql2/promise')
const { DatabaseSync } = require('node:sqlite')
const config = require('../src/config')
const { hashPassword } = require('../src/lib/auth')
const { formatDateTime } = require('../src/utils/dates')

async function seedAdmin(findAdmin, insertAdmin) {
  const existing = await findAdmin(config.seed.adminUsername)
  if (existing) {
    console.log(`Default admin already exists: ${config.seed.adminUsername}`)
    return
  }

  const now = formatDateTime()
  const passwordHash = await hashPassword(config.seed.adminPassword)

  await insertAdmin({
    id: `admin_${crypto.randomUUID()}`,
    username: config.seed.adminUsername,
    password: passwordHash,
    role: config.seed.adminRole,
    district: config.seed.adminDistrict,
    createTime: now,
    updateTime: now
  })

  console.log(`Created default admin: ${config.seed.adminUsername}`)
}

async function ensureMysqlColumn(connection, tableName, columnName, columnSql) {
  const [rows] = await connection.execute(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [config.mysql.database, tableName, columnName]
  )

  if (!rows.length) {
    await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${columnSql}`)
  }
}

async function ensureMysqlIndex(connection, tableName, indexName, indexSql) {
  const [rows] = await connection.execute(
    'SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
    [config.mysql.database, tableName, indexName]
  )

  if (!rows.length) {
    await connection.query(`ALTER TABLE \`${tableName}\` ADD INDEX ${indexSql}`)
  }
}

function ensureSqliteColumn(db, tableName, columnName, columnSql) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all()
  if (!rows.some((row) => row.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql};`)
  }
}

function ensureSqliteIndex(db, indexSql) {
  db.exec(indexSql)
}

async function initMysql() {
  const connection = await mysql.createConnection({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    multipleStatements: true
  })

  try {
    const schemaSql = fs.readFileSync(path.resolve(__dirname, '../sql/schema.sql'), 'utf8')
    await connection.query(schemaSql)
    await connection.query(`USE \`${config.mysql.database}\``)
    await ensureMysqlColumn(
      connection,
      'pressure_records',
      'installLocation',
      "`installLocation` VARCHAR(240) DEFAULT ''"
    )
    await ensureMysqlColumn(
      connection,
      'admins',
      'isDisabled',
      "`isDisabled` TINYINT(1) NOT NULL DEFAULT 0"
    )
    await ensureMysqlColumn(
      connection,
      'admins',
      'lastLoginTime',
      "`lastLoginTime` VARCHAR(32) DEFAULT ''"
    )
    await ensureMysqlColumn(
      connection,
      'enterprises',
      'riskStatus',
      "`riskStatus` VARCHAR(32) DEFAULT 'pending'"
    )
    await ensureMysqlColumn(
      connection,
      'enterprises',
      'riskStatusNote',
      "`riskStatusNote` VARCHAR(500) DEFAULT ''"
    )
    await ensureMysqlColumn(
      connection,
      'enterprises',
      'riskStatusUpdateTime',
      "`riskStatusUpdateTime` VARCHAR(32) DEFAULT ''"
    )
    await ensureMysqlColumn(
      connection,
      'pressure_records',
      'riskStatus',
      "`riskStatus` VARCHAR(32) DEFAULT 'pending'"
    )
    await ensureMysqlColumn(
      connection,
      'pressure_records',
      'remediationStatus',
      "`remediationStatus` VARCHAR(32) DEFAULT 'pending'"
    )
    await ensureMysqlColumn(
      connection,
      'pressure_records',
      'remediationNote',
      "`remediationNote` VARCHAR(500) DEFAULT ''"
    )
    await ensureMysqlColumn(
      connection,
      'pressure_records',
      'remediationUpdateTime',
      "`remediationUpdateTime` VARCHAR(32) DEFAULT ''"
    )
    await ensureMysqlColumn(
      connection,
      'pressure_records',
      'installPhotoFileID',
      "`installPhotoFileID` LONGTEXT NULL"
    )
    await ensureMysqlColumn(
      connection,
      'ai_recognition_jobs',
      'durationMs',
      "`durationMs` INT NOT NULL DEFAULT 0"
    )
    await ensureMysqlColumn(
      connection,
      'ai_recognition_jobs',
      'imageHash',
      "`imageHash` VARCHAR(80) DEFAULT ''"
    )
    await ensureMysqlColumn(
      connection,
      'ai_recognition_jobs',
      'sourceSize',
      "`sourceSize` INT NOT NULL DEFAULT 0"
    )
    await ensureMysqlIndex(
      connection,
      'ai_recognition_jobs',
      'idx_ai_job_owner_hash',
      'idx_ai_job_owner_hash (`ownerId`, `imageHash`)'
    )

    await seedAdmin(
      async (username) => {
        const [rows] = await connection.execute(
          'SELECT id FROM admins WHERE username = ? LIMIT 1',
          [username]
        )
        return rows[0] || null
      },
      async (admin) => {
        await connection.execute(
          'INSERT INTO admins (id, username, password, role, district, createTime, updateTime) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            admin.id,
            admin.username,
            admin.password,
            admin.role,
            admin.district,
            admin.createTime,
            admin.updateTime
          ]
        )
      }
    )
  } finally {
    await connection.end()
  }
}

async function initSqlite() {
  fs.mkdirSync(path.dirname(config.sqlite.path), { recursive: true })
  const db = new DatabaseSync(config.sqlite.path)

  try {
    const schemaSql = fs.readFileSync(path.resolve(__dirname, '../sql/schema.sqlite.sql'), 'utf8')
    db.exec(schemaSql)
    ensureSqliteColumn(db, 'pressure_records', 'installLocation', "installLocation TEXT DEFAULT ''")
    ensureSqliteColumn(db, 'admins', 'isDisabled', "isDisabled INTEGER NOT NULL DEFAULT 0")
    ensureSqliteColumn(db, 'admins', 'lastLoginTime', "lastLoginTime TEXT DEFAULT ''")
    ensureSqliteColumn(db, 'enterprises', 'riskStatus', "riskStatus TEXT DEFAULT 'pending'")
    ensureSqliteColumn(db, 'enterprises', 'riskStatusNote', "riskStatusNote TEXT DEFAULT ''")
    ensureSqliteColumn(db, 'enterprises', 'riskStatusUpdateTime', "riskStatusUpdateTime TEXT DEFAULT ''")
    ensureSqliteColumn(db, 'pressure_records', 'riskStatus', "riskStatus TEXT DEFAULT 'pending'")
    ensureSqliteColumn(db, 'pressure_records', 'remediationStatus', "remediationStatus TEXT DEFAULT 'pending'")
    ensureSqliteColumn(db, 'pressure_records', 'remediationNote', "remediationNote TEXT DEFAULT ''")
    ensureSqliteColumn(db, 'pressure_records', 'remediationUpdateTime', "remediationUpdateTime TEXT DEFAULT ''")
    ensureSqliteColumn(db, 'pressure_records', 'installPhotoFileID', "installPhotoFileID TEXT DEFAULT ''")
    ensureSqliteColumn(db, 'ai_recognition_jobs', 'durationMs', "durationMs INTEGER NOT NULL DEFAULT 0")
    ensureSqliteColumn(db, 'ai_recognition_jobs', 'imageHash', "imageHash TEXT DEFAULT ''")
    ensureSqliteColumn(db, 'ai_recognition_jobs', 'sourceSize', "sourceSize INTEGER NOT NULL DEFAULT 0")
    ensureSqliteIndex(db, 'CREATE INDEX IF NOT EXISTS idx_ai_job_owner_hash ON ai_recognition_jobs (ownerId, imageHash);')

    await seedAdmin(
      async (username) => db.prepare('SELECT id FROM admins WHERE username = :username LIMIT 1').get({ username }) || null,
      async (admin) => {
        db.prepare(`
          INSERT INTO admins (id, username, password, role, district, createTime, updateTime)
          VALUES (:id, :username, :password, :role, :district, :createTime, :updateTime)
        `).run(admin)
      }
    )
  } finally {
    db.close()
  }
}

async function main() {
  if (config.db.client === 'sqlite') {
    await initSqlite()
    console.log(`SQLite database initialized: ${config.sqlite.path}`)
    return
  }

  await initMysql()
  console.log('MySQL database initialized')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
