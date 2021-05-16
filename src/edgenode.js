const { Model } = require('./database')
const getUnixTime = require('date-fns/getUnixTime')
const fromUnixTime = require('date-fns/fromUnixTime')

class EdgeNode extends Model {
  static async initialize(db, pubsub) {
    await EdgeDevice.initialize(db, pubsub)
    await EdgeNodeControl.initialize(db, pubsub)
    await EdgeNodeInfo.initialize(db, pubsub)
    return super.initialize(db, pubsub)
  }
  static create(group, name, description) {
    const createdOn = getUnixTime(new Date())
    const fields = {
      group,
      name,
      description,
      createdOn,
    }
    return super.create(fields)
  }
  static findByGroupIdAndName(groupId, name) {
    if (groupId && name) {
      return this.instances.find((instance) => {
        return instance.group === groupId && instance.name === name
      })
    } else {
      if (!groupId) {
        log.error(
          'groupId must be provided when searching for EdgeNode by groupId and Name.'
        )
      } else if (!name) {
        log.error(
          'name must be provided when searching for EdgeNode by groupId and Name.'
        )
      } else {
        log.error('invalid name or groupId provided.')
      }
    }
  }
  async init() {
    const result = await super.init()
    this._group = result.group
    this._name = result.name
    this._description = result.description
    this._createdOn = result.createdOn
  }
  async addOrUpdateDevice(name, payload) {
    this.checkInit()
    let device = this.devices.find((device) => {
      return device.name === name
    })
    if (!device) {
      device = await EdgeDevice.create(this.id, name, '')
    }
    device.metrics.forEach((metric) => {
      metric.stale = true
    })
    for (const metric of payload.metrics) {
      await device.createOrUpdateMetric(metric)
    }
  }
  get group() {
    this.checkInit()
    return this._group
  }
  setGroup(value) {
    return this.update(this.id, 'group', value).then(
      (result) => (this._group = result)
    )
  }
  get name() {
    this.checkInit()
    return this._name
  }
  setName(value) {
    return this.update(this.id, 'name', value).then(
      (result) => (this._name = result)
    )
  }
  get description() {
    this.checkInit()
    return this._description
  }
  setDescription(value) {
    return this.update(this.id, 'description', value).then(
      (result) => (this._description = result)
    )
  }
  get createdOn() {
    this.checkInit()
    return fromUnixTime(this._createdOn)
  }
  findDeviceByName(name) {
    return this.devices.find((device) => {
      return name === device.name
    })
  }
  get devices() {
    this.checkInit()
    return EdgeDevice.instances.filter((instance) => {
      return instance.edgenode.id === this.id
    })
  }
  get control() {
    this.checkInit()
    return EdgeNodeControl.instances.filter((instance) => {
      return instance.edgenode.id === this.id
    })
  }
  get info() {
    this.checkInit()
    return EdgeNodeInfo.instances.filter((instance) => {
      return instance.edgenode.id === this.id
    })
  }
}
EdgeNode.table = `edgenode`
EdgeNode.fields = [
  { colName: 'group', colType: 'TEXT' },
  { colName: 'name', colType: 'TEXT' },
  { colName: 'description', colType: 'TEXT' },
  { colName: 'createdOn', colType: 'INTEGER' },
]
EdgeNode.instances = []
EdgeNode.initialized = false

