const mysql = require('mysql2/promise')
const config = require('../config')

const pool = mysql.createPool({
  host: config.mysql.host,
  port: config.mysql.port,
  user: config.mysql.user,
  password: config.mysql.password,
  database: config.mysql.database,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  timezone: '+08:00'
})

function getExecutor(executor) {
  return executor || pool
}

async function query(sql, params = {}, executor = null) {
  const [rows] = await getExecutor(executor).execute(sql, params)
  return rows
}

async function one(sql, params = {}, executor = null) {
  const rows = await query(sql, params, executor)
  return rows[0] || null
}

async function exec(sql, params = {}, executor = null) {
  const [result] = await getExecutor(executor).execute(sql, params)
  return result
}

async function withTransaction(run) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await run(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

module.exports = {
  pool,
  query,
  one,
  exec,
  withTransaction
}
