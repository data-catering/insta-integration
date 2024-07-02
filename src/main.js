const core = require('@actions/core')
const { runIntegrationTests } = require('./insta-integration')

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
  try {
    const applicationConfig =
      core.getInput('configuration_file', {}).length > 0
        ? core.getInput('configuration_file', {})
        : process.env.CONFIGURATION_FILE
    const instaInfraFolder =
      core.getInput('insta_infra_folder', {}).length > 0
        ? core.getInput('insta_infra_folder', {})
        : process.env.INSTA_INFRA_FOLDER
    const baseFolder =
      core.getInput('base_folder', {}).length > 0
        ? core.getInput('base_folder', {}).replace('/./', '')
        : process.env.BASE_FOLDER.replace('/./', '')

    // Debug logs are only output if the `ACTIONS_STEP_DEBUG` secret is true
    core.info(`Using config file: ${applicationConfig}`)
    core.info(`Using insta-infra folder: ${instaInfraFolder}`)
    core.info(`Using base folder: ${baseFolder}`)
    const result = runIntegrationTests(
      applicationConfig,
      instaInfraFolder,
      baseFolder
    )

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
