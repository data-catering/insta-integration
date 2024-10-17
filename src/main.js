const core = require('@actions/core')
const { runIntegrationTests } = require('./insta-integration')
const { resolve } = require('node:path')
const logger = require('./util/log')

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

function getDataCatererVersion(dataCatererVersion) {
  return !dataCatererVersion ? '0.12.0' : dataCatererVersion
}

function getConfiguration() {
  let applicationConfig = process.env.CONFIGURATION_FILE
  let instaInfraFolder = process.env.INSTA_INFRA_FOLDER
  let baseFolder = process.env.BASE_FOLDER
  let dataCatererVersion = process.env.DATA_CATERER_VERSION
  let dockerToken = process.env.DOCKER_TOKEN

  logger.debug('Checking if GitHub Action properties defined')
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
    dataCatererVersion =
      core.getInput('data_caterer_version', {}).length > 0
        ? core.getInput('data_caterer_version', {})
        : getDataCatererVersion(dataCatererVersion)
    dockerToken =
      core.getInput('docker_token', {}).length > 0
        ? core.getInput('docker_token', {})
        : dockerToken
  }

  return {
    applicationConfig,
    instaInfraFolder,
    baseFolder,
    dataCatererVersion,
    dockerToken
  }
}

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
  logger.info('Starting insta-integration run')
  try {
    const config = getConfiguration()

    // Debug logs are only output if the `ACTIONS_STEP_DEBUG` secret is true
    logger.debug(`Using config file: ${config.applicationConfig}`)
    logger.debug(`Using insta-infra folder: ${config.instaInfraFolder}`)
    logger.debug(`Using base folder: ${config.baseFolder}`)
    logger.debug(`Using data-caterer version: ${config.dataCatererVersion}`)
    runIntegrationTests(config)
  } catch (error) {
    // Fail the workflow run if an error occurs
    logger.error(error)
    core.setFailed(error.message)
  }
}

module.exports = { run }
