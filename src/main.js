const core = require('@actions/core')
const { runIntegrationTests } = require('./insta-integration')
const { resolve } = require('node:path')

function getBaseFolder(baseFolder) {
  const folderFromConf =
    core.getInput('base_folder', {}).length > 0
      ? core.getInput('base_folder', {})
      : baseFolder
  if (!baseFolder) {
    throw new Error('Base folder configuration is not defined')
  }
  const cleanFolderPath = folderFromConf.replace('/./', '')
  return cleanFolderPath.startsWith('/')
    ? cleanFolderPath
    : `${resolve()}/${cleanFolderPath}`
}

function getConfiguration() {
  let applicationConfig = process.env.CONFIGURATION_FILE
  let instaInfraFolder = process.env.INSTA_INFRA_FOLDER
  let baseFolder = process.env.BASE_FOLDER
  let dockerToken = process.env.DOCKER_TOKEN

  console.log('Checking if GitHub Action properties defined')
  if (core) {
    applicationConfig =
      core.getInput('configuration_file', {}).length > 0
        ? core.getInput('configuration_file', {})
        : applicationConfig
    instaInfraFolder =
      core.getInput('insta_infra_folder', {}).length > 0
        ? core.getInput('insta_infra_folder', {})
        : instaInfraFolder
    baseFolder = getBaseFolder(baseFolder)
    dockerToken =
      core.getInput('docker_token', {}).length > 0
        ? core.getInput('docker_token', {})
        : dockerToken
  }

  return { applicationConfig, instaInfraFolder, baseFolder, dockerToken }
}

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
  try {
    const { applicationConfig, instaInfraFolder, baseFolder, dockerToken } =
      getConfiguration()

    // Debug logs are only output if the `ACTIONS_STEP_DEBUG` secret is true
    core.debug(`Using config file: ${applicationConfig}`)
    core.debug(`Using insta-infra folder: ${instaInfraFolder}`)
    core.debug(`Using base folder: ${baseFolder}`)
    runIntegrationTests(
      applicationConfig,
      instaInfraFolder,
      baseFolder,
      dockerToken
    )
  } catch (error) {
    // Fail the workflow run if an error occurs
    core.setFailed(error.message)
  }
}

module.exports = { run }
