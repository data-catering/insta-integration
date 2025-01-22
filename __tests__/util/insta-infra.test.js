const {
  checkInstaInfraExists,
  runServices
} = require('../../src/util/insta-infra')
const fs = require('fs')
const { execSync } = require('child_process')
const logger = require('../../src/util/log')
const { isContainerFinished } = require('../../src/util/docker')

jest.mock('child_process')
jest.mock('../../src/util/log')
jest.mock('../../src/util/docker')

describe('checkInstaInfraExists', () => {
  it('should clone repository if insta-infra folder does not exist', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false)
    execSync.mockReturnValueOnce('success')
    checkInstaInfraExists('/path/to/insta-infra')
    expect(execSync).toHaveBeenCalledWith(
      'git clone git@github.com:data-catering/insta-infra.git /path/to/insta-infra'
    )
  })

  it('should log error and retry with https if git clone via ssh fails', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false)
    execSync.mockImplementationOnce(() => {
      throw new Error('ssh failed')
    })
    execSync.mockReturnValueOnce('success')
    checkInstaInfraExists('/path/to/insta-infra')
    expect(execSync).toHaveBeenCalledWith(
      'git clone https://github.com/data-catering/insta-infra.git /path/to/insta-infra'
    )
  })

  it('should throw error if both git clone via ssh and https fail', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false)
    execSync.mockImplementationOnce(() => {
      throw new Error('ssh failed')
    })
    execSync.mockImplementationOnce(() => {
      throw new Error('https failed')
    })
    expect(() => checkInstaInfraExists('/path/to/insta-infra')).toThrow(
      'Failed to checkout insta-infra repository'
    )
  })

  it('should not clone repository if insta-infra folder exists', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true)
    checkInstaInfraExists('/path/to/insta-infra')
    expect(execSync).not.toHaveBeenCalled()
  })
})

describe('runServices', () => {
  it('should run services successfully', () => {
    execSync.mockReturnValueOnce('service1 service2')
    execSync.mockReturnValueOnce('success')
    runServices('/path/to/insta-infra', ['service1', 'service2'], {
      ENV_VAR: 'value'
    })
    expect(execSync).toHaveBeenCalledWith('./run.sh service1 service2', {
      cwd: '/path/to/insta-infra',
      stdio: 'pipe'
    })
  })

  it('should throw error if unsupported service is found', () => {
    execSync.mockReturnValueOnce('service1\nservice2')
    expect(() =>
      runServices(
        '/path/to/insta-infra',
        ['service1', 'unsupportedService'],
        {}
      )
    ).toThrow(
      'Found unsupported insta-infra service in configuration, service=unsupportedService'
    )
  })

  it('should log error and check container status if running services fail', () => {
    execSync.mockReturnValueOnce('service1 service2')
    execSync.mockImplementationOnce(() => {
      throw new Error('run failed')
    })
    isContainerFinished.mockReturnValueOnce(true)
    expect(() => runServices('/path/to/insta-infra', ['service1'], {})).toThrow(
      'run failed'
    )
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to run services=service1')
    )
  })
})
