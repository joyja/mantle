const { login, changePassword } = require('./auth')

const edgeDeviceMetricHistory = async function (root, args, context, info) {
  const node = context.EdgeNodes.find((instance) => {
    return instance.name === args.nodeName
  })
  if (!node) {
    throw Error(`There is no node with the name ${args.nodeName}`)
  }
  const device = node.devices.find((device) => {
    return device.name === args.deviceName
  })
  if (!device) {
    throw Error(
      `There is no device with the name ${args.deviceName} on ${args.nodeName}`
    )
  }
  const metric = device.metrics.find((metric) => {
    return metric.name === args.metricName
  })
  if (!metric) {
    throw Error(
      `There is no metric with the name ${args.metricName} on device: ${args.deviceName} on node: ${args.nodeName}`
    )
  }
  console.log(await metric.getHistory())
  return metric.getHistory()
}

module.exports = {
  login,
  changePassword,
  edgeDeviceMetricHistory,
}
