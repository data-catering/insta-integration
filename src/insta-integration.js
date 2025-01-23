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

/**
 * From the parsed YAML configuration, extract services to run along with environment variables
 * @param parsedConfig  YAML configuration
 * @param configFileDirectory Directory of configuration file
 * @returns {{envVars: {}, serviceNames: *[]}}
 */
function extractServiceNamesAndEnv(parsedConfig, configFileDirectory) {
  // For each service defined, download any data required, pass service names and versions to insta-infra
  const serviceNames = []
  const envVars = {}
  if (parsedConfig.services) {
    for (const service of parsedConfig.services) {
      let serviceName = service.name
      logger.debug(`Parsing config for service=${serviceName}`)
      let envServiceName = serviceName.toUpperCase()
      const sptName = serviceName.split(':')

      // If there is 2 parts, version of service has been explicitly defined
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
        // Add any additional environment variables required
        for (const kv of Object.entries(service.env)) {
          envVars[kv[0]] = kv[1]
        }
      } else {
        logger.debug(
          `No environment variables defined for service=${serviceName}`
        )
      }

      if (service.data) {
        // service.data could be a URL, directory or single file
        const downloadLinkRegex = new RegExp('^http[s?]://.*$')
        if (downloadLinkRegex.test(service.data)) {
          // TODO Then we need to download directory or file
          logger.info('Downloading data is currently unsupported')
        } else if (service.data.startsWith('/')) {
          envVars[`${envServiceName}_DATA`] = service.data
        } else {
          // Can be a relative directory from perspective of config YAML
          const dataPath = `${configFileDirectory}/${service.data}`
          logger.debug(`Using env var: ${envServiceName}_DATA -> ${dataPath}`)
          envVars[`${envServiceName}_DATA`] = dataPath
        }
      } else {
        logger.debug(
          `No custom data at startup used for service=${serviceName}`
        )
      }
    }
  } else {
    logger.debug('No services defined')
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
    logger.debug(`Found corresponding generation task, service=${service}`)
    return service
  } else {
    throw new Error(
      `Relationship defined without corresponding generation task, relationship=${sptRelationship[0]}`
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
    logger.debug('Checking for data generation configurations')
    for (const dataSourceGeneration of Object.entries(testConfig.generation)) {
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

    // Need to add data gen task to notify this process that data caterer is done generating data and application can run
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
    logger.debug('No data generation tasks defined')
  }
}

function extractRelationships(
  testConfig,
  generationTaskToServiceMapping,
  currentPlan
) {
  if (testConfig.relationship) {
    logger.debug('Checking for data generation relationship configurations')
    for (const rel of Object.entries(testConfig.relationship)) {
      // Find the corresponding service name from generation tasks
      // Also, validate that a generation task exists if relationship is defined
      const sptRelationship = rel[0].split('.')
      if (sptRelationship.length !== 2) {
        throw new Error(
          `Relationship should follow pattern: <generation name>.<field name>, relationship=${rel[0]}`
        )
      }
      if (testConfig.generation) {
        const baseServiceName = extractServiceFromGeneration(
          testConfig,
          sptRelationship,
          generationTaskToServiceMapping
        )
        const childrenRelationshipServiceNames = []
        for (const childRel of rel[1]) {
          const sptChildRelationship = childRel.split('.')
          if (sptChildRelationship.length !== 2) {
            throw new Error(
              `Relationship should follow pattern: <generation name>.<field name>, relationship=${childRel}`
            )
          }
          const childServiceName = extractServiceFromGeneration(
            testConfig,
            sptChildRelationship,
            generationTaskToServiceMapping
          )
          const foreignKeyRelation = {
            dataSource: childServiceName,
            step: sptChildRelationship[0],
            fields: sptChildRelationship[1].split(',')
          }
          childrenRelationshipServiceNames.push(foreignKeyRelation)
        }
        const sourceForeignKeyRelation = {
          dataSource: baseServiceName,
          step: sptRelationship[0],
          fields: sptRelationship[1].split(',')
        }
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
    logger.debug('No relationships defined')
  }
}

function extractDataValidations(testConfig, appIndex, currValidations) {
  logger.debug('Checking for data validation configurations')
  if (testConfig.validation) {
    for (const valid of Object.entries(testConfig.validation)) {
      const currService = valid[0]
      const dataSourceValidations = valid[1]
      // Check to see if a wait condition is already defined, else add in one
      // to wait for tmp file to exist that is generated after application/job is run
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
    logger.debug('No data validations defined')
  }
}

function extractDataCatererEnv(testConfig, baseConfig) {
  const allConfig = testConfig.env ? testConfig.env : {}
  if (baseConfig.dataCatererUser) {
    allConfig['DATA_CATERER_API_USER'] = baseConfig.dataCatererUser
  } else {
    throw new Error('No data caterer user defined')
  }
  if (baseConfig.dataCatererToken) {
    allConfig['DATA_CATERER_API_TOKEN'] = baseConfig.dataCatererToken
  } else {
    throw new Error('No data caterer token defined')
  }
  return allConfig
}

function runDataCaterer(
  testConfig,
  appIndex,
  configurationFolder,
  sharedFolder,
  baseConfig
) {
  logger.info('Reading data generation and validation configurations')
  // Use template plan and task YAML files
  // Also, template application.conf
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
  const dataCatererEnv = extractDataCatererEnv(testConfig, baseConfig)

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
  logger.info('Starting to run data generation and validation')
  runDockerImage(dockerRunCommand, appIndex)
  return runId
}

async function waitForDataGeneration(testConfig, sharedFolder, appIndex) {
  // For applications/jobs that rely on data to be generated first before running, we wait until data caterer has
  // created a csv file to notify us that it has completed generating data
  if (
    testConfig.generation &&
    Object.entries(testConfig.generation).length > 0
  ) {
    logger.info('Waiting for data generation to be completed')
    const notifyFilePath = `${sharedFolder}/notify/data-gen-done`
    fs.mkdirSync(`${sharedFolder}/notify`, { recursive: true })
    await checkFileExistsWithTimeout(notifyFilePath, appIndex)
    logOutContainerLogs(`data-caterer-${appIndex}`)
    logger.debug('Removing data generation done folder')
    try {
      fs.rmSync(notifyFilePath, {
        force: true
      })
    } catch (error) {
      logger.warn(error)
    }
  } else {
    logger.debug(
      'No data generation defined, not waiting for data generation to be completed'
    )
  }
}

function setEnvironmentVariables(runConf) {
  if (runConf.env) {
    for (const env of Object.entries(runConf.env)) {
      logger.debug(
        `Setting environment variable for application/job run, key=${env[0]}`
      )
      process.env[env[0]] = env[1]
    }
  } else {
    logger.debug('No environment variables set')
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
    logger.info('Running application/job')
    setEnvironmentVariables(runConf)
    const logsFolder = `${baseFolder}/logs`
    if (!fs.existsSync(logsFolder)) {
      try {
        fs.mkdirSync(logsFolder, { recursive: true })
      } catch (e) {
        logger.error(`Failed to create logs folder, folder=${logsFolder}`)
        throw new Error(e)
      }
    }
    if (!fs.existsSync(configFolder)) {
      try {
        fs.mkdirSync(configFolder, { recursive: true })
      } catch (e) {
        logger.error(`Failed to create config folder, folder=${configFolder}`)
        throw new Error(e)
      }
    }
    try {
      const logFile = `${logsFolder}/app_output_${appIndex}.log`
      const logStream = fs.createWriteStream(logFile, { flags: 'w+' })
      // Run in the background
      const runApp = spawn(runConf.command, [], {
        cwd: configFolder,
        shell: true
      })
      runApp.stdout.pipe(logStream)
      runApp.stderr.pipe(logStream)

      if (waitForFinish) {
        logger.info({
          message: 'Waiting for command to finish',
          command: runConf.command
        })
        await new Promise((resolve, reject) => {
          runApp.on('error', function (err) {
            logger.error(`Application ${appIndex} failed with error`, err)
            logStream.end()
            showLogFileContent(logFile)
            reject(err)
          })
          runApp.on('close', function (code) {
            logger.info(`Application ${appIndex} exited with code ${code}`)
            logStream.end()
            showLogFileContent(logFile)
            if (code !== 0) {
              reject(
                new Error(`Application ${appIndex} exited with code ${code}`)
              )
            } else {
              resolve()
            }
          })
        })
      } else {
        runApp.on('error', function (err) {
          logger.error(`Application ${appIndex} failed with error`, err)
          logStream.end()
          showLogFileContent(logFile)
          throw err
        })
        runApp.on('close', function (code) {
          logger.info(`Application ${appIndex} exited with code ${code}`)
          logStream.end()
          showLogFileContent(logFile)
        })
      }

      return { runApp, logStream }
    } catch (error) {
      logger.error(`Failed to run application/job, command=${runConf.command}`)
      throw new Error(error)
    }
  } else {
    logger.debug('No command defined')
    return null
  }
}

function shutdownApplication(applicationProcess) {
  if (applicationProcess !== null) {
    logger.debug('Attempting to shut down application')
    if (applicationProcess && applicationProcess.runApp) {
      logger.debug('Killing application now')
      applicationProcess.runApp.kill()
    } else {
      logger.debug(`Application already stopped`)
    }
  } else {
    logger.debug('Application process is null, not attempting to shutdown')
  }
}

function isRunGenerationFirst(runConf) {
  const generateFirstTrueWithTest =
    typeof runConf.generateFirst !== 'undefined' &&
    runConf.generateFirst === 'true' &&
    runConf.test
  return (
    generateFirstTrueWithTest || typeof runConf.generateFirst === 'undefined'
  )
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
    await cleanAppDoneFiles(parsedConfig, sharedFolder)
    for (const [i, runConf] of parsedConfig.run.entries()) {
      writeToFile(
        configurationFolder,
        'application.conf',
        baseApplicationConf(),
        true
      )

      let applicationProcess
      let dataCatererRunId
      if (isRunGenerationFirst(runConf)) {
        logger.debug('Running data generation first')
        dataCatererRunId = runDataCaterer(
          runConf.test,
          i,
          configurationFolder,
          sharedFolder,
          config
        )
        await waitForDataGeneration(runConf.test, sharedFolder, i)
        logger.debug('Running application after data generation')
        applicationProcess = await runApplication(
          runConf,
          configFileDirectory,
          baseFolder,
          i,
          runConf.commandWaitForFinish
        )
        logger.debug('Notifying data caterer that application is done')
        writeToFile(sharedFolder, `app-${i}-done`, 'done', true)
      } else {
        logger.debug('Running application first')
        applicationProcess = await runApplication(
          runConf,
          configFileDirectory,
          baseFolder,
          i,
          runConf.commandWaitForFinish
        )
        logger.debug('Running data generation after application')
        writeToFile(sharedFolder, `app-${i}-done`, 'done', true)
        dataCatererRunId = runDataCaterer(
          runConf.test,
          i,
          configurationFolder,
          sharedFolder,
          config
        )
      }
      // Wait for data caterer container to finish
      await waitForContainerToFinish(`data-caterer-${i}`)
      // Check if file exists
      const testResultsFile = `${testResultsFolder}/${dataCatererRunId}/results.json`
      if (fs.existsSync(testResultsFile)) {
        testResults.push(JSON.parse(fs.readFileSync(testResultsFile, 'utf8')))
      } else {
        logger.warn(
          `Test result file does not exist, unable to show test results, file=${testResultsFile}`
        )
      }
      shutdownApplication(applicationProcess)
    }
    await cleanAppDoneFiles(parsedConfig, sharedFolder)
  }
  return testResults
}

function showTestResultSummary(testResults) {
  let numRecordsGenerated = -1 //Start at -1 since 1 record is always generated
  let numSuccessValidations = 0
  let numFailedValidations = 0
  let numValidations = 0

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
          logger.info('Failed validation details')
          for (const errorValidation of validation.errorValidations) {
            const baseLog = `Failed validation: validation=${JSON.stringify(errorValidation.validation)}, num-errors=${errorValidation.numErrors}`
            if (
              errorValidation.sampleErrorValues &&
              Object.entries(errorValidation.sampleErrorValues).length > 0
            ) {
              logger.info(
                `${baseLog}, sample-error-value=${JSON.stringify(errorValidation.sampleErrorValues[0])}`
              )
            } else {
              logger.info(baseLog)
            }
          }
        }
      }
    }
  }
  const validationSuccessRate = numSuccessValidations / numValidations
  logger.info('Test result summary')
  logger.info(`Number of records generated: ${numRecordsGenerated}`)
  logger.info(`Number of successful validations: ${numSuccessValidations}`)
  logger.info(`Number of failed validations: ${numFailedValidations}`)
  logger.info(`Number of validations: ${numValidations}`)
  logger.info(`Validation success rate: ${validationSuccessRate * 100}%`)
  if (process.env.GITHUB_ACTION) {
    core.setOutput('num_records_generated', numRecordsGenerated)
    core.setOutput('num_success_validations', numSuccessValidations)
    core.setOutput('num_failed_validations', numFailedValidations)
    core.setOutput('num_validations', numValidations)
    core.setOutput('validation_success_rate', validationSuccessRate)
    core.setOutput('full_results', testResults)
  }
}

