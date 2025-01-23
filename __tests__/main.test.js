const {
  getBaseFolder,
  getDataCatererVersion,
  getConfiguration
} = require('../src/main')
const core = require('@actions/core')

jest.mock('@actions/core')

describe('getBaseFolder', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  it('returns the base folder from input if provided', () => {
    core.getInput.mockReturnValueOnce('/input/folder')
    expect(getBaseFolder('/default/folder')).toBe('/input/folder')
  })

  it('returns the default base folder if input is not provided', () => {
    core.getInput.mockReturnValueOnce('')
    expect(getBaseFolder('/default/folder')).toBe('/default/folder')
  })

  it('throws an error if base folder is not defined', () => {
    core.getInput.mockReturnValueOnce('')
    expect(() => getBaseFolder('')).toThrow(
      'Base folder configuration is not defined'
    )
  })
})

describe('getDataCatererVersion', () => {
  it('returns the provided data caterer version', () => {
    expect(getDataCatererVersion('1.0.0')).toBe('1.0.0')
  })

  it('returns the default data caterer version if not provided', () => {
    expect(getDataCatererVersion('')).toBe('0.14.3')
  })
})

describe('getConfiguration', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    process.env.CONFIGURATION_FILE = 'config.json'
    process.env.INSTA_INFRA_FOLDER = '/infra'
    process.env.BASE_FOLDER = '/base'
    process.env.DATA_CATERER_VERSION = '1.0.0'
    process.env.DATA_CATERER_USER = 'user'
    process.env.DATA_CATERER_TOKEN = 'token'
  })

  it('returns the configuration from environment variables', () => {
    const config = getConfiguration()
    expect(config).toEqual({
      applicationConfig: 'config.json',
      instaInfraFolder: '/infra',
      baseFolder: '/base',
      dataCatererVersion: '1.0.0',
      dataCatererUser: 'user',
      dataCatererToken: 'token'
    })
  })

  it('overrides environment variables with GitHub Action inputs', () => {
    core.getInput.mockImplementation(name => {
      const inputs = {
        configuration_file: 'input_config.json',
        insta_infra_folder: '/input_infra',
        base_folder: '/input_base',
        data_caterer_version: '2.0.0',
        data_caterer_user: 'input_user',
        data_caterer_token: 'input_token'
      }
      return inputs[name] || ''
    })
    const config = getConfiguration()
    expect(config).toEqual({
      applicationConfig: 'input_config.json',
      instaInfraFolder: '/input_infra',
      baseFolder: '/input_base',
      dataCatererVersion: '2.0.0',
      dataCatererUser: 'input_user',
      dataCatererToken: 'input_token'
    })
  })
})
