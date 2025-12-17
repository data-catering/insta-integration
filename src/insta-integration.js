const { spawn } = require('child_process')
const core = require('@actions/core')
const fs = require('fs')
const {
  baseApplicationConf,
  basePlan,
  baseTask,
  baseValidation,
  createDataCatererDockerRunCommand,
  notifyGenerationDoneTask
} = require('./util/config')
const { dirname, basename } = require('node:path')
const {
  removeContainer,
  runDockerImage,
  createDockerNetwork,
  waitForContainerToFinish,
  logOutContainerLogs
} = require('./util/docker')
const { checkInstaInfraExists, runServices } = require('./util/insta-infra')
const logger = require('./util/log')
const {
  parseConfigFile,
  cleanAppDoneFiles,
  writeToFile,
  createFolders,
  showLogFileContent,
  checkFileExistsWithTimeout
} = require('./util/file')

const PREFIX_CONFIG = logger.PREFIX.CONFIG
const PREFIX_APP = logger.PREFIX.APP
const PREFIX_DATA_GEN = logger.PREFIX.DATA_GEN
const PREFIX_VALIDATION = logger.PREFIX.VALIDATION

/**
 * From the parsed YAML configuration, extract services to run along with environment variables
 * @param parsedConfig  YAML configuration
 * @param configFileDirectory Directory of configuration file
 * @returns {{envVars: {}, serviceNames: *[]}}
 */
function extractServiceNamesAndEnv(parsedConfig, configFileDirectory) {
  const serviceNames = []
  const envVars = {}
  if (parsedConfig.services) {
    logger.debug(
      `${PREFIX_CONFIG} Processing ${parsedConfig.services.length} service(s)`
    )
    for (const service of parsedConfig.services) {
      let serviceName = service.name
      logger.debug(`${PREFIX_CONFIG} Configuring service: ${serviceName}`)
      let envServiceName = serviceName.toUpperCase()
      const sptName = serviceName.split(':')

      if (sptName.length >= 2) {
        serviceName = sptName[0]
        serviceNames.push(serviceName)
        const nameAsEnv = serviceName.toUpperCase().replaceAll('-', '_')
        envServiceName = nameAsEnv
        envVars[`${nameAsEnv}_VERSION`] = sptName[1]
      } else if (sptName.length === 1) {
        serviceNames.push(serviceName)
      }

      if (service.env) {
        for (const kv of Object.entries(service.env)) {
          envVars[kv[0]] = kv[1]
        }
      }

      if (service.data) {
        const downloadLinkRegex = new RegExp('^http[s?]://.*$')
        if (downloadLinkRegex.test(service.data)) {
          logger.warn(
            `${PREFIX_CONFIG} URL data sources not yet supported: ${service.data}`
          )
        } else if (service.data.startsWith('/')) {
          envVars[`${envServiceName}_DATA`] = service.data
        } else {
          const dataPath = `${configFileDirectory}/${service.data}`
          logger.debug(`${PREFIX_CONFIG} Service data path: ${dataPath}`)
          envVars[`${envServiceName}_DATA`] = dataPath
        }
      }
    }
  } else {
    logger.debug(`${PREFIX_CONFIG} No services defined`)
  }
  return { serviceNames, envVars }
}

function extractServiceFromGeneration(
  testConfig,
  sptRelationship,
  generationTaskToServiceMapping
) {
  if (generationTaskToServiceMapping[sptRelationship[0]] !== undefined) {
    const service = generationTaskToServiceMapping[sptRelationship[0]]
    logger.debug(
      `${PREFIX_DATA_GEN} Mapped generation task to service: ${service}`
    )
    return service
  } else {
    throw new Error(
      `Relationship defined without corresponding generation task: ${sptRelationship[0]}`
    )
  }
}

