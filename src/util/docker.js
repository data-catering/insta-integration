const { execSync } = require('child_process')
const core = require('@actions/core')

function runDockerImage(dockerCommand, appIndex) {
  core.debug(
    `Running docker command for data-caterer, command=${dockerCommand}`
  )
  try {
    execSync(dockerCommand)
  } catch (error) {
    core.error('Failed to run data caterer for data generation and validation')
    core.info('Checking data-caterer logs')
    core.info(execSync(`docker logs data-caterer-${appIndex}`).toString())
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
    core.info(dataCatererContainer)
    if (dataCatererContainer.length > 0) {
      core.debug(`Attempting to remove ${containerName} Docker container`)
      execSync(`docker rm ${containerName}`)
    }
  } catch (error) {
    core.warning(error)
  }
}

function createDockerNetwork() {
  // Check if network is created, create if it isn't
  try {
    const network_details = execSync('docker network ls')
    if (!network_details.toString().includes('insta-infra_default')) {
      core.info('Creating docker network: insta-infra_default')
      execSync('docker network create insta-infra_default')
    }
  } catch (error) {
    core.error('Failed to check Docker network')
    throw new Error(error)
  }
}

function dockerLogin(dockerToken) {
  if (dockerToken) {
    core.debug('Docker token is defined, attempting to login')
    try {
      execSync(`docker login -u datacatering -p ${dockerToken}`, {
        stdio: 'pipe'
      })
    } catch (error) {
      core.warning(
        'Failed to login with Docker token, continuing to attempt tests'
      )
    }
  } else {
    core.debug('No Docker token defined')
  }
}

function isContainerFinished(containerName) {
  const isExited = execSync(
    `docker ps -q -f name=${containerName} -f status=exited`
  )
  if (isExited.toString().length > 0) {
    core.debug(`${containerName} docker container has finished`)
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
