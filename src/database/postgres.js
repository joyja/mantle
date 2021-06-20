const logger = require('../logger')
const { Pool } = require('pg')
const uuidValidate = require('uuid-validate')

async function createUpdateAtFunction(client) {
  let sql = `CREATE OR REPLACE FUNCTION set_update_at()`
  sql = `${sql} RETURNS TRIGGER AS $$`
  sql = `${sql} BEGIN`
  sql = `${sql}   NEW.updated_at = NOW();`
  sql = `${sql}   RETURN NEW;`
  sql = `${sql} END;`
  sql = `${sql} $$ LANGUAGE plpgsql;`

  await client.query(sql)
}

async function createUpdateAtTrigger(client, tableName) {
  let sql = `DROP TRIGGER IF EXISTS set_${tableName}_update_at ON ${tableName}`
  await client.query(sql)
  sql = `CREATE TRIGGER set_${tableName}_update_at`
  sql = `${sql} BEFORE UPDATE ON ${tableName}`
  sql = `${sql} FOR EACH ROW`
  sql = `${sql} EXECUTE PROCEDURE set_update_at()`
  await client.query(sql)
}

async function createSettingsTable(client) {
  let sql = `CREATE TABLE IF NOT EXISTS settings (`
  sql = `${sql} id uuid PRIMARY KEY DEFAULT uuid_generate_v4()`
  sql = `${sql}, name TEXT`
  sql = `${sql}, value TEXT)`
  await client.query(sql)
  //Check if row exists for user_version
  sql = `SELECT * FROM settings WHERE name = $1`
  params = ['user_version']
  const result = await client.query(sql, params)
  if (result.rows.length < 1) {
    //If there isn't a user_version row, create one and set to version 1
    sql = `INSERT INTO settings (name, value) VALUES ($1,$2)`
    params = ['user_version', '1']
    await client.query(sql, params)
  }
}

class Database {
  constructor() {
    this.pool = new Pool({
      ssl: {
        rejectUnauthorized: false,
      },
    })
  }
  async init() {
    const client = await this.pool.connect()
    await createUpdateAtFunction(client)
    await createSettingsTable(client)
    let sql = `SELECT * FROM settings WHERE name = $1`
    params = ['user_version']
    const result = await this.query({ sql, params })
    this._userVersion = parseInt(result.rows[0].value)
  }
  async query({ sql, params, client }) {
    const tempClient = client ? client : await this.pool.connect()
    const result = await tempClient.query(sql, params)
    if (!client) {
      tempClient.release()
    }
    return result
  }
  get userVersion() {
    return this._userVersion
  }
  setUserVersion(value) {
    let sql = `UPDATE settings SET value=$1 WHERE name = $2`
    params = [value, 'user_version']
    this.query({ sql, params })
  }
}

