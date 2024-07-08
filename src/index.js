/**
 * The entrypoint for the action.
 */
const { run } = require('./main')

async function script() {
  await run()
}

module.exports = { script }
module.exports.init = async function () {
  await script()
}
