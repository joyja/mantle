const { Model } = require('./database')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const MANTLE_AUTH_SECRET =
  process.env.MANTLE_AUTH_SECRET || 'mantle_development'
const MANTLE_DEFAULT_ADMIN_USERNAME =
  process.env.MANTLE_DEFAULT_ADMIN_USERNAME || 'admin'
const MANTLE_DEFAULT_ADMIN_PASSWORD =
  process.env.MANTLE_DEFAULT_ADMIN_PASSWORD || 'password'

class User extends Model {
  static async initialize(db, pubsub) {
    const result = await super.initialize(db, pubsub)
    const rootUser = User.instances.find((user) => {
      return user.username === MANTLE_DEFAULT_ADMIN_USERNAME
    })
    if (!rootUser) {
      await User.create(
        MANTLE_DEFAULT_ADMIN_USERNAME,
        MANTLE_DEFAULT_ADMIN_PASSWORD
      )
    }
    return result
  }
  static async create(username, password) {
    const hash = await bcrypt.hash(password, 10)
    const fields = {
      username,
      password: hash,
    }
    return super.create(fields)
  }
  static async login(username, password) {
    const user = User.instances.find((user) => {
      return user.username === username
    })
    const errorMessage = 'The username or password is incorrect.'
    if (user) {
      const valid = await bcrypt.compare(password, user.password)
      if (!valid) {
        throw new Error(errorMessage)
      } else {
        const token = jwt.sign(
          {
            userId: user.id,
          },
          MANTLE_AUTH_SECRET,
          { expiresIn: '7d' }
        )
        return {
          token,
          user,
        }
      }
    } else {
      throw new Error(errorMessage)
    }
  }
  static async getUserFromContext(context) {
    const secret = MANTLE_AUTH_SECRET
    const errorMessage = `You are not authorized.`
    const authorization = context.req
      ? context.req.headers.authorization
      : context.connection.context.Authorization
    if (authorization) {
      const token = authorization.replace('Bearer ', '')
      try {
        const { userId } = jwt.verify(token, secret)
        return User.get(userId)
      } catch (error) {
        throw new Error(errorMessage)
      }
    } else {
      throw new Error(errorMessage)
    }
  }
  static async changePassword(context, oldPassword, newPassword) {
    const user = await User.getUserFromContext(context)
    const valid = await bcrypt.compare(oldPassword, user.password)
    if (!valid) {
      throw new Error('Invalid old password.')
    } else {
      await user.setPassword(newPassword)
      return user
    }
  }
  async init() {
    const result = await super.init()
    this._username = result.username
    this._password = result.password
  }
  get username() {
    this.checkInit()
    return this._username
  }
  setUsername(newValue) {
    return this.update(this.id, `username`, newValue).then((result) => {
      this._username = newValue
    })
  }
  get password() {
    this.checkInit()
    return this._password
  }
  async setPassword(newValue) {
    const password = await bcrypt.hash(newValue, 10)
    return this.update(this.id, `password`, password, User).then((result) => {
      this._password = password
    })
  }
}
User.table = `user`
User.fields = [
  { colName: 'username', colType: 'TEXT' },
  { colName: 'password', colType: 'TEXT' },
]
User.instances = []
User.initialized = false

module.exports = {
  User,
}
