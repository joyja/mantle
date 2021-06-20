#!/usr/bin/env node

const http = require('http')
const path = require('path')
const sqlite3 = require('sqlite3').verbose()
const express = require('express')
const { ApolloServer, PubSub, gql } = require('apollo-server-express')
const resolvers = require('./resolvers')
const EdgeNode = require('./edgenode')
const { Database } = require('./database')
const fs = require('fs')
const logger = require('./logger')
const mqttClient = require('./mqtt')

const desiredUserVersion = 1

const app = express()

app.use(express.json())

let db = undefined
let httpServer = undefined
let graphqlServer = undefined
let listenHost = process.env.MANTLE_HOST || 'localhost'
let listenPort = process.env.MANTLE_PORT || 4000

const start = async function (dbFilename) {
  const dir = './database'

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }
  let fileExisted = false
  // Create database
  db = new Database(dbFilename, desiredUserVersion)
  const pubsub = new PubSub()
  graphqlServer = new ApolloServer({
    typeDefs: gql`
      ${fs.readFileSync(__dirname.concat('/schema.graphql'), 'utf8')}
    `,
    resolvers,
    subscriptions: {
      path: '/',
    },
    context: (req) => ({
      ...req,
      EdgeNodes: EdgeNode.instances,
      pubsub,
      db,
    }),
    introspection: true,
    playground: true,
  })
  graphqlServer.applyMiddleware({ app, path: '/' })

  httpServer = http.createServer(app)
  graphqlServer.installSubscriptionHandlers(httpServer)

  await new Promise(async (resolve, reject) => {
    httpServer.listen(listenPort, listenHost, async () => {
      const context = graphqlServer.context()
      await db.init()
      await EdgeNode.initialize(db, context.pubusub)
      await db.setUserVersion(desiredUserVersion)
      resolve()
    })
  })

  const mqtt = new mqttClient({
    serverUrl:
      process.env.NODE_ENV === 'production'
        ? 'tcp://mosquitto-1.lxd:1883'
        : 'ssl://mosquitto.jarautomation.io:37010',
    username: 'joyja',
    password: 'pLLJtj1txGZ4JdrrF2OS',
    primaryHostId: `mantle1`,
  })

  mqtt.on('ddata', async ({ topic, groupId, node, name, payload }) => {
    let edgenode = EdgeNode.findByGroupIdAndName(groupId, node)
    if (edgenode) {
      // console.log(
      //   `Found edge node ${edgenode.id} with group: ${groupId} and name: ${name}`
      // )
      let edgedevice = edgenode.findDeviceByName(name)
      if (edgedevice) {
        for (metric of payload.metrics) {
          await edgedevice.createOrUpdateMetric(metric)
        }
      } else {
        console.log(`Detected data for device that doesn't exist on node.`)
      }
    } else {
      console.log(`Detected data for node that doesn't exist`)
    }
  })

  mqtt.on('nbirth', async ({ topic, groupId, name, payload }) => {
    let edgenode = EdgeNode.findByGroupIdAndName(groupId, name)
    if (edgenode) {
      // console.log(
      //   `Found edge node ${edgenode.id} with group: ${groupId} and name: ${name}`
      // )
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
