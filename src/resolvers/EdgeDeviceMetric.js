const history = async function (parent, args, context, info) {
  return parent.getHistory()
}

module.exports = {
  history,
}