function extractDataGenerationTasks(
  testConfig,
  currentPlan,
  currentTasks,
  generationTaskToServiceMapping
) {
  if (testConfig.generation) {
    const genEntries = Object.entries(testConfig.generation)
    logger.debug(
      `${PREFIX_DATA_GEN} Processing ${genEntries.length} generation task(s)`
    )
    for (const dataSourceGeneration of genEntries) {
      const task = baseTask()
      for (const generationTask of dataSourceGeneration[1]) {
        const taskName = `${dataSourceGeneration[0]}-task`
        const nameWithDataSource = {
          name: taskName,
          dataSourceName: dataSourceGeneration[0]
        }
        if (!currentPlan.tasks.includes(nameWithDataSource)) {
          currentPlan.tasks.push(nameWithDataSource)
        }
        task.name = taskName
        const mappedGenTask = Object.fromEntries(
          Object.entries(generationTask).map(currTask => {
            if (currTask[0] === 'fields') {
              return [
                currTask[0],
                (currTask[1] || []).map(currField => {
                  return Object.fromEntries(
                    Object.entries(currField).map(fieldEntry => {
                      return fieldEntry
                    })
                  )
                })
              ]
            } else {
              return currTask
            }
          })
        )
        task.steps.push(mappedGenTask)
        generationTaskToServiceMapping[generationTask.name] =
          dataSourceGeneration[0]
      }
      currentTasks.push(task)
    }

    if (currentPlan.tasks.some(t => t.dataSourceName === 'csv')) {
      const csvTask = currentTasks.find(t => t.name === 'csv-task')
      csvTask.steps.push(notifyGenerationDoneTask())
    } else {
      currentPlan.tasks.push({ name: 'csv-task', dataSourceName: 'csv' })
      currentTasks.push({
        name: 'csv-task',
        steps: [notifyGenerationDoneTask()]
      })
    }
  } else {
    logger.debug(`${PREFIX_DATA_GEN} No generation tasks defined`)
  }
}

function getForeignKeyFromRelationship(
  relationship,
  testConfig,
  generationTaskToServiceMapping
) {
  const sptRelationship = relationship.split('||')
  if (sptRelationship.length < 2 || sptRelationship.length > 3) {
    throw new Error(
      `Invalid relationship format (expected: <name>||<fields> or <source>||<name>||<fields>): ${relationship}`
    )
  }

  if (sptRelationship.length === 3) {
    return {
      dataSource: sptRelationship[0],
      step: sptRelationship[1],
      fields: sptRelationship[2].split(',')
    }
  } else {
    return {
      dataSource: extractServiceFromGeneration(
        testConfig,
        sptRelationship,
        generationTaskToServiceMapping
      ),
      step: sptRelationship[0],
      fields: sptRelationship[1].split(',')
    }
  }
}

function extractRelationships(
  testConfig,
  generationTaskToServiceMapping,
  currentPlan
) {
  if (testConfig.relationship) {
    const relEntries = Object.entries(testConfig.relationship)
    logger.debug(
      `${PREFIX_DATA_GEN} Processing ${relEntries.length} relationship(s)`
    )
    for (const rel of relEntries) {
      if (testConfig.generation) {
        const childrenRelationshipServiceNames = []
        for (const childRel of rel[1]) {
          const foreignKeyRelation = getForeignKeyFromRelationship(
            childRel,
            testConfig,
            generationTaskToServiceMapping
          )
          childrenRelationshipServiceNames.push(foreignKeyRelation)
        }
        const sourceForeignKeyRelation = getForeignKeyFromRelationship(
          rel[0],
          testConfig,
          generationTaskToServiceMapping
        )
        currentPlan.sinkOptions.foreignKeys.push({
          source: sourceForeignKeyRelation,
          generate: childrenRelationshipServiceNames
        })
      } else {
        throw new Error(
          'Cannot define relationship without any data generation defined'
        )
      }
    }
  } else {
    logger.debug(`${PREFIX_DATA_GEN} No relationships defined`)
  }
}

