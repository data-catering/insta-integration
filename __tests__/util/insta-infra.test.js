const {
  checkInstaInfraExists,
  runServices,
  shutdownServices
} = require('../../src/util/insta-infra')
const { execSync } = require('child_process')
const logger = require('../../src/util/log')
const { isContainerFinished } = require('../../src/util/docker')

jest.mock('child_process')
jest.mock('../../src/util/log')
jest.mock('../../src/util/docker')

describe('checkInstaInfraExists', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('should not install if insta CLI is already installed', () => {
    execSync.mockReturnValueOnce('/usr/local/bin/insta')
    checkInstaInfraExists()
    expect(execSync).toHaveBeenCalledWith('which insta', {
      encoding: 'utf-8',
      stdio: 'pipe'
    })
    expect(execSync).toHaveBeenCalledTimes(1)
  })

  it('should install insta CLI if not found', () => {
    execSync.mockImplementationOnce(() => {
      throw new Error('not found')
    })
    execSync.mockReturnValueOnce('success')
    checkInstaInfraExists()
    expect(execSync).toHaveBeenCalledWith(
      'curl -fsSL https://raw.githubusercontent.com/data-catering/insta-infra/main/install.sh | sh',
      { stdio: 'pipe' }
    )
  })

  it('should throw error if installation fails', () => {
    execSync.mockImplementationOnce(() => {
      throw new Error('not found')
    })
    execSync.mockImplementationOnce(() => {
      throw new Error('install failed')
    })
    expect(() => checkInstaInfraExists()).toThrow(
      'Failed to install insta CLI. Please install manually: https://github.com/data-catering/insta-infra'
    )
  })
})

describe('runServices', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('should run services successfully without persistence flag', () => {
    execSync.mockReturnValueOnce('service1 service2')
    execSync.mockReturnValueOnce('success')
    runServices(['service1', 'service2'], { ENV_VAR: 'value' })
    // Verify services are started WITHOUT -p flag (no data persistence)
    expect(execSync).toHaveBeenCalledWith('insta service1 service2', {
      stdio: 'pipe'
    })
  })

  it('should throw error if unsupported service is found', () => {
    execSync.mockReturnValueOnce('service1\nservice2')
    expect(() => runServices(['service1', 'unsupportedService'], {})).toThrow(
      'Unsupported service: unsupportedService'
    )
  })

  it('should log error and check container status if running services fail', () => {
    execSync.mockReturnValueOnce('service1 service2')
    execSync.mockImplementationOnce(() => {
      throw new Error('run failed')
    })
    isContainerFinished.mockReturnValueOnce(true)
    expect(() => runServices(['service1'], {})).toThrow('run failed')
    expect(logger.logError).toHaveBeenCalledWith(
      '[Service]',
      'Failed to start services: service1'
    )
  })

  it('should check all services when running services fail', () => {
    execSync.mockReturnValueOnce('service1 service2 service3')
    execSync.mockImplementationOnce(() => {
      throw new Error('run failed')
    })
    isContainerFinished.mockReturnValue(false)
    expect(() => runServices(['service1', 'service2', 'service3'], {})).toThrow(
      'run failed'
    )
    // All three services should be checked
    expect(isContainerFinished).toHaveBeenCalledTimes(3)
    expect(isContainerFinished).toHaveBeenCalledWith('service1')
    expect(isContainerFinished).toHaveBeenCalledWith('service2')
    expect(isContainerFinished).toHaveBeenCalledWith('service3')
  })

  it('should set environment variables before starting services', () => {
    execSync.mockReturnValueOnce('postgres')
    execSync.mockReturnValueOnce('success')
    const envVars = { POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'secret' }
    runServices(['postgres'], envVars)
    expect(process.env.POSTGRES_USER).toBe('test')
    expect(process.env.POSTGRES_PASSWORD).toBe('secret')
  })
})

describe('shutdownServices', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('should shutdown specific services', () => {
    execSync.mockReturnValueOnce('success')
    shutdownServices(['postgres', 'mysql'])
    expect(execSync).toHaveBeenCalledWith('insta -d postgres mysql', {
      stdio: 'pipe'
    })
  })

  it('should shutdown all services when no services specified', () => {
    execSync.mockReturnValueOnce('success')
    shutdownServices()
    expect(execSync).toHaveBeenCalledWith('insta -d', { stdio: 'pipe' })
  })

  it('should shutdown all services when empty array provided', () => {
    execSync.mockReturnValueOnce('success')
    shutdownServices([])
    expect(execSync).toHaveBeenCalledWith('insta -d', { stdio: 'pipe' })
  })

  it('should warn but not throw if shutdown fails', () => {
    execSync.mockImplementationOnce(() => {
      throw new Error('shutdown failed')
    })
    // Should not throw
    expect(() => shutdownServices(['postgres'])).not.toThrow()
    expect(logger.warn).toHaveBeenCalled()
  })
})