class EdgeDevice extends Model {
  static async initialize(db, pubsub) {
    EdgeDeviceMetric.initialize(db, pubsub)
    super.initialize(db, pubsub)
  }
  static create(edgenode, name, description) {
    const createdOn = getUnixTime(new Date())
    const fields = {
      edgenode,
      name,
      description,
      createdOn,
    }
    return super.create(fields)
  }
  async init() {
    const result = await super.init()
    this._edgenode = result.edgenode
    this._name = result.name
    this._description = result.description
    this._createdOn = result.createdOn
  }
  async createOrUpdateMetric({ name, type, value, timestamp }) {
    this.checkInit()
    let metric = this.metrics.find((metric) => {
      return metric.name === name
    })
    if (metric) {
      await metric.setDatatype(type)
      // console.log(`${metric.name}: ${metric.value}`)
      if (metric.value !== value) {
        await metric.log()
      }
      await metric.setValue(value)
      await metric.setTimestamp(timestamp)
    } else {
      metric = await EdgeDeviceMetric.create(
        this.id,
        name,
        '',
        type,
        value,
        timestamp
      )
      metric.log()
    }
  }
  get edgenode() {
    this.checkInit()
    return EdgeNode.findById(this._edgenode)
  }
  get name() {
    this.checkInit()
    return this._name
  }
  setName(value) {
    return this.update(this.id, 'name', value).then(
      (result) => (this._name = result)
    )
  }
  get description() {
    this.checkInit()
    return this._description
  }
  setDescription(value) {
    return this.update(this.id, 'description', value).then(
      (result) => (this._description = result)
    )
  }
  get createdOn() {
    this.checkInit()
    return fromUnixTime(this._createdOn)
  }
  get metrics() {
    this.checkInit()
    return EdgeDeviceMetric.instances.filter((instance) => {
      return instance.edgedevice.id === this.id
    })
  }
}
EdgeDevice.table = `edgedevice`
EdgeDevice.fields = [
  { colName: 'edgenode', colRef: 'edgenode', onDelete: 'CASCADE' },
  { colName: 'name', colType: 'TEXT' },
  { colName: 'description', colType: 'TEXT' },
  { colName: 'createdOn', colType: 'INTEGER' },
]
EdgeDevice.instances = []
EdgeDevice.initialized = false

class EdgeNodeControl extends Model {
  static create(name, description) {
    const createdOn = getUnixTime(new Date())
    const fields = {
      name,
      description,
      datatype,
      value,
      createdOn,
    }
    return super.create(fields)
  }
  async init() {
    const result = await super.init()
    this._name = result.name
    this._description = result.description
    this._datatype = result.datatype
    this._value = result.value
    this._createdOn = result.createdOn
  }
  get name() {
    this.checkInit()
    return this._name
  }
  setName(value) {
    return this.update(this.id, 'name', value).then(
      (result) => (this._name = result)
    )
  }
  get description() {
    this.checkInit()
    return this._description
  }
  setDescription(value) {
    return this.update(this.id, 'description', value).then(
      (result) => (this._description = result)
    )
  }
  get createdOn() {
    this.checkInit()
    return fromUnixTime(this._createdOn)
  }
  get datatype() {
    this.checkInit()
    return this._datatype
  }
  setDatatype(value) {
    return this.update(this.id, 'Datatype', value).then(
      (result) => (this._datatype = result)
    )
  }
  get value() {
    this.checkInit()
    return this._value
  }
  setValue(value) {
    return this.update(this.id, 'value', value).then(
      (result) => (this._value = result)
    )
  }
}
EdgeNodeControl.table = `edgenodecontrol`
EdgeNodeControl.fields = [
  { colName: 'edgenode', colRef: 'edgenode', onDelete: 'CASCADE' },
  { colName: 'name', colType: 'TEXT' },
  { colName: 'description', colType: 'TEXT' },
  { colName: 'datatype', colType: 'TEXT' },
  { colName: 'value', colType: 'TEXT' },
  { colName: 'createdOn', colType: 'INTEGER' },
]

class EdgeNodeInfo extends Model {
  static create(name, description) {
    const createdOn = getUnixTime(new Date())
    const fields = {
      name,
      description,
      datatype,
      value,
      createdOn,
    }
    return super.create(fields)
  }
  async init() {
    const result = await super.init()
    this._name = result.name
    this._description = result.description
    this._datatype = result.datatype
    this._value = result.value
    this._createdOn = result.createdOn
  }
  get name() {
    this.checkInit()
    return this._name
  }
  setName(value) {
    return this.update(this.id, 'name', value).then(
      (result) => (this._name = result)
    )
  }
  get description() {
    this.checkInit()
    return this._description
  }
  setDescription(value) {
    return this.update(this.id, 'description', value).then(
      (result) => (this._description = result)
    )
  }
  get createdOn() {
    this.checkInit()
    return fromUnixTime(this._createdOn)
  }
  get datatype() {
    this.checkInit()
    return this._datatype
  }
  setDatatype(value) {
    return this.update(this.id, 'Datatype', value).then(
      (result) => (this._datatype = result)
    )
  }
  get value() {
    this.checkInit()
    return this._value
  }
  setValue(value) {
    return this.update(this.id, 'value', value).then(
      (result) => (this._value = result)
    )
  }
}
EdgeNodeInfo.table = `edgenodeinfo`
EdgeNodeInfo.fields = [
  { colName: 'edgenode', colRef: 'edgenode', onDelete: 'CASCADE' },
  { colName: 'name', colType: 'TEXT' },
  { colName: 'description', colType: 'TEXT' },
  { colName: 'datatype', colType: 'TEXT' },
  { colName: 'value', colType: 'TEXT' },
  { colName: 'createdOn', colType: 'INTEGER' },
]