function extractDataValidations(testConfig, appIndex, currValidations) {
  if (testConfig.validation) {
    const validEntries = Object.entries(testConfig.validation)
    logger.debug(
      `${PREFIX_VALIDATION} Processing ${validEntries.length} validation(s)`
    )
    for (const valid of validEntries) {
      const currService = valid[0]
      const dataSourceValidations = valid[1]
      if (
        dataSourceValidations.length > 0 &&
        !dataSourceValidations[0].waitCondition
      ) {
        dataSourceValidations[0].waitCondition = {
          path: `/opt/app/shared/app-${appIndex}-done`
        }
      }
      currValidations.dataSources[currService] = dataSourceValidations
    }
  } else {
    logger.debug(`${PREFIX_VALIDATION} No validations defined`)
  }
}

function extractDataCatererEnv(testConfig) {
  return testConfig.env ? testConfig.env : {}
}

function runDataCaterer(
  testConfig,
  appIndex,
  configurationFolder,
  sharedFolder,
  baseConfig
) {
  logger.info(`${PREFIX_DATA_GEN} Preparing data generation and validation`)
  const currentPlan = basePlan()
  const runId = currentPlan.runId
  const currentTasks = []
  const currValidations = baseValidation()
  const generationTaskToServiceMapping = {}
  extractDataGenerationTasks(
    testConfig,
    currentPlan,
    currentTasks,
    generationTaskToServiceMapping
  )
  extractRelationships(testConfig, generationTaskToServiceMapping, currentPlan)
  extractDataValidations(testConfig, appIndex, currValidations)
  const dataCatererEnv = extractDataCatererEnv(testConfig)

  writeToFile(`${configurationFolder}/plan`, 'my-plan.yaml', currentPlan)
  fs.mkdirSync(`${configurationFolder}/task`, { recursive: true })
  for (const currTask of currentTasks) {
    writeToFile(
      `${configurationFolder}/task`,
      `${currTask.name}.yaml`,
      currTask
    )
  }
  fs.mkdirSync(`${configurationFolder}/validation`, { recursive: true })
  writeToFile(
    `${configurationFolder}/validation`,
    'my-validations.yaml',
    currValidations
  )
  createDockerNetwork()
  const dockerRunCommand = createDataCatererDockerRunCommand(
    baseConfig.dataCatererVersion,
    sharedFolder,
    configurationFolder,
    'my-plan.yaml',
    dataCatererEnv,
    testConfig.mount,
    appIndex
  )

  removeContainer(`data-caterer-${appIndex}`)
  logger.info(`${PREFIX_DATA_GEN} Starting data-caterer container`)
  runDockerImage(dockerRunCommand, appIndex)
  return runId
}

async function waitForDataGeneration(testConfig, sharedFolder, appIndex) {
  if (
    testConfig.generation &&
    Object.entries(testConfig.generation).length > 0
  ) {
    logger.info(`${PREFIX_DATA_GEN} Waiting for data generation to complete...`)
    const notifyFilePath = `${sharedFolder}/notify/data-gen-done`
    fs.mkdirSync(`${sharedFolder}/notify`, { recursive: true })
    await checkFileExistsWithTimeout(notifyFilePath, appIndex)
    logOutContainerLogs(`data-caterer-${appIndex}`)
    logger.logSuccess(PREFIX_DATA_GEN, 'Data generation completed')
    logger.debug(`${PREFIX_DATA_GEN} Cleaning up notification file`)
    try {
      fs.rmSync(notifyFilePath, {
        force: true
      })
    } catch (error) {
      logger.warn(
        `${PREFIX_DATA_GEN} Could not remove notification file: ${error.message}`
      )
    }
  } else {
    logger.debug(`${PREFIX_DATA_GEN} No generation tasks - skipping wait`)
  }
}

function setEnvironmentVariables(runConf) {
  if (runConf.env) {
    const envCount = Object.entries(runConf.env).length
    logger.debug(`${PREFIX_APP} Setting ${envCount} environment variable(s)`)
    for (const env of Object.entries(runConf.env)) {
      logger.debug(`${PREFIX_APP} Set env: ${env[0]}`)
      process.env[env[0]] = env[1]
    }
  }
}

