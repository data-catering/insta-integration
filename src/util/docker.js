const { execSync } = require('child_process')
const core = require('@actions/core')
const logger = require('./log')

function runDockerImage(dockerCommand, appIndex) {
  logger.debug(
    `Running docker command for data-caterer, command=${dockerCommand}`
  )
  try {
    execSync(dockerCommand)
  } catch (error) {
    logger.error('Failed to run data caterer docker image')
    logger.info('Checking data-caterer logs')
    logger.info(execSync(`docker logs data-caterer-${appIndex}`).toString())
    core.setFailed(error)
    throw new Error(error)
  }
}

function removeContainer(containerName) {
  try {
    // Check if there is a data-caterer container or not
    const dataCatererContainer = execSync(
      `docker ps -a -q -f name=^/${containerName}$`
    ).toString()
    logger.debug(
      `Result from checking docker for container: ${dataCatererContainer}`
    )
    if (dataCatererContainer.length > 0) {
      logger.debug(`Attempting to remove ${containerName} Docker container`)
      execSync(`docker rm ${containerName}`)
    }
  } catch (error) {
    logger.warn(error)
  }
}

function createDockerNetwork() {
  // Check if network is created, create if it isn't
  try {
    const network_details = execSync('docker network ls')
    if (!network_details.toString().includes('insta-infra_default')) {
      logger.info('Creating docker network: insta-infra_default')
      execSync('docker network create insta-infra_default')
    }
  } catch (error) {
    logger.error('Failed to check Docker network')
    throw new Error(error)
  }
}

function dockerLogin(dockerToken) {
  if (dockerToken) {
    logger.debug('Docker token is defined, attempting to login')
    try {
      execSync(`docker login -u datacatering -p ${dockerToken}`, {
        stdio: 'pipe'
      })
    } catch (error) {
      logger.warn(
        'Failed to login with Docker token, continuing to attempt tests'
      )
    }
  } else {
    logger.debug('No Docker token defined')
  }
}

function isContainerFinished(containerName) {
  const checkContainerExited = `docker ps -q -f name=${containerName} -f status=exited`
  const isExited = execSync(checkContainerExited)
  if (isExited.toString().length > 0) {
    logger.debug(
      `${containerName} docker container has finished, checking for exit code`
    )
    const exitedSuccessfully = execSync(`${checkContainerExited} -f exited=0`)
    if (exitedSuccessfully.toString().length > 0) {
      logger.debug(`${containerName} docker container finished successfully`)
    } else {
      logger.error(
        `${containerName} docker container has non-zero exit code, showing container logs`
      )
      logger.error(execSync(`docker logs ${containerName}`).toString())
      throw new Error(`${containerName} docker container failed`)
    }
    return true
  } else {
    return false
  }
}

function waitForContainerToFinish(containerName) {
  const poll = resolve => {
    if (isContainerFinished(containerName)) resolve()
    else setTimeout(_ => poll(resolve), 500)
  }

  return new Promise(poll)
}

module.exports = {
  runDockerImage,
  createDockerNetwork,
  removeContainer,
  dockerLogin,
  waitForContainerToFinish
}
