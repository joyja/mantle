const EdgeNodes = async function (root, args, context, info) {
  return context.EdgeNodes
}

module.exports = {
  info: () => 'Data Acquisition and visualation for tentacle-edge devices.',
  EdgeNodes,
}
