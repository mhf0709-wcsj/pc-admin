const tcb = require('@cloudbase/node-sdk')
const config = require('../config')

if (!config.tcb.env || !config.tcb.secretId || !config.tcb.secretKey) {
  throw new Error('Missing TCB_ENV_ID / TCB_SECRET_ID / TCB_SECRET_KEY environment variables')
}

const app = tcb.init({
  env: config.tcb.env,
  secretId: config.tcb.secretId,
  secretKey: config.tcb.secretKey,
  sessionToken: config.tcb.sessionToken || undefined
})

const db = app.database()

module.exports = {
  app,
  db,
  _: db.command
}
