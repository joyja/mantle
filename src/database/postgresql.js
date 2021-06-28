const { Pool } = require('pg')

const pool = new Pool({
  user: process.env.MANTLE_PGUSER,
  host: process.env.MANTLE_PGHOST,
  database: process.env.MANTLE_PGDATABASE,
  password: process.env.MANTLE_PGPASSWORD,
  port: process.env.MANTLE_PGPORT,
  ssl: {
    rejectUnauthorized: false,
  },
})

module.exports = {
  pool,
}
