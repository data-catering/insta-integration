const core = require('@actions/core')
const { runIntegrationTests } = require('./insta-integration')
const { resolve } = require('node:path')
const logger = require('./util/log')

/**
 * Retrieves the base folder path.
 * @param {string} baseFolder - The default base folder path.
 * @returns {string} - The resolved base folder path.
 * @throws {Error} - If the base folder configuration is not defined.
 */
function getBaseFolder(baseFolder) {
  const actionsInput = core.getInput('base_folder', {})
  const folderFromConf =
    typeof actionsInput !== 'undefined' && actionsInput.length > 0
      ? actionsInput
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
  return !dataCatererVersion ? '0.14.5' : dataCatererVersion
}

function getConfigurationItem(item, defaultValue, requiredNonEmpty = false) {
  const actionsInput = core.getInput(item, {})
  const configValue =
    typeof actionsInput !== 'undefined' && actionsInput.length > 0
      ? actionsInput
      : defaultValue
  if (
    (requiredNonEmpty &&
      typeof configValue !== 'undefined' &&
      configValue.length === 0) ||
    typeof configValue === 'undefined'
  ) {
    throw new Error(
      `Configuration item ${item} is required to be defined and non-empty`
    )
  }
  return configValue
}

function getConfiguration() {
  let applicationConfig = process.env.CONFIGURATION_FILE
  let instaInfraFolder = process.env.INSTA_INFRA_FOLDER
  let baseFolder = process.env.BASE_FOLDER
  let dataCatererVersion = process.env.DATA_CATERER_VERSION
  let dataCatererUser = process.env.DATA_CATERER_USER
  let dataCatererToken = process.env.DATA_CATERER_TOKEN

  logger.debug('Checking if GitHub Action properties defined')
  if (core) {
    applicationConfig = getConfigurationItem(
      'configuration_file',
      applicationConfig
    )
    instaInfraFolder = getConfigurationItem(
      'insta_infra_folder',
      instaInfraFolder
    )
    baseFolder = getConfigurationItem('base_folder', baseFolder)
    dataCatererVersion = getConfigurationItem(
      'data_caterer_version',
      getDataCatererVersion(dataCatererVersion)
    )
    dataCatererUser = getConfigurationItem(
      'data_caterer_user',
      dataCatererUser,
      true
    )
    dataCatererToken = getConfigurationItem(
      'data_caterer_token',
      dataCatererToken,
      true
    )
  }

  return {
    applicationConfig,
    instaInfraFolder,
    baseFolder,
    dataCatererVersion,
    dataCatererUser,
    dataCatererToken
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
    const result = runIntegrationTests(config)
    // eslint-disable-next-line github/no-then
    return await result.then(() => {
      logger.info('insta-integration run completed')
    })
  } catch (error) {
    // Fail the workflow run if an error occurs
    logger.error('Failed to run insta-integration. ', error)
    core.setFailed(error.message)
    throw error
  }
}

module.exports = {
  getBaseFolder,
  getConfiguration,
  getDataCatererVersion,
  run
}
