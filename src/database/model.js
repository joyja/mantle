const sqlite = require('./sqlite')
const postgres = require('./postgres')

if (process.env.MANTLE_DB === 'postgres') {
  module.exports = {
    ...postgres,
  }
} else {
  module.exports = {
    ...sqlite,
  }
}
