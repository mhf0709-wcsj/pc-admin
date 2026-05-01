const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')
const { DatabaseSync } = require('node:sqlite')
const config = require('../config')

const isSqlite = config.db.client === 'sqlite'

let sqliteDb = null
let mysqlPool = null

function ensureSqliteDb() {
  if (sqliteDb) return sqliteDb

  fs.mkdirSync(path.dirname(config.sqlite.path), { recursive: true })
  sqliteDb = new DatabaseSync(config.sqlite.path)
  sqliteDb.exec('PRAGMA foreign_keys = ON;')
  sqliteDb.exec('PRAGMA journal_mode = WAL;')
  return sqliteDb
}

function ensureMysqlPool() {
  if (mysqlPool) return mysqlPool

  mysqlPool = mysql.createPool({
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

  return mysqlPool
}

function getExecutor(executor) {
  if (executor) return executor
  return isSqlite ? ensureSqliteDb() : ensureMysqlPool()
}

async function query(sql, params = {}, executor = null) {
  const db = getExecutor(executor)

  if (isSqlite) {
    const statement = db.prepare(sql)
    return statement.all(params)
  }

  const [rows] = await db.execute(sql, params)
  return rows
}

async function one(sql, params = {}, executor = null) {
  const db = getExecutor(executor)

  if (isSqlite) {
    const statement = db.prepare(sql)
    return statement.get(params) || null
  }

  const rows = await query(sql, params, executor)
  return rows[0] || null
}

async function exec(sql, params = {}, executor = null) {
  const db = getExecutor(executor)

  if (isSqlite) {
    const statement = db.prepare(sql)
    return statement.run(params)
  }

  const [result] = await db.execute(sql, params)
  return result
}

async function withTransaction(run) {
  if (isSqlite) {
    const db = ensureSqliteDb()
    db.exec('BEGIN')
    try {
      const result = await run(db)
      db.exec('COMMIT')
      return result
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  const pool = ensureMysqlPool()
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
  pool: isSqlite ? null : ensureMysqlPool(),
  sqlite: isSqlite ? ensureSqliteDb() : null,
  query,
  one,
  exec,
  withTransaction
}
