const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')
const config = require('../src/config')

async function main() {
  const connection = await mysql.createConnection({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    multipleStatements: true
  })

  const sql = fs.readFileSync(path.resolve(__dirname, '../sql/schema.sql'), 'utf8')
  await connection.query(sql)
  await connection.end()
  console.log('Database initialized')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
