#!/usr/bin/env node

const path = require('path')
const sqlite3 = require('sqlite3').verbose()
const { GraphQLServer, PubSub } = require('graphql-yoga')
const resolvers = require('./resolvers')
const EdgeNode = require('./edgenode')
const { executeQuery } = require('./database/model')
const fs = require('fs')
const logger = require('./logger')
const mqttClient = require('./mqtt')

const desiredUserVersion = 1

let db = undefined
let httpServer = undefined
let server = undefined
const start = async function (dbFilename) {
  let fileExisted = false
  // Create database
  if (dbFilename === `:memory:`) {
    db = new sqlite3.Database(`:memory:`, (error) => {
      if (error) {
        throw error
      }
    })
  } else {
    if (fs.existsSync(`./${dbFilename}.db`)) {
      fileExisted = true
    }
    db = new sqlite3.cached.Database(`./${dbFilename}.db`, (error) => {
      if (error) {
        throw error
      }
    })
  }
  const pubsub = new PubSub()
  server = new GraphQLServer({
    typeDefs: path.join(__dirname, '/schema.graphql'),
    resolvers,
    context: (req) => ({
      ...req,
      pubsub,
      db,
    }),
  })

  await new Promise(async (resolve, reject) => {
    httpServer = await server.start(async () => {
      const context = server.context()
      await executeQuery(context.db, 'PRAGMA foreign_keys = ON', [], true)
      const { user_version: userVersion } = await executeQuery(
        context.db,
        'PRAGMA user_version',
        [],
        true
      )
      if (
        dbFilename !== ':memory:' &&
        fileExisted &&
        userVersion !== desiredUserVersion
      ) {
        fs.copyFileSync(
          `./${dbFilename}.db`,
          `./${dbFilename}-backup-${new Date().toISOString()}.db`
        )
      }
      await EdgeNode.initialize(context.db, context.pubusub)
      await context.db.get(`PRAGMA user_version = ${desiredUserVersion}`)
      resolve()
    })
  })

  const mqtt = new mqttClient({
    serverUrl: 'tcp://jar3.internal1.jarautomation.io:1883',
    username: '',
    password: '',
    primaryHostId: `mantle1`,
  })

  mqtt.on('nbirth', async ({ topic, groupId, name, payload }) => {
    let edgenode = EdgeNode.findByGroupIdAndName(groupId, name)
    if (edgenode) {
      console.log(
        `Found edge node ${edgenode.id} with group: ${groupId} and name: ${name}`
      )
    } else {
      edgenode = await EdgeNode.create(groupId, name, '')
      console.log(
        `Created edge node ${edgenode.id} with group: ${groupId} and name: ${name}`
      )
    }
  })

  mqtt.on('dbirth', ({ topic, groupId, node, name, payload }) => {
    let edgenode = EdgeNode.findByGroupIdAndName(groupId, node)
    if (edgenode) {
      edgenode.addOrUpdateDevice(name, payload)
    } else {
      console.log(`Detected device birth for node that doesn't exist.`)
    }
    // console.log(topic)
    // console.log(groupId)
    // console.log(name)
    // console.log(payload)
  })

  mqtt.on('ddeath', ({ topic, groupId, name, payload }) => {
    // console.log(topic)
    // console.log(groupId)
    // console.log(name)
    // console.log(payload)
  })

  mqtt.on('ndeath', ({ topic, groupId, name, payload }) => {
    // console.log(topic)
    // console.log(groupId)
    // console.log(name)
    // console.log(payload)
  })

  mqtt.publishHostOnline()

  process.on('SIGINT', async () => {
    mqtt.stop()
    await stop()
  })
}

const stop = async function () {
  try {
    db.close()
  } catch (error) {}
  httpServer.close()
}

module.exports = { start, stop }