async function runApplication(
  runConf,
  configFolder,
  baseFolder,
  appIndex,
  waitForFinish
) {
  if (runConf.command) {
    logger.info(`${PREFIX_APP} Running application (index: ${appIndex})`)
    logger.debug(`${PREFIX_APP} Command: ${runConf.command}`)
    setEnvironmentVariables(runConf)
    const logsFolder = `${baseFolder}/logs`
    if (!fs.existsSync(logsFolder)) {
      try {
        fs.mkdirSync(logsFolder, { recursive: true })
      } catch (e) {
        logger.logError(
          PREFIX_APP,
          `Failed to create logs folder: ${logsFolder}`,
          e
        )
        throw new Error(e)
      }
    }
    if (!fs.existsSync(configFolder)) {
      try {
        fs.mkdirSync(configFolder, { recursive: true })
      } catch (e) {
        logger.logError(
          PREFIX_APP,
          `Failed to create config folder: ${configFolder}`,
          e
        )
        throw new Error(e)
      }
    }
    try {
      const logFile = `${logsFolder}/app_output_${appIndex}.log`
      const logStream = fs.createWriteStream(logFile, { flags: 'w+' })
      const runApp = spawn(runConf.command, [], {
        cwd: configFolder,
        shell: true
      })
      runApp.stdout.pipe(logStream)
      runApp.stderr.pipe(logStream)

      const resultPromise = new Promise((resolve, reject) => {
        runApp.on('error', function (err) {
          logger.logError(PREFIX_APP, `Application ${appIndex} failed`, err)
          logStream.end()
          showLogFileContent(logFile)
          reject(err)
        })
        runApp.on('close', function (code) {
          logStream.end()
          showLogFileContent(logFile)
          if (code !== 0) {
            logger.logError(
              PREFIX_APP,
              `Application ${appIndex} exited with code ${code}`
            )
            reject(
              new Error(`Application ${appIndex} exited with code ${code}`)
            )
          } else {
            logger.logSuccess(
              PREFIX_APP,
              `Application ${appIndex} completed (exit code: 0)`
            )
            resolve(runApp)
          }
        })

        if (!waitForFinish) {
          logger.debug(`${PREFIX_APP} Running in background mode`)
          resolve(runApp)
        }
      })
        // eslint-disable-next-line github/no-then
        .then(app => {
          logger.debug(`${PREFIX_APP} Command successful: ${runConf.command}`)
          return app
        })
        // eslint-disable-next-line github/no-then
        .catch(error => {
          logger.logError(
            PREFIX_APP,
            `Command failed: ${runConf.command}`,
            error
          )
          throw new Error(error)
        })

      if (waitForFinish) {
        logger.info(`${PREFIX_APP} Waiting for application to complete...`)
        await resultPromise
      }
      return { resultPromise, runApp }
    } catch (error) {
      logger.logError(
        PREFIX_APP,
        `Failed to run command: ${runConf.command}`,
        error
      )
      throw new Error(error)
    }
  } else {
    logger.debug(`${PREFIX_APP} No command defined`)
    return null
  }
}

function shutdownApplication(applicationProcess) {
  if (applicationProcess !== null) {
    logger.debug(`${PREFIX_APP} Shutting down application`)
    if (applicationProcess && applicationProcess.runApp) {
      applicationProcess.runApp.kill()
      logger.debug(`${PREFIX_APP} Application terminated`)
    } else {
      logger.debug(`${PREFIX_APP} Application already stopped`)
    }
  }
}

function isRunGenerationFirst(runConf) {
  const generateFirstValue = runConf.generateFirst
  const isGenerateFirstTrue =
    generateFirstValue === true || generateFirstValue === 'true'
  const generateFirstTrueWithTest =
    typeof generateFirstValue !== 'undefined' &&
    isGenerateFirstTrue &&
    !!runConf.test
  return generateFirstTrueWithTest || typeof generateFirstValue === 'undefined'
}

