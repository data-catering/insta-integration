const { execSync } = require('child_process')
const logger = require('./log')
const { isContainerFinished } = require('./docker')

const PREFIX = logger.PREFIX.SERVICE
const INSTA_BINARY = 'insta'

/**
 * Check if insta CLI is installed, if not install it
 */
function checkInstaInfraExists() {
  try {
    execSync(`which ${INSTA_BINARY}`, { encoding: 'utf-8', stdio: 'pipe' })
    logger.debug(`${PREFIX} insta CLI is already installed`)
  } catch {
    logger.info(`${PREFIX} Installing insta CLI...`)
    try {
      execSync(
        'curl -fsSL https://raw.githubusercontent.com/data-catering/insta-infra/main/install.sh | sh',
        { stdio: 'pipe' }
      )
      logger.info(`${PREFIX} insta CLI installed successfully`)
    } catch (installError) {
      logger.logError(PREFIX, 'Failed to install insta CLI', installError)
      throw new Error(
        'Failed to install insta CLI. Please install manually: https://github.com/data-catering/insta-infra'
      )
    }
  }
}

/**
 * Check if service names are supported by insta-infra
 * @param serviceNames Array of services
 */
function checkValidServiceNames(serviceNames) {
  logger.debug(`${PREFIX} Validating service names: ${serviceNames.join(', ')}`)
  try {
    const supportedServices = execSync(`${INSTA_BINARY} -l`, {
      encoding: 'utf-8',
      stdio: 'pipe'
    })
    // eslint-disable-next-line github/array-foreach
    serviceNames.forEach(service => {
      if (!supportedServices.includes(service)) {
        throw new Error(
          `Unsupported service: ${service}. Check insta-infra documentation for supported services: https://github.com/data-catering/insta-infra`
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

/**
 * Run services using insta CLI
 * Data is NOT persisted by default to ensure clean state between runs
 * @param serviceNames Array of service names to start
 * @param envVars Environment variables to set
 */
function runServices(serviceNames, envVars) {
  checkValidServiceNames(serviceNames)
  const serviceNamesStr = serviceNames.join(' ')
  logger.info(`${PREFIX} Starting services: ${serviceNamesStr}`)

  for (const env of Object.entries(envVars)) {
    process.env[env[0]] = env[1]
    logger.debug(`${PREFIX} Set env var: ${env[0]}`)
  }

  try {
    // Note: NOT using -p flag to avoid data persistence between runs
    execSync(`${INSTA_BINARY} ${serviceNamesStr}`, {
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

/**
 * Shutdown services using insta CLI
 * @param serviceNames Optional array of service names to stop. If empty, stops all services.
 */
function shutdownServices(serviceNames = []) {
  try {
    if (serviceNames.length > 0) {
      const serviceNamesStr = serviceNames.join(' ')
      logger.info(`${PREFIX} Shutting down services: ${serviceNamesStr}`)
      execSync(`${INSTA_BINARY} -d ${serviceNamesStr}`, { stdio: 'pipe' })
    } else {
      logger.info(`${PREFIX} Shutting down all services`)
      execSync(`${INSTA_BINARY} -d`, { stdio: 'pipe' })
    }
    logger.logSuccess(PREFIX, 'Services shut down successfully')
  } catch (error) {
    logger.warn(`${PREFIX} Failed to shut down services: ${error.message}`)
  }
}

module.exports = { checkInstaInfraExists, runServices, shutdownServices }
