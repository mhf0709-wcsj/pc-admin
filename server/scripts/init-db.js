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

function ensureSqliteColumn(db, tableName, columnName, columnSql) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all()
  if (!rows.some((row) => row.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql};`)
  }
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
