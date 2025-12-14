const { execSync } = require('child_process')
const core = require('@actions/core')
const logger = require('./log')

const PREFIX = logger.PREFIX.DOCKER

function runDockerImage(dockerCommand, appIndex) {
  logger.debug(`${PREFIX} Running command: ${dockerCommand}`)
  try {
    execSync(dockerCommand)
    logger.info(`${PREFIX} Container data-caterer-${appIndex} started`)
  } catch (error) {
    logger.logError(PREFIX, 'Failed to run data-caterer container', error)
    logger.info(`${PREFIX} Retrieving container logs for debugging...`)
    logOutContainerLogs(`data-caterer-${appIndex}`, false)
    core.setFailed(error)
    throw new Error(error)
  }
}

function removeContainer(containerName) {
  try {
    const dataCatererContainer = execSync(
      `docker ps -a -q -f name=^/${containerName}$`
    ).toString()
    if (dataCatererContainer.length > 0) {
      logger.debug(`${PREFIX} Removing existing container: ${containerName}`)
      execSync(`docker rm ${containerName}`)
      logger.debug(`${PREFIX} Container removed: ${containerName}`)
    }
  } catch (error) {
    logger.warn(
      `${PREFIX} Could not remove container ${containerName}: ${error.message}`
    )
  }
}

function createDockerNetwork() {
  try {
    const networkDetails = execSync('docker network ls')
    if (!networkDetails.toString().includes('insta-infra_default')) {
      logger.info(`${PREFIX} Creating network: insta-infra_default`)
      execSync('docker network create insta-infra_default')
      logger.debug(`${PREFIX} Network created successfully`)
    } else {
      logger.debug(`${PREFIX} Network insta-infra_default already exists`)
    }
  } catch (error) {
    logger.logError(PREFIX, 'Failed to create Docker network', error)
    throw new Error(error)
  }
}

function isContainerFinished(containerName) {
  const checkContainerExited = `docker ps -q -f name=${containerName} -f status=exited`
  const isExited = execSync(checkContainerExited)
  if (isExited.toString().length > 0) {
    logger.debug(
      `${PREFIX} Container ${containerName} has exited, checking exit code`
    )
    const exitedSuccessfully = execSync(`${checkContainerExited} -f exited=0`)
    if (exitedSuccessfully.toString().length > 0) {
      logger.info(`${PREFIX} Container ${containerName} completed successfully`)
    } else {
      logger.logError(
        PREFIX,
        `Container ${containerName} exited with non-zero code`
      )
      logger.info(`${PREFIX} Container logs:`)
      logOutContainerLogs(containerName, false)
      throw new Error(`${containerName} docker container failed`)
    }
    return true
  } else {
    logger.debug(`${PREFIX} Container ${containerName} still running`)
    return false
  }
}

function waitForContainerToFinish(containerName) {
  logger.info(`${PREFIX} Waiting for container ${containerName} to finish...`)
  const poll = (resolve, reject) => {
    try {
      if (isContainerFinished(containerName)) resolve()
      else setTimeout(() => poll(resolve, reject), 500)
    } catch (error) {
      reject(error)
    }
  }

  return new Promise(poll)
}

function logOutContainerLogs(containerName, isDebug = true) {
  try {
    const containerLogs = execSync(`docker logs ${containerName}`).toString()
    const logFn = isDebug ? logger.debug.bind(logger) : logger.info.bind(logger)
    // eslint-disable-next-line github/array-foreach
    containerLogs.split('\n').forEach(line => {
      if (line.trim()) {
        logFn(`  ${line}`)
      }
    })
  } catch (e) {
    logger.logError(
      PREFIX,
      `Failed to retrieve logs for container ${containerName}`,
      e
    )
  }
}

module.exports = {
  runDockerImage,
  createDockerNetwork,
  removeContainer,
  waitForContainerToFinish,
  isContainerFinished,
  logOutContainerLogs
}
