const core = require('@actions/core')
const { wait } = require('./wait')
const yaml = require('js-yaml')
const fs = require('fs')
const { runIntegrationTests } = require('./data-caterer')
const execSync = require('child_process').execSync

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
  try {
    const configFile = process.env.CONFIGURATION_FILE
      ? process.env.CONFIGURATION_FILE
      : core.getInput('configuration-file', {})
    const instaInfraFolder = process.env.INSTA_INFRA_FOLDER
      ? process.env.INSTA_INFRA_FOLDER
      : core.getInput('insta-infra-folder', {})

    // Debug logs are only output if the `ACTIONS_STEP_DEBUG` secret is true
    core.debug(`Using config file: ${configFile}`)
    core.debug(`Using insta-infra folder: ${instaInfraFolder}`)
    const result = runIntegrationTests(configFile, instaInfraFolder)

    // Set outputs for other workflow steps to use
    core.setOutput('results', result)
  } catch (error) {
    // Fail the workflow run if an error occurs
    core.setFailed(error.message)
  }
}

module.exports = {
  run
}
