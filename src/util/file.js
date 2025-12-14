const logger = require('./log')
const { execSync } = require('child_process')
const { dirname, basename } = require('node:path')
const yaml = require('js-yaml')
const core = require('@actions/core')
const fs = require('fs')

const PREFIX = logger.PREFIX.CONFIG

/**
 * Parse the configuration file as YAML
 * @param configFile  YAML configuration file
 * @returns {*} Parsed YAML object
 */
function parseConfigFile(configFile) {
  logger.info(`${PREFIX} Loading configuration: ${configFile}`)
  try {
    const config = yaml.load(fs.readFileSync(configFile, 'utf8'))
    logger.debug(`${PREFIX} Configuration loaded successfully`)
    return config
  } catch (error) {
    logger.logError(
      PREFIX,
      `Failed to parse configuration file: ${configFile}`,
      error
    )
    core.setFailed(error.message)
    throw Error(
      `Failed to parse configuration file, config-file=${configFile}`,
      error
    )
  }
}

function writeToFile(folder, fileName, content, isPlanText) {
  if (!fs.existsSync(folder)) {
    logger.debug(`${PREFIX} Creating folder: ${folder}`)
    fs.mkdirSync(folder, { recursive: true })
  }
  const fileContent = isPlanText ? content : yaml.dump(content)
  const filePath = `${folder}/${fileName}`
  logger.debug(`${PREFIX} Writing file: ${filePath}`)
  try {
    fs.writeFileSync(filePath, fileContent, 'utf-8')
  } catch (err) {
    logger.logError(PREFIX, `Failed to write file: ${filePath}`, err)
    throw new Error(err)
  }
}

async function cleanAppDoneFiles(parsedConfig, sharedFolder, timeout = 4000) {
  await new Promise(resolve => {
    setTimeout(resolve, timeout)
  })
  logger.debug(`${PREFIX} Cleaning up app notification files`)
  for (const [i] of parsedConfig.run.entries()) {
    try {
      fs.unlinkSync(`${sharedFolder}/app-${i}-done`)
    } catch (error) {
      logger.debug(`${PREFIX} No file to clean: app-${i}-done`)
    }
  }
}

async function checkFileExistsWithTimeout(filePath, appIndex, timeout = 60000) {
  logger.debug(
    `${PREFIX} Waiting for file: ${filePath} (timeout: ${timeout}ms)`
  )
  await new Promise(function (resolve, reject) {
    // eslint-disable-next-line prefer-const
    let watcher

    const timer = setTimeout(function () {
      if (watcher) {
        watcher.close()
      }
      logger.warn(`${PREFIX} Timeout waiting for file: ${filePath}`)
      logger.info(
        `${logger.PREFIX.DOCKER} Retrieving data-caterer logs for debugging...`
      )
      try {
        const dataCatererLogs = execSync(`docker logs data-caterer-${appIndex}`)
        logger.info(dataCatererLogs.toString())
      } catch (e) {
        logger.logError(
          logger.PREFIX.DOCKER,
          'Failed to retrieve data-caterer logs',
          e
        )
      }
      reject(
        new Error(`Timeout: File not created within ${timeout}ms: ${filePath}`)
      )
    }, timeout)

    fs.access(filePath, fs.constants.R_OK, function (err) {
      if (!err) {
        logger.debug(`${PREFIX} File found: ${filePath}`)
        clearTimeout(timer)
        if (watcher) {
          watcher.close()
        }
        resolve()
      }
    })

    const dir = dirname(filePath)
    const currBasename = basename(filePath)
    try {
      watcher = fs.watch(dir, function (eventType, filename) {
        if (eventType === 'rename' && filename === currBasename) {
          clearTimeout(timer)
          if (watcher) {
            watcher.close()
          }
          resolve()
        }
      })
      watcher.on('error', function (watchError) {
        logger.debug(
          `${PREFIX} File watcher error for ${dir}: ${watchError.message}`
        )
      })
    } catch (watchError) {
      logger.debug(
        `${PREFIX} Could not watch directory ${dir}: ${watchError.message}`
      )
    }
  })
  await new Promise(resolve => {
    setTimeout(resolve, 1000)
  })
}

function showLogFileContent(logFile) {
  if (logger.isDebugEnabled()) {
    logger.debug(`${logger.PREFIX.APP} Application logs from: ${logFile}`)
    if (fs.existsSync(logFile)) {
      const logFileContent = fs.readFileSync(logFile).toString()
      // eslint-disable-next-line github/array-foreach
      logFileContent.split('\n').forEach(logLine => {
        if (logLine.trim()) {
          logger.debug(`  ${logLine}`)
        }
      })
    } else {
      logger.warn(`${logger.PREFIX.APP} Log file does not exist: ${logFile}`)
    }
  }
}

function createFolders(configurationFolder, sharedFolder, testResultsFolder) {
  logger.debug(`${PREFIX} Creating folders:`)
  logger.debug(`${PREFIX}   Configuration: ${configurationFolder}`)
  logger.debug(`${PREFIX}   Shared: ${sharedFolder}`)
  logger.debug(`${PREFIX}   Results: ${testResultsFolder}`)
  fs.mkdirSync(configurationFolder, { recursive: true })
  fs.mkdirSync(sharedFolder, { recursive: true })
  fs.mkdirSync(testResultsFolder, { recursive: true })
}

module.exports = {
  parseConfigFile,
  writeToFile,
  cleanAppDoneFiles,
  checkFileExistsWithTimeout,
  showLogFileContent,
  createFolders
}
