const logger = require('./log')
const { execSync } = require('child_process')
const { dirname, basename } = require('node:path')
const yaml = require('js-yaml')
const core = require('@actions/core')
const fs = require('fs')

/**
 * Parse the configuration file as YAML
 * @param configFile  YAML configuration file
 * @returns {*} Parsed YAML object
 */
function parseConfigFile(configFile) {
  logger.debug(`Parsing config file=${configFile}`)
  try {
    return yaml.load(fs.readFileSync(configFile, 'utf8'))
  } catch (error) {
    core.setFailed(error.message)
    throw Error(
      `Failed to parse configuration file, config-file=${configFile}`,
      error
    )
  }
}

function writeToFile(folder, fileName, content, isPlanText) {
  if (!fs.existsSync(folder)) {
    logger.debug(`Creating folder since it does not exist, folder=${folder}`)
    fs.mkdirSync(folder, { recursive: true })
  }
  const fileContent = isPlanText ? content : yaml.dump(content)
  logger.debug(`Creating file, file-path=${folder}/${fileName}`)
  try {
    fs.writeFileSync(`${folder}/${fileName}`, fileContent, 'utf-8')
  } catch (err) {
    logger.error(`Failed to write to file, file-name=${folder}/${fileName}`)
    throw new Error(err)
  }
}

async function cleanAppDoneFiles(parsedConfig, sharedFolder, timeout = 4000) {
  // Clean up 'app-*-done' files in shared directory
  await new Promise(resolve => {
    setTimeout(resolve, timeout)
  })
  logger.debug('Removing files relating to notifying the application is done')
  for (const [i] of parsedConfig.run.entries()) {
    try {
      fs.unlinkSync(`${sharedFolder}/app-${i}-done`)
    } catch (error) {
      logger.debug(error)
    }
  }
}

async function checkFileExistsWithTimeout(filePath, appIndex, timeout = 60000) {
  await new Promise(function (resolve, reject) {
    // eslint-disable-next-line prefer-const
    let watcher

    const timer = setTimeout(function () {
      if (watcher) {
        watcher.close()
      }
      logger.info('Checking data-caterer logs')
      try {
        const dataCatererLogs = execSync(`docker logs data-caterer-${appIndex}`)
        logger.info(dataCatererLogs.toString())
      } catch (e) {
        logger.error('Failed to get data-caterer logs', e)
      }
      reject(
        new Error(
          `File did not exist and was not created during the timeout, file=${filePath}`
        )
      )
    }, timeout)

    fs.access(filePath, fs.constants.R_OK, function (err) {
      if (!err) {
        logger.debug(`File exists, file=${filePath}`)
        clearTimeout(timer)
        if (watcher) {
          watcher.close()
        }
        resolve()
      }
    })

    const dir = dirname(filePath)
    const currBasename = basename(filePath)
    watcher = fs.watch(dir, function (eventType, filename) {
      if (eventType === 'rename' && filename === currBasename) {
        clearTimeout(timer)
        if (watcher) {
          watcher.close()
        }
        resolve()
      }
    })
  })
  await new Promise(resolve => {
    setTimeout(resolve, 1000)
  })
}

function showLogFileContent(logFile) {
  logger.debug(`Showing application logs`)
  const logFileContent = fs.readFileSync(logFile).toString()
  // eslint-disable-next-line github/array-foreach
  logFileContent.split('\n').forEach(logLine => {
    logger.debug(logLine)
  })
}

function createFolders(configurationFolder, sharedFolder, testResultsFolder) {
  logger.debug(
    `Using data caterer configuration folder: ${configurationFolder}`
  )
  logger.debug(`Using shared folder: ${sharedFolder}`)
  logger.debug(`Using test results folder: ${testResultsFolder}`)
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
