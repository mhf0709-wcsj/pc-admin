const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const mysql = require('mysql2/promise')
const config = require('../src/config')
const { hashPassword } = require('../src/lib/auth')
const { formatDateTime } = require('../src/utils/dates')

async function main() {
  const connection = await mysql.createConnection({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    multipleStatements: true
  })

  const schemaSql = fs.readFileSync(path.resolve(__dirname, '../sql/schema.sql'), 'utf8')
  await connection.query(schemaSql)

  await connection.query(`USE \`${config.mysql.database}\``)

  const [rows] = await connection.execute(
    'SELECT id FROM admins WHERE username = ? LIMIT 1',
    [config.seed.adminUsername]
  )

  if (!rows.length) {
    const now = formatDateTime()
    const passwordHash = await hashPassword(config.seed.adminPassword)
    await connection.execute(
      'INSERT INTO admins (id, username, password, role, district, createTime, updateTime) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        `admin_${crypto.randomUUID()}`,
        config.seed.adminUsername,
        passwordHash,
        config.seed.adminRole,
        config.seed.adminDistrict,
        now,
        now
      ]
    )
    console.log(`Created default admin: ${config.seed.adminUsername}`)
  } else {
    console.log(`Default admin already exists: ${config.seed.adminUsername}`)
  }

  await connection.end()
  console.log('Database initialized')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
