const fs = require('fs')
const { execSync } = require('child_process')
const logger = require('./log')

function checkInstaInfraExists(instaInfraFolder) {
  if (!fs.existsSync(instaInfraFolder)) {
    logger.debug('insta-infra does not exist, checking out repository')
    try {
      execSync(
        `git clone git@github.com:data-catering/insta-infra.git ${instaInfraFolder}`
      )
    } catch (error) {
      logger.error(
        `Failed to checkout insta-infra repository to ${instaInfraFolder} folder, trying via https`
      )
      logger.error(error)
      try {
        execSync(
          `git clone https://github.com/data-catering/insta-infra.git ${instaInfraFolder}`
        )
      } catch (httpsError) {
        logger.error(
          `Failed to checkout insta-infra repository via https to ${instaInfraFolder}`
        )
        logger.error(httpsError)
        throw new Error('Failed to checkout insta-infra repository')
      }
    }
  }
}

/**
 * Check if service names are supported by insta-infra
 * @param instaInfraFolder Folder where insta-infra is checked out
 * @param serviceNames Array of services
 */
function checkValidServiceNames(instaInfraFolder, serviceNames) {
  logger.debug('Checking insta-infra to see what services are supported')
  const supportedServices = execSync(`${instaInfraFolder}/run.sh -l`, {
    encoding: 'utf-8'
  })
  // eslint-disable-next-line github/array-foreach
  serviceNames.forEach(service => {
    if (!supportedServices.includes(service)) {
      throw new Error(
        `Found unsupported insta-infra service in configuration, service=${service}`
      )
    }
  })
}

function runServices(instaInfraFolder, serviceNames, envVars) {
  checkValidServiceNames(instaInfraFolder, serviceNames)
  const serviceNamesInstaInfra = serviceNames.join(' ')
  logger.info(`Running services=${serviceNamesInstaInfra}`)
  for (const env of Object.entries(envVars)) {
    process.env[env[0]] = env[1]
  }
  execSync(`./run.sh ${serviceNamesInstaInfra}`, {
    cwd: instaInfraFolder,
    stdio: 'pipe'
  })
}

module.exports = { checkInstaInfraExists, runServices }
