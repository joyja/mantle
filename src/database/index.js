const model = require('./model')
const postgresql = require('./postgresql')

module.exports = {
  ...model,
  postgresql,
}