/**
 * Given configuration file and insta-infra folder, do the following:
 * - Get services and initial data set up
 * - Configure and run insta-infra to startup services
 * - Run command for application startup
 * - Setup data-caterer configuration for data generation and validation
 * - Run data-caterer
 * - Return back summarised results
 * @param config Base configuration with config file path, insta-infra folder, execution folder, and docker token
 * @returns {Promise<*>} Resolves with test results
 */
async function runIntegrationTests(config) {
  if (config.instaInfraFolder.includes(' ')) {
    throw new Error(
      `Invalid insta-infra folder pathway=${config.instaInfraFolder}`
    )
  }
  const parsedConfig = parseConfigFile(config.applicationConfig)
  const applicationConfigDirectory = config.applicationConfig.startsWith('/')
    ? dirname(config.applicationConfig)
    : `${process.cwd()}/${dirname(config.applicationConfig)}`
  checkInstaInfraExists(config.instaInfraFolder)

  const { serviceNames, envVars } = extractServiceNamesAndEnv(
    parsedConfig,
    applicationConfigDirectory
  )

  if (serviceNames.length > 0) {
    runServices(config.instaInfraFolder, serviceNames, envVars)
  }

  const testResultsPromise = runTests(
    parsedConfig,
    applicationConfigDirectory,
    config
  )

  // eslint-disable-next-line github/no-then
  return testResultsPromise.then(testResults => {
    logger.info('Finished tests!')
    showTestResultSummary(testResults)
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
  runApplication
}
