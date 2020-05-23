#!/usr/bin/env node

const path = require('path')
const sqlite3 = require('sqlite3').verbose()
const { GraphQLServer, PubSub } = require('graphql-yoga')
const resolvers = require('./resolvers')
const { executeQuery } = require('./database/model')
const fs = require('fs')
const logger = require('./logger')

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
      await context.db.get(`PRAGMA user_version = ${desiredUserVersion}`)
      resolve()
    })
  })
  process.on('SIGINT', async () => {
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
