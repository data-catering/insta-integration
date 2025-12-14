const fs = require('fs')
const { execSync } = require('child_process')
const logger = require('./log')
const { isContainerFinished } = require('./docker')

const PREFIX = logger.PREFIX.SERVICE

function checkInstaInfraExists(instaInfraFolder) {
  if (!fs.existsSync(instaInfraFolder)) {
    logger.info(`${PREFIX} Cloning insta-infra repository...`)
    try {
      execSync(
        `git clone git@github.com:data-catering/insta-infra.git ${instaInfraFolder}`
      )
      logger.info(`${PREFIX} Repository cloned successfully via SSH`)
    } catch (error) {
      logger.warn(`${PREFIX} SSH clone failed, trying HTTPS...`)
      try {
        execSync(
          `git clone https://github.com/data-catering/insta-infra.git ${instaInfraFolder}`
        )
        logger.info(`${PREFIX} Repository cloned successfully via HTTPS`)
      } catch (httpsError) {
        logger.logError(
          PREFIX,
          'Failed to clone insta-infra repository',
          httpsError
        )
        throw new Error('Failed to checkout insta-infra repository')
      }
    }
  } else {
    logger.debug(`${PREFIX} insta-infra already exists at ${instaInfraFolder}`)
  }
}

/**
 * Check if service names are supported by insta-infra
 * @param instaInfraFolder Folder where insta-infra is checked out
 * @param serviceNames Array of services
 */
function checkValidServiceNames(instaInfraFolder, serviceNames) {
  logger.debug(`${PREFIX} Validating service names: ${serviceNames.join(', ')}`)
  try {
    const supportedServices = execSync(`${instaInfraFolder}/run.sh -l`, {
      encoding: 'utf-8'
    })
    // eslint-disable-next-line github/array-foreach
    serviceNames.forEach(service => {
      if (!supportedServices.includes(service)) {
        throw new Error(
          `Unsupported service: ${service}. Check insta-infra documentation for supported services.`
        )
      }
    })
    logger.debug(`${PREFIX} All services validated successfully`)
  } catch (error) {
    logger.logError(
      PREFIX,
      `Service validation failed for: ${serviceNames.join(', ')}`,
      error
    )
    throw new Error(error)
  }
}

function runServices(instaInfraFolder, serviceNames, envVars) {
  checkValidServiceNames(instaInfraFolder, serviceNames)
  const serviceNamesStr = serviceNames.join(' ')
  logger.info(`${PREFIX} Starting services: ${serviceNamesStr}`)

  for (const env of Object.entries(envVars)) {
    process.env[env[0]] = env[1]
    logger.debug(`${PREFIX} Set env var: ${env[0]}`)
  }

  try {
    execSync(`./run.sh ${serviceNamesStr}`, {
      cwd: instaInfraFolder,
      stdio: 'pipe'
    })
    logger.logSuccess(PREFIX, `Services started: ${serviceNamesStr}`)
  } catch (error) {
    logger.logError(PREFIX, `Failed to start services: ${serviceNamesStr}`)
    logger.error(
      `${PREFIX} Details: status=${error.status}, stderr=${error.stderr}, stdout=${error.stdout}`
    )

    for (const serviceName of serviceNames) {
      logger.debug(`${PREFIX} Checking container health: ${serviceName}`)
      try {
        isContainerFinished(serviceName)
      } catch (containerError) {
        logger.debug(
          `${PREFIX} Container ${serviceName} check failed: ${containerError.message}`
        )
      }
    }
    throw new Error(error)
  }
}

module.exports = { checkInstaInfraExists, runServices }