async function runTests(parsedConfig, configFileDirectory, config) {
  const baseFolder = config.baseFolder

  const configurationFolder = `${baseFolder}/conf`
  const sharedFolder = `${baseFolder}/shared`
  const testResultsFolder = `${configurationFolder}/report`
  const testResults = []
  createFolders(configurationFolder, sharedFolder, testResultsFolder)
  setEnvironmentVariables(parsedConfig)

  if (parsedConfig.run) {
    logger.info(
      `${PREFIX_APP} Processing ${parsedConfig.run.length} test run(s)`
    )
    await cleanAppDoneFiles(parsedConfig, sharedFolder)
    for (const [i, runConf] of parsedConfig.run.entries()) {
      logger.info(
        `${PREFIX_APP} ─── Test Run ${i + 1} of ${parsedConfig.run.length} ───`
      )
      writeToFile(
        configurationFolder,
        'application.conf',
        baseApplicationConf(),
        true
      )

      let applicationProcess
      let dataCatererRunId
      if (isRunGenerationFirst(runConf)) {
        logger.debug(
          `${PREFIX_APP} Mode: generate data first, then run application`
        )
        dataCatererRunId = runDataCaterer(
          runConf.test,
          i,
          configurationFolder,
          sharedFolder,
          config
        )
        await waitForDataGeneration(runConf.test, sharedFolder, i)
        applicationProcess = await runApplication(
          runConf,
          configFileDirectory,
          baseFolder,
          i,
          runConf.commandWaitForFinish
        )
        logger.debug(
          `${PREFIX_APP} Notifying data-caterer that application is done`
        )
        writeToFile(sharedFolder, `app-${i}-done`, 'done', true)
      } else {
        logger.debug(
          `${PREFIX_APP} Mode: run application first, then generate data`
        )
        applicationProcess = await runApplication(
          runConf,
          configFileDirectory,
          baseFolder,
          i,
          runConf.commandWaitForFinish
        )
        writeToFile(sharedFolder, `app-${i}-done`, 'done', true)
        dataCatererRunId = runDataCaterer(
          runConf.test,
          i,
          configurationFolder,
          sharedFolder,
          config
        )
      }
      await waitForContainerToFinish(`data-caterer-${i}`)
      const testResultsFile = `${testResultsFolder}/${dataCatererRunId}/results.json`
      if (fs.existsSync(testResultsFile)) {
        testResults.push(JSON.parse(fs.readFileSync(testResultsFile, 'utf8')))
        logger.debug(`${PREFIX_VALIDATION} Loaded results: ${testResultsFile}`)
      } else {
        logger.warn(
          `${PREFIX_VALIDATION} Results file not found: ${testResultsFile}`
        )
      }
    }
    await cleanAppDoneFiles(parsedConfig, sharedFolder)
  }
  return testResults
}

