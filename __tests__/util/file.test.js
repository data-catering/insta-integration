const fs = require('fs')
const yaml = require('js-yaml')
const core = require('@actions/core')
const {
  parseConfigFile,
  writeToFile,
  cleanAppDoneFiles,
  checkFileExistsWithTimeout,
  createFolders,
  showLogFileContent
} = require('../../src/util/file')
const { expect } = require('@jest/globals')
const logger = require('../../src/util/log')

jest.mock('js-yaml')
jest.mock('@actions/core')

describe('parseConfigFile', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should successfully parse a valid YAML file', () => {
    const mockYamlContent = { key: 'value' }
    jest.spyOn(fs, 'readFileSync').mockReturnValue('yaml content')
    yaml.load.mockReturnValue(mockYamlContent)

    const result = parseConfigFile('valid-config.yml')

    expect(fs.readFileSync).toHaveBeenCalledWith('valid-config.yml', 'utf8')
    expect(yaml.load).toHaveBeenCalledWith('yaml content')
    expect(result).toEqual(mockYamlContent)
  })

  it('should throw an error and set action as failed when file reading fails', () => {
    const mockError = new Error('File not found')
    fs.readFileSync.mockImplementation(() => {
      throw mockError
    })

    expect(() => parseConfigFile('non-existent-file.yml')).toThrow(
      'Failed to parse configuration file, config-file=non-existent-file.yml'
    )
    expect(core.setFailed).toHaveBeenCalledWith('File not found')
  })

  it('should throw an error and set action as failed when YAML parsing fails', () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValue('invalid yaml content')
    const mockError = new Error('YAML parsing error')
    yaml.load.mockImplementation(() => {
      throw mockError
    })

    expect(() => parseConfigFile('invalid-config.yml')).toThrow(
      'Failed to parse configuration file, config-file=invalid-config.ym'
    )
    expect(core.setFailed).toHaveBeenCalledWith('YAML parsing error')
  })

  it('should handle empty YAML file', () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValue('')
    yaml.load.mockReturnValue(null)

    const result = parseConfigFile('empty-config.yml')

    expect(result).toBeNull()
  })
})

describe('writeToFile', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.spyOn(fs, 'existsSync')
    jest.spyOn(fs, 'mkdirSync')
    jest.spyOn(fs, 'writeFileSync')
    jest.spyOn(logger, 'debug')
    jest.spyOn(logger, 'error')
    jest.spyOn(yaml, 'dump')
  })

  it('should create folder if it does not exist', () => {
    fs.existsSync.mockReturnValue(false)
    writeToFile('newFolder', 'test.txt', 'content', true)
    expect(fs.mkdirSync).toHaveBeenCalledWith('newFolder', { recursive: true })
  })

  it('should not create folder if it already exists', () => {
    fs.existsSync.mockReturnValue(true)
    writeToFile('existingFolder', 'test.txt', 'content', true)
    expect(fs.mkdirSync).not.toHaveBeenCalled()
  })

  it('should write plain text content to file', () => {
    writeToFile('folder', 'plain.txt', 'plain content', true)
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      'folder/plain.txt',
      'plain content',
      'utf-8'
    )
  })

  it('should write YAML content to file', () => {
    const content = { key: 'value' }
    yaml.dump.mockReturnValue('yaml content')
    writeToFile('folder', 'config.yml', content, false)
    expect(yaml.dump).toHaveBeenCalledWith(content)
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      'folder/config.yml',
      'yaml content',
      'utf-8'
    )
  })

  it('should log debug messages', () => {
    writeToFile('folder', 'test.txt', 'content', true)
    expect(logger.debug).toHaveBeenCalledWith(
      'Creating file, file-path=folder/test.txt'
    )
  })

  it('should throw and log error when writing fails', () => {
    fs.writeFileSync.mockImplementation(() => {
      throw new Error('Write error')
    })
    expect(() => writeToFile('folder', 'error.txt', 'content', true)).toThrow(
      'Write error'
    )
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to write to file, file-name=folder/error.txt'
    )
  })
})

describe('cleanAppDoneFiles', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.spyOn(fs, 'unlinkSync')
    jest.spyOn(logger, 'debug')
    jest.spyOn(logger, 'warn')
  })

  it('should remove app done files successfully', async () => {
    const parsedConfig = { run: [{}, {}] }
    const sharedFolder = '/path/to/shared'
    await cleanAppDoneFiles(parsedConfig, sharedFolder, 10)
    expect(fs.unlinkSync).toHaveBeenCalledTimes(2)
    expect(fs.unlinkSync).toHaveBeenCalledWith('/path/to/shared/app-0-done')
    expect(fs.unlinkSync).toHaveBeenCalledWith('/path/to/shared/app-1-done')
  })

  it('should log warning if file removal fails', async () => {
    const parsedConfig = { run: [{}, {}] }
    const sharedFolder = '/path/to/shared'
    fs.unlinkSync.mockImplementation(() => {
      throw new Error('unlink failed')
    })
    await cleanAppDoneFiles(parsedConfig, sharedFolder, 10)
    expect(logger.debug).toHaveBeenCalledWith(new Error('unlink failed'))
  })
})

describe('checkFileExistsWithTimeout', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.spyOn(fs, 'access')
    jest.spyOn(fs, 'watch')
    jest.spyOn(logger, 'info')
  })

  it('should resolve if file exists immediately', async () => {
    fs.access.mockImplementation((path, mode, callback) => callback(null))
    fs.watch.mockImplementation(() => {
      return { close: jest.fn() }
    })
    await expect(
      checkFileExistsWithTimeout('/path/to/file', 0, 10)
    ).resolves.toBeUndefined()
  })

  it('should resolve if file is created within timeout', async () => {
    fs.access.mockImplementation((path, mode, callback) =>
      callback(new Error('not found'))
    )
    fs.watch.mockImplementation((dir, callback) => {
      setTimeout(() => callback('rename', 'file'), 10)
      return { close: jest.fn() }
    })
    await expect(
      checkFileExistsWithTimeout('/path/to/file', 0)
    ).resolves.toBeUndefined()
  })

  it('should reject if file is not created within timeout', async () => {
    fs.access.mockImplementation((path, mode, callback) =>
      callback(new Error('not found'))
    )
    fs.watch.mockImplementation(() => {
      return { close: jest.fn() }
    })
    await expect(
      checkFileExistsWithTimeout('/path/to/file', 0, 10)
    ).rejects.toThrow(
      'File did not exist and was not created during the timeout, file=/path/to/file'
    )
  })
})

describe('showLogFileContent', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.spyOn(fs, 'readFileSync')
    jest.spyOn(logger, 'debug')
  })

  it('should log each line of the log file', () => {
    const logContent = 'line1\nline2\nline3'
    fs.readFileSync.mockReturnValue(logContent)
    showLogFileContent('/path/to/log')
    expect(logger.debug).toHaveBeenCalledWith('line1')
    expect(logger.debug).toHaveBeenCalledWith('line2')
    expect(logger.debug).toHaveBeenCalledWith('line3')
  })
})

describe('createFolders', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.spyOn(fs, 'mkdirSync')
    jest.spyOn(logger, 'debug')
  })

  it('should create all specified folders', () => {
    createFolders('/config', '/shared', '/results')
    expect(fs.mkdirSync).toHaveBeenCalledWith('/config', { recursive: true })
    expect(fs.mkdirSync).toHaveBeenCalledWith('/shared', { recursive: true })
    expect(fs.mkdirSync).toHaveBeenCalledWith('/results', { recursive: true })
  })
})
