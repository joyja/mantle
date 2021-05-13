const mqtt = require('mqtt')
const sparkplug = require('sparkplug-payload')
const sparkplugbpayload = sparkplug.get('spBv1.0')
const EventEmitter = require('events')
const util = require('util')
const pako = require('pako')
const logger = require('./logger')
const { isThisSecond } = require('date-fns')
const { encodePayload } = require('sparkplug-payload/lib/sparkplugbpayload')

const compressed = 'SBV1.0_COMPRESSED'

logger.level = 'warn'

const getRequiredProperty = function (config, propName) {
  if (config[propName] !== undefined) {
    return config[propName]
  }
  throw new Error("Missing required configuration property '" + propName + "'")
}

const getProperty = function (config, propName, defaultValue) {
  if (config[propName] !== undefined) {
    return config[propName]
  } else {
    return defaultValue
  }
}

class MqttClient extends EventEmitter {
  constructor(config) {
    super()
    this.serverUrl = getRequiredProperty(config, 'serverUrl')
    this.username = getRequiredProperty(config, 'username')
    this.password = getRequiredProperty(config, 'password')
    this.version = getProperty(config, 'version', 'spBv1.0')
    this.primaryHostId = getRequiredProperty(config, 'primaryHostId')
    this.client = null
    this.connecting = false
    this.connected = false

    const clientOptions = {
      clean: true,
      keepalive: 5,
      reschedulePings: false,
      connectionTimeout: 30,
      username: this.username,
      password: this.password,
      will: {
        topic: `STATE/${this.primaryHostId}`,
        payload: `OFFLINE`,
        qos: 0,
        retain: true,
      },
    }

    // Connect to the MQTT Server
    this.connecting = true
    logger.debug('Attempting to connect: ' + this.serverUrl)
    logger.debug('              options: ' + JSON.stringify(clientOptions))
    this.client = mqtt.connect(this.serverUrl, clientOptions)
    logger.debug('Finished attempting to connect')

    /*
     * 'connect' handler
     */
    this.client.on('connect', () => {
      logger.info('Client has connected')
      this.connecting = false
      this.connected = false
      this.emit('connect')
      // Subscribe to sparkplugB messages.
      logger.info(
        'Subscribing to control/command messages for both the edge node and the attached devices'
      )
      this.client.subscribe(`${this.version}/#`, { qos: 0 })
      this.emit('birth')
    })

    /*
     * 'error' handler
     */
    this.client.on('error', (error) => {
      if (this.connecting) {
        this.emit('error', error)
        this.client.end()
      }
    })

    /*
     * 'close' handler
     */
    this.client.on('close', () => {
      if (this.connected) {
        this.connected = false
        this.emit('close')
      }
    })

    /*
     * 'reconnect' handler
     */
    this.client.on('reconnect', () => {
      this.emit('reconnect')
    })

    /*
     * 'offline' handler
     */
    this.client.on('offline', () => {
      this.emit('offline')
    })

    /*
     * 'packetsend' handler
     */
    this.client.on('packetsend', (packet) => {
      logger.debug(`packetsend: ${packet.cmd}`)
    })

    /*
     * 'packetreceive' handler
     */
    this.client.on('packetreceive', (packet) => {
      logger.debug(`packetreceive: ${packet.cmd}`)
    })

    /*
     * 'message' handler
     */
    this.client.on('message', (topic, message) => {
      let payload, timestamp, splitTopic, metrics
      try {
        payload = this.maybeDecompressPayload(this.decodePayload(message))
        timestamp = payload.timestamp
      } catch (error) {
        console.log(error)
        payload = message
      }

      this.messageAlert('arrived', topic, payload)
      // Split the topic up into tokens
      splitTopic = topic.split('/')
      if (splitTopic[0] === this.version && splitTopic[2] === 'DDATA') {
        this.emit('ddata', {
          topic,
          groupId: splitTopic[1],
          node: splitTopic[3],
          name: splitTopic[4],
          payload,
        })
      } else if (splitTopic[0] === this.version && splitTopic[2] === 'NBIRTH') {
        this.emit('nbirth', {
          topic,
          groupId: splitTopic[1],
          name: splitTopic[3],
          payload,
        })
      } else if (splitTopic[0] === this.version && splitTopic[2] === 'DBIRTH') {
        this.emit('dbirth', {
          topic,
          groupId: splitTopic[1],
          node: splitTopic[3],
          name: splitTopic[4],
          payload,
        })
      } else if (splitTopic[0] === this.version && splitTopic[2] === 'NDEATH') {
        this.emit('ndeath', {
          topic,
          groupId: splitTopic[1],
          name: splitTopic[3],
          payload,
        })
      } else if (splitTopic[0] === this.version && splitTopic[2] === 'DDEATH') {
        this.emit('ddeath', {
          topic,
          groupId: splitTopic[1],
          node: splitTopic[3],
          name: splitTopic[4],
          payload,
        })
      } else {
        logger.info(`Message received on unknown topic ${topic}`)
      }
    })
  }
  decodePayload(payload) {
    return sparkplugbpayload.decodePayload(payload)
  }
  messageAlert(alert, topic, payload) {
    logger.debug(`Message ${alert}`)
    logger.debug(`topic: ${topic}`)
    logger.debug(`payload: ${JSON.stringify(payload)}`)
  }
  compressPayload(payload, options) {
    var algorithm = null,
      compressedPayload,
      resultPayload = {
        uuid: compressed,
      }

    logger.debug('Compressing payload ' + JSON.stringify(options))

    // See if any options have been set
    if (options !== undefined && options !== null) {
      // Check algorithm
      if (options['algorithm']) {
        algorithm = options['algorithm']
      }
    }

    if (algorithm === null || algorithm.toUpperCase() === 'DEFLATE') {
      logger.debug('Compressing with DEFLATE!')
      resultPayload.body = pako.deflate(payload)
    } else if (algorithm.toUpperCase() === 'GZIP') {
      logger.debug('Compressing with GZIP')
      resultPayload.body = pako.gzip(payload)
    } else {
      throw new Error('Unknown or unsupported algorithm ' + algorithm)
    }

    // Create and add the algorithm metric if is has been specified in the options
    if (algorithm !== null) {
      resultPayload.metrics = [
        {
          name: 'algorithm',
          value: algorithm.toUpperCase(),
          type: 'string',
        },
      ]
    }

    return resultPayload
  }
  decompressPayload(payload) {
    var metrics = payload.metrics,
      algorithm = null

    logger.debug('Decompressing payload')

    if (metrics !== undefined && metrics !== null) {
      for (var i = 0; i < metrics.length; i++) {
        if (metrics[i].name === 'algorithm') {
          algorithm = metrics[i].value
        }
      }
    }

    if (algorithm === null || algorithm.toUpperCase() === 'DEFLATE') {
      logger.debug('Decompressing with DEFLATE!')
      return pako.inflate(payload.body)
    } else if (algorithm.toUpperCase() === 'GZIP') {
      logger.debug('Decompressing with GZIP')
      return pako.ungzip(payload.body)
    } else {
      throw new Error('Unknown or unsupported algorithm ' + algorithm)
    }
  }
  maybeCompressPayload(payload, options) {
    if (options !== undefined && options !== null && options.compress) {
      // Compress the payload
      return compressPayload(encodePayload(payload), options)
    } else {
      // Don't compress the payload
      return payload
    }
  }
  maybeDecompressPayload(payload) {
    if (payload.uuid !== undefined && payload.uuid === compressed) {
      // Decompress the payload
      return decodePayload(decompressPayload(payload))
    } else {
      // The payload is not compressed
      return payload
    }
  }
  publishHostOnline() {
    const topic = `STATE/${this.primaryHostId}`
    const payload = 'ONLINE'
    logger.info('Publishing Primary Host Online.')
    this.client.publish(topic, payload, { retain: true })
    this.messageAlert('published', topic, payload)
  }
  publishHostOffline() {
    const topic = `STATE/${this.primaryHostId}`
    const payload = 'OFFLINE'
    logger.info('Publish Primary Host Offline.')
    this.client.publish(topic, payload, { retain: true })
    this.messageAlert('published', topic, payload)
  }
  stop() {
    this.publishHostOffline()
    this.client.end()
  }
}

module.exports = MqttClient