function showTestResultSummary(testResults) {
  let numRecordsGenerated = -1
  let numSuccessValidations = 0
  let numFailedValidations = 0
  let numValidations = 0
  const failedValidationDetails = []

  for (const testResult of testResults) {
    if (testResult.generation) {
      for (const generation of testResult.generation) {
        numRecordsGenerated += generation.numRecords
      }
    }

    if (testResult.validation) {
      for (const validation of testResult.validation) {
        numSuccessValidations += validation.numSuccess
        numValidations += validation.numValidations
        numFailedValidations +=
          validation.numValidations - validation.numSuccess
        if (validation.errorValidations) {
          for (const errorValidation of validation.errorValidations) {
            failedValidationDetails.push({
              ...errorValidation,
              dataSourceName: validation.dataSourceName,
              options: validation.options
            })
          }
        }
      }
    }
  }

  const validationSuccessRate =
    numValidations > 0
      ? ((numSuccessValidations / numValidations) * 100).toFixed(1)
      : 'N/A'

  // Show failed validation details first if any
  if (failedValidationDetails.length > 0) {
    logger.info('')
    logger.info(`${PREFIX_VALIDATION} Failed Validation Details:`)
    for (const errorValidation of failedValidationDetails) {
      const validationStr = JSON.stringify(errorValidation.validation)
      const dataSource = errorValidation.dataSourceName || 'unknown'
      const options = errorValidation.options
        ? JSON.stringify(errorValidation.options)
        : ''
      logger.error(`${PREFIX_VALIDATION}   ✗ Data Source: ${dataSource}`)
      if (options) {
        logger.error(`${PREFIX_VALIDATION}     Options: ${options}`)
      }
      logger.error(`${PREFIX_VALIDATION}     Validation: ${validationStr}`)
      logger.error(
        `${PREFIX_VALIDATION}     Errors: ${errorValidation.numErrors}`
      )
      if (
        errorValidation.sampleErrorValues &&
        Object.entries(errorValidation.sampleErrorValues).length > 0
      ) {
        logger.error(
          `${PREFIX_VALIDATION}     Sample: ${JSON.stringify(errorValidation.sampleErrorValues[0])}`
        )
      }
    }
  }

  // Summary section
  const summaryData = {
    'Records Generated': numRecordsGenerated >= 0 ? numRecordsGenerated : 0,
    'Validations Run': numValidations,
    'Validations Passed': numSuccessValidations,
    'Validations Failed': numFailedValidations,
    'Success Rate':
      typeof validationSuccessRate === 'string'
        ? validationSuccessRate
        : `${validationSuccessRate}%`
  }

  logger.logSummary('Test Results', summaryData)

  if (process.env.GITHUB_ACTION) {
    core.setOutput(
      'num_records_generated',
      numRecordsGenerated >= 0 ? numRecordsGenerated : 0
    )
    core.setOutput('num_success_validations', numSuccessValidations)
    core.setOutput('num_failed_validations', numFailedValidations)
    core.setOutput('num_validations', numValidations)
    core.setOutput(
      'validation_success_rate',
      numValidations > 0 ? numSuccessValidations / numValidations : 0
    )
    core.setOutput('full_results', testResults)
  }

  return numFailedValidations
}

/**
 * Given configuration file, do the following:
 * - Get services and initial data set up
 * - Configure and run insta-infra to startup services
 * - Run command for application startup
 * - Setup data-caterer configuration for data generation and validation
 * - Run data-caterer
 * - Return back summarised results
 * @param config Base configuration with config file path, execution folder, and docker token
 * @returns {Promise<*>} Resolves with test results
 */
async function runIntegrationTests(config) {
  const parsedConfig = parseConfigFile(config.applicationConfig)
  const applicationConfigDirectory = config.applicationConfig.startsWith('/')
    ? dirname(config.applicationConfig)
    : `${process.cwd()}/${dirname(config.applicationConfig)}`
  checkInstaInfraExists()

  const { serviceNames, envVars } = extractServiceNamesAndEnv(
    parsedConfig,
    applicationConfigDirectory
  )

  if (serviceNames.length > 0) {
    logger.info(
      `${logger.PREFIX.SERVICE} Starting ${serviceNames.length} service(s)`
    )
    runServices(serviceNames, envVars)
  } else {
    logger.debug(`${logger.PREFIX.SERVICE} No services to start`)
  }

  const testResultsPromise = runTests(
    parsedConfig,
    applicationConfigDirectory,
    config
  )

  // eslint-disable-next-line github/no-then
  return testResultsPromise.then(testResults => {
    const numFailed = showTestResultSummary(testResults)
    if (numFailed > 0) {
      logger.warn(`${PREFIX_VALIDATION} ${numFailed} validation(s) failed`)
    }
  })
}

module.exports = {
  runIntegrationTests,
  extractDataGenerationTasks,
  extractServiceFromGeneration,
  extractDataValidations,
  extractRelationships,
  extractServiceNamesAndEnv,
  shutdownApplication,
  runApplication,
  isRunGenerationFirst
}