class EdgeDeviceMetric extends Model {
  static async createTable() {
    const result = await super.createTable()
    let sql = `CREATE TABLE IF NOT EXISTS "edgedevicemetrichistory" (`
    sql = `${sql} "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE`
    sql = `${sql}, "edgedevicemetric" INTEGER`
    sql = `${sql}, "value" TEXT`
    sql = `${sql}, "timestamp" INTEGER`
    sql = `${sql}, FOREIGN KEY("edgedevicemetric") REFERENCES "edgedevicemetric"("id") ON DELETE CASCADE);`
    await this.executeUpdate(sql)
    sql = `CREATE INDEX IF NOT EXISTS idx_edgedevicemetrichistory_edgedevicemetric ON edgedevicemetrichistory (edgedevicemetric);`
    await this.executeUpdate(sql)
    return result
  }
  static create(edgedevice, name, description, datatype, value, timestamp) {
    const createdOn = getUnixTime(new Date())
    const fields = {
      edgedevice,
      name,
      description,
      datatype,
      value,
      timestamp,
      createdOn,
    }
    return super.create(fields)
  }
  async init() {
    const result = await super.init()
    this._edgedevice = result.edgedevice
    this._name = result.name
    this._description = result.description
    this._datatype = result.datatype
    this._value = result.value
    this._timestamp = result.timestamp
    this._createdOn = result.createdOn
    this.stale = false
  }
  async log() {
    let sql = `INSERT INTO edgedevicemetrichistory (edgedevicemetric, value, timestamp) VALUES (?, ?, ?)`
    let params = [this.id, this.value, this.timestamp]
    await this.constructor.executeUpdate(sql, params)
  }
  async getHistory() {
    let sql = `SELECT * FROM edgedevicemetrichistory WHERE edgedevicemetric=? AND timestamp > ?`
    let params = [this.id, getUnixTime(new Date()) - 300]
    const result = await this.constructor.executeQuery(sql, params)
    return result.map((row) => {
      return {
        ...row,
        timestamp: fromUnixTime(row.timestamp),
      }
    })
  }
  get edgedevice() {
    this.checkInit()
    return EdgeDevice.findById(this._edgedevice)
  }
  get name() {
    this.checkInit()
    return this._name
  }
  setName(value) {
    return this.update(this.id, 'name', value).then(
      (result) => (this._name = result)
    )
  }
  get description() {
    this.checkInit()
    return this._description
  }
  setDescription(value) {
    return this.update(this.id, 'description', value).then(
      (result) => (this._description = result)
    )
  }
  get createdOn() {
    this.checkInit()
    return fromUnixTime(this._createdOn)
  }
  get datatype() {
    this.checkInit()
    return this._datatype
  }
  setDatatype(value) {
    return this.update(this.id, 'datatype', value).then(
      (result) => (this._datatype = result)
    )
  }
  get value() {
    this.checkInit()
    return this._value
  }
  setValue(value) {
    return this.update(this.id, 'value', value).then(
      (result) => (this._value = result)
    )
  }
  get timestamp() {
    this.checkInit()
    return fromUnixTime(this._timestamp)
  }
  setTimestamp(value) {
    return this.update(this.id, 'timestamp', value).then(
      (result) => (this._timestamp = result)
    )
  }
}
EdgeDeviceMetric.table = `edgedevicemetric`
EdgeDeviceMetric.fields = [
  { colName: 'edgedevice', colRef: 'edgedevice', onDelete: 'CASCADE' },
  { colName: 'name', colType: 'TEXT' },
  { colName: 'description', colType: 'TEXT' },
  { colName: 'datatype', colType: 'TEXT' },
  { colName: 'value', colType: 'TEXT' },
  { colName: 'timestamp', colType: 'INTEGER' },
  { colName: 'createdOn', colType: 'INTEGER' },
]

module.exports = EdgeNode
