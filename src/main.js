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
      : core.getInput('configuration_file', {})
    const instaInfraFolder = process.env.INSTA_INFRA_FOLDER
      ? process.env.INSTA_INFRA_FOLDER
      : core.getInput('insta_infra_folder', {})
    const baseFolder = process.env.BASE_FOLDER
      ? process.env.BASE_FOLDER
      : core.getInput('base_folder', {})

    // Debug logs are only output if the `ACTIONS_STEP_DEBUG` secret is true
    core.debug(`Using config file: ${configFile}`)
    core.debug(`Using insta-infra folder: ${instaInfraFolder}`)
    core.debug(`Using base folder: ${baseFolder}`)
    const result = runIntegrationTests(configFile, instaInfraFolder, baseFolder)

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