class Model {
  // Creates the table in the database if it doesn't already exist per the fields property.
  static async createTable() {
    // fields should be formatted { colName, colType } for typical columns
    // fields should be formatted { colName, colRef, onDelete } for foreign key
    this.checkInitialized()
    let sql = `CREATE TABLE IF NOT EXISTS "${this.table}" (`
    sql = `${sql} "id" uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4()`
    this.fields.forEach((field) => {
      if (field.colRef) {
        sql = `${sql}, "${field.colName}" uuid`
      } else {
        sql = `${sql}, "${field.colName}" ${field.colType}`
      }
    })
    this.fields.forEach((field) => {
      if (field.colRef) {
        sql = `${sql}, FOREIGN KEY("${field.colName}") REFERENCES "${field.colRef}"("id") ON DELETE ${field.onDelete}`
      }
    })
    sql = `${sql});`
    const result = await this.db.query({ sql })
    for (const field of this.fields) {
      if (field.colRef) {
        sql = `CREATE INDEX IF NOT EXISTS idx_"${this.table}"_${field.colName} ON "${this.table}" (${field.colName});`
        await this.db.query({ sql })
      }
    }
    return result
  }
  // Checks the database version, whether the table exists, and sets the appropriate properties so children can react accordingly in their initialize states.
  // This creates the default getters and setters for fields (if they don't already exist on the child constructor)
  static async initialize(db, pubsub) {
    this.initialized = true
    this.db = db
    this.pubsub = pubsub
    let sql = `SELECT tablename FROM pg_catalog.pg_tables WHERE tablename=$1;`
    let params = [this.table]
    const result = await this.db.query({ sql, params })
    this.tableExisted = result.rows.length > 0
    this.fields.forEach((field) => {
      Object.defineProperty(this.prototype, field.colName, {
        get() {
          this.checkInit()
          return this[`_${field.colName}`]
        },
      })
      if (
        this.prototype[
          `set${field.colName.charAt(0).toUpperCase() + field.colName.slice(1)}`
        ] === undefined
      ) {
        this.prototype[
          `set${field.colName.charAt(0).toUpperCase() + field.colName.slice(1)}`
        ] = async function (newValue) {
          return this.update(this._id, field.colName, newValue).then(() => {
            this[`_${field.colName}`] = newValue
            return newValue
          })
        }
      }
    })
    await this.createTable()
    return this.getAll()
  }
  // The prototype needs to be initialized to perform some checks and actions before it is used. We use this to through an error if things aren't done in the right order.
  static checkInitialized() {
    if (!this.initialized) {
      throw Error(
        `you need to run .initialize() before running any methods or accessing properties on a subclass of model.`
      )
    }
  }
  // Looks through instances to see if there are any instances where the criteria key/value pairs match the same key/value pairs in the instance.
  static exists(criteria) {
    return this.instances.some((instance) => {
      return Object.keys(criteria).every((key) => {
        return criteria[key] === instance[key]
      })
    })
  }
  // This retreives instances from memory if there is one loaded with the appropriate ID. If one doesn't exist it will check the database.
  static async get(selector, ignoreExisting = false) {
    this.checkInitialized()
    let model = undefined
    if (uuidValidate(selector)) {
      if (!ignoreExisting) {
        model = this.instances.find((instance) => {
          return instance._id === selector
        })
      }
      if (!model) {
        model = new this(selector)
        await model.init()
      }
      return model
    } else {
      logger.error(
        new Error('Must provide an id (Type of Number) as selector.')
      )
    }
  }
  // Clears instances loaded into memory and retrieves all the instances from the database.
  static async getAll() {
    this.checkInitialized()
    let sql = `SELECT "id" FROM "${this.table}"`
    this.instances = []
    const result = await this.db.query({ sql })
    const instances = await Promise.all(
      result.rows.map((row) => {
        return this.get(row.id, true)
      })
    )
    this.instances = instances
    return instances
  }
  // Create an instance in the database and load it into memory.
  static async create(fields) {
    this.checkInitialized()
    const sql = `INSERT INTO "${this.table}" ("${Object.keys(fields).join(
      `","`
    )}") VALUES (${Array(Object.keys(fields).length)
      .fill('')
      .map((val, idx) => {
        return `$${idx + 1}`
      })
      .join(',')}) RETURNING id`
    const params = Object.keys(fields).map((key) => fields[key])
    const result = await this.db.query({ sql, params })
    return this.get(result.rows[0].id, false)
  }
  // delete an instance from the databse and in memory.
  static async delete(selector) {
    this.checkInitialized()
    const sql = `DELETE FROM "${this.table}" WHERE id=$1`
    await this.db.query({ sql }, [selector])
    this.instances = this.instances.filter((instance) => {
      return `${instance._id}` !== `${selector}`
    })
    return selector
  }
  // retrieves and instance by id from memory.
  static findById(id) {
    this.checkInitialized()
    return this.instances.find((instance) => {
      return instance.id === id
    })
  }
  constructor(selector) {
    const Subclass = this.constructor
    Subclass.checkInitialized()
    this.db = Subclass.db
    this.pubsub = Subclass.pubsub
    this.initialized = false
    this.errors = []
    if (uuidValidate(selector)) {
      this._id = selector
      const exists = Subclass.instances.some((instance) => {
        return instance._id === selector
      })
      if (!exists) {
        Subclass.instances.push(this)
      } else {
        logger.error(
          new Error(
            `A ${Subclass.table} with this id already exists. Use get() method to get the existing instance.`
          )
        )
      }
    } else {
      logger.error(
        new Error('Must provide an id (Type of Number) as selector.')
      )
    }
  }
  // initialize the instance: pull the fields from the database and initialize the _fieldName properties.
  async init() {
    const sql = `SELECT * FROM "${this.constructor.table}" WHERE id=$1`
    let result
    try {
      result = await this.constructor.db.query({ sql, params: [this._id] })
      if (result.length < 1) {
        throw new Error(
          `There is no ${this.constructor.table} with id# ${this._id}.`
        )
      } else {
        this.initialized = true
        this._id = result.rows[0].id
      }
    } catch (error) {
      this.constructor.instances = this.constructor.instances.filter(
        (instance) => {
          return instance._id !== this._id
        }
      )
      this.errors.push(error)
      logger.error(error)
    }
    this.constructor.fields.forEach((field) => {
      this[`_${field.colName}`] = result.rows[0][field.colName]
    })
    return result.rows[0]
  }
  // Checks if the instance has been initialized. Used to make sure things are setup and accessed in the appopriate order.
  checkInit() {
    if (!this.initialized) {
      throw new Error(
        `you need to run .init() before running any methods or accessing properties on this ${this.constructor.name} instance.`
      )
    }
  }
  // Update a field value in the database and in memory.
  update(selector, field, value) {
    const sql = `UPDATE "${this.constructor.table}" SET "${field}"=$1 WHERE id=$2 RETURNING id`
    const params = [value, selector]
    return this.constructor.db.query({ sql, params }).then(() => value)
  }
  // Delete this instance (using the constructors delete function)
  async delete() {
    await this.constructor.delete(this.id)
    return this
  }
  // The id getter. It just makes sure the models initialized before the field is accessed.
  get id() {
    this.checkInit()
    return this._id
  }
}

module.exports = {
  Database,
  Model,
}
