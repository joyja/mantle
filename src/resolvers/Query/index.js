const { User } = require('../../auth')

const edgeNodes = async function (root, args, context, info) {
  const user = await User.getUserFromContext(context)
  return context.EdgeNodes
}

module.exports = {
  info: () => 'Data Acquisition and visualation for tentacle-edge devices.',
  edgeNodes,
}
