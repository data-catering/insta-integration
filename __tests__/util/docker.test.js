const { execSync } = require('child_process')
const core = require('@actions/core')
const logger = require('../../src/util/log')
const {
  runDockerImage,
  createDockerNetwork,
  removeContainer,
  waitForContainerToFinish,
  isContainerFinished
} = require('../../src/util/docker')

jest.mock('child_process')
jest.mock('@actions/core')
jest.mock('../../src/util/log')

describe('runDockerImage', () => {
  it('should execute docker command successfully', () => {
    execSync.mockReturnValueOnce('success')
    runDockerImage('docker run my-image', 1)
    expect(execSync).toHaveBeenCalledWith('docker run my-image')
  })

  it('should log error and set failed status on command failure', () => {
    execSync.mockImplementationOnce(() => {
      throw new Error('command failed')
    })
    expect(() => runDockerImage('docker run my-image', 1)).toThrow(
      'command failed'
    )
    expect(logger.logError).toHaveBeenCalledWith(
      '[Docker]',
      'Failed to run data-caterer container',
      expect.any(Error)
    )
    expect(core.setFailed).toHaveBeenCalledWith(new Error('command failed'))
  })
})

describe('removeContainer', () => {
  it('should remove existing container', () => {
    execSync.mockReturnValueOnce('container-id')
    removeContainer('my-container')
    expect(execSync).toHaveBeenCalledWith('docker rm my-container')
  })

  it('should not attempt to remove non-existing container', () => {
    execSync.mockReturnValueOnce('')
    removeContainer('my-container')
    expect(execSync).not.toHaveBeenCalledWith('docker rm my-container')
  })
})

describe('createDockerNetwork', () => {
  it('should create network if not exists', () => {
    execSync.mockReturnValueOnce('network details')
    execSync.mockReturnValueOnce('')
    createDockerNetwork()
    expect(execSync).toHaveBeenCalledWith(
      'docker network create insta-infra_default'
    )
  })

  it('should not create network if already exists', () => {
    execSync.mockReturnValueOnce('insta-infra_default')
    createDockerNetwork()
    expect(execSync).not.toHaveBeenCalledWith(
      'docker network create insta-infra_default'
    )
  })
})

describe('isContainerFinished', () => {
  it('should return true if container finished successfully', () => {
    execSync.mockReturnValueOnce('container-id')
    execSync.mockReturnValueOnce('container-id')
    const result = isContainerFinished('my-container')
    expect(result).toBe(true)
  })

  it('should return false if container is still running', () => {
    execSync.mockReturnValueOnce('')
    const result = isContainerFinished('my-container')
    expect(result).toBe(false)
  })

  it('should throw error if container finished with non-zero exit code', () => {
    execSync.mockReturnValueOnce('container-id')
    execSync.mockReturnValueOnce('')
    expect(() => isContainerFinished('my-container')).toThrow(
      'my-container docker container failed'
    )
  })
})

describe('waitForContainerToFinish', () => {
  it('should resolve when container finishes', async () => {
    execSync.mockReturnValueOnce('container-id')
    execSync.mockReturnValueOnce('container-id')
    await waitForContainerToFinish('my-container')
    expect(execSync).toHaveBeenCalledWith(
      'docker ps -q -f name=my-container -f status=exited'
    )
  })

  it('should reject when isContainerFinished throws an error', async () => {
    execSync.mockImplementation(() => {
      throw new Error('Docker command failed')
    })
    await expect(waitForContainerToFinish('my-container')).rejects.toThrow(
      'Docker command failed'
    )
  })
})
