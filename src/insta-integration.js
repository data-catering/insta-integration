const { execSync, exec, spawn } = require('child_process')
const core = require('@actions/core')
const yaml = require('js-yaml')
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
  dockerLogin,
  waitForContainerToFinish
} = require('./util/docker')
const { checkInstaInfraExists, runServices } = require('./util/insta-infra')
const logger = require('./util/log')

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
    throw error
  }
}

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
    logger.debug(`No services defined`)
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

function writeToFile(folder, fileName, content, isPlanText) {
  if (!fs.existsSync(folder)) {
    logger.debug(`Creating folder since it does not exist, folder=${folder}`)
    fs.mkdirSync(folder, { recursive: true })
  }
  const fileContent = isPlanText ? content : yaml.dump(content)
  logger.debug(`Creating file, file-path=${folder}/${fileName}`)
  fs.writeFileSync(`${folder}/${fileName}`, fileContent, err => {
    if (err) {
      throw err
    }
  })
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
        task.steps.push(generationTask)
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
          'Relationship should follow pattern: <generation name>.<field name>'
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
          const childServiceName = extractServiceFromGeneration(
            testConfig,
            childRel.split('.'),
            generationTaskToServiceMapping
          )
          childrenRelationshipServiceNames.push(
            `${childServiceName}.${childRel}`
          )
        }
        currentPlan.sinkOptions.foreignKeys.push([
          `${baseServiceName}.${rel[0]}`,
          childrenRelationshipServiceNames,
          []
        ])
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

function extractDataCatererEnv(testConfig) {
  return testConfig.env ? testConfig.env : {}
}

function runDataCaterer(
  testConfig,
  appIndex,
  configurationFolder,
  sharedFolder,
  dataCatererVersion,
  dockerToken
) {
  logger.info('Reading data generation and validation configurations')
  // Use template plan and task YAML files
  // Also, template application.conf
  const currentPlan = basePlan()
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
    !dockerToken, //If docker token is defined, set to false
    dataCatererVersion,
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
}

async function cleanAppDoneFiles(parsedConfig, sharedFolder) {
  // Clean up 'app-*-done' files in shared directory
  await new Promise(resolve => {
    setTimeout(resolve, 4000)
  })
  logger.debug('Removing files relating to notifying the application is done')
  for (const [i] of parsedConfig.run.entries()) {
    try {
      fs.unlinkSync(`${sharedFolder}/app-${i}-done`)
    } catch (error) {
      logger.warn(error)
    }
  }
}

async function checkExistsWithTimeout(filePath, appIndex, timeout = 60000) {
  await new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      watcher.close()
      logger.info('Checking data-caterer logs')
      logger.info(execSync(`docker logs data-caterer-${appIndex}`).toString())
      reject(
        new Error(
          `File did not exist and was not created during the timeout, file=${filePath}`
        )
      )
    }, timeout)

    fs.access(filePath, fs.constants.R_OK, function (err) {
      if (!err) {
        clearTimeout(timer)
        watcher.close()
        resolve()
      }
    })

    const dir = dirname(filePath)
    const currBasename = basename(filePath)
    const watcher = fs.watch(dir, function (eventType, filename) {
      if (eventType === 'rename' && filename === currBasename) {
        clearTimeout(timer)
        watcher.close()
        resolve()
      }
    })
  })
  await new Promise(resolve => {
    setTimeout(resolve, 1000)
  })
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
    await checkExistsWithTimeout(notifyFilePath, appIndex)
    logger.debug('Removing data generation done folder')
    try {
      fs.rmSync(notifyFilePath, {
        recursive: true,
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
  logger.info('Running application/job')
  setEnvironmentVariables(runConf)
  const logsFolder = `${baseFolder}/logs`
  if (!fs.existsSync(logsFolder)) {
    fs.mkdirSync(logsFolder)
  }
  try {
    const logStream = fs.createWriteStream(
      `${logsFolder}/app_output_${appIndex}.log`,
      { flags: 'w+' }
    )
    // Run in the background
    const runApp = spawn(runConf.command, [], {
      cwd: configFolder,
      shell: true
    })
    runApp.stdout.pipe(logStream)
    runApp.stderr.pipe(logStream)

    if (waitForFinish) {
      logger.info('Waiting for command to finish')
      await new Promise(resolve => {
        runApp.on('close', function (code) {
          logger.info(`Application ${appIndex} exited with code ${code}`)
          resolve()
        })
      })
    } else {
      runApp.on('close', function (code) {
        logger.info(`Application ${appIndex} exited with code ${code}`)
      })
    }
    runApp.on('error', function (err) {
      logger.error(`Application ${appIndex} failed with error`)
      logger.error(err)
      throw new Error(err)
    })
    return { runApp, logStream }
  } catch (error) {
    logger.error(`Failed to run application/job, command=${runConf.command}`)
    throw new Error(error)
  }
}

function shutdownApplication(applicationProcess) {
  logger.debug('Attempting to close log stream')
  applicationProcess.logStream.close()
  logger.debug(`Attempting to shut down application`)
  if (applicationProcess && applicationProcess.runApp) {
    applicationProcess.runApp.kill()
  } else {
    logger.debug(`Application already stopped`)
  }
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

async function runTests(
  parsedConfig,
  configFileDirectory,
  baseFolder,
  dataCatererVersion,
  dockerToken
) {
  const configurationFolder = `${baseFolder}/conf`
  const sharedFolder = `${baseFolder}/shared`
  const testResultsFolder = `${configurationFolder}/report`
  const testResultsFile = `${testResultsFolder}/results.json`
  const testResults = []
  createFolders(configurationFolder, sharedFolder, testResultsFolder)
  dockerLogin(dockerToken)
  setEnvironmentVariables(parsedConfig)

  if (parsedConfig.run) {
    await cleanAppDoneFiles(parsedConfig, sharedFolder)
    for (const [i, runConf] of parsedConfig.run.entries()) {
      // Need to know whether to run application first or data generation
      // For example, REST API application should run first then data generation
      // For job, data generation first, then run job
      // By default, data generation runs first since most data sinks are databases/files
      //
      // Command could be relative to the config folder
      // Have to cleanse the command
      // Could limit options in the `run` section to `script name, java, docker`
      writeToFile(
        configurationFolder,
        'application.conf',
        baseApplicationConf(),
        true
      )

      let applicationProcess
      if (
        (typeof runConf.generateFirst !== 'undefined' &&
          runConf.generateFirst === 'true' &&
          runConf.test) ||
        typeof runConf.generateFirst === 'undefined'
      ) {
        runDataCaterer(
          runConf.test,
          i,
          configurationFolder,
          sharedFolder,
          dataCatererVersion,
          dockerToken
        )
        await waitForDataGeneration(runConf.test, sharedFolder, i)
        applicationProcess = await runApplication(
          runConf,
          configFileDirectory,
          baseFolder,
          i,
          runConf.commandWaitForFinish
        )
        writeToFile(sharedFolder, `app-${i}-done`, 'done', true)
      } else {
        applicationProcess = await runApplication(
          runConf,
          configFileDirectory,
          baseFolder,
          i,
          runConf.commandWaitForFinish
        )
        writeToFile(sharedFolder, `app-${i}-done`, 'done', true)
        runDataCaterer(
          runConf.test,
          i,
          configurationFolder,
          sharedFolder,
          dataCatererVersion,
          dockerToken
        )
      }
      // Wait for data caterer container to finish
      await waitForContainerToFinish(`data-caterer-${i}`)
      // Check if file exists
      if (fs.existsSync(testResultsFile)) {
        testResults.push(JSON.parse(fs.readFileSync(testResultsFile, 'utf8')))
        // Move results to separate file
        fs.renameSync(testResultsFile, `${testResultsFolder}/results-${i}.json`)
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
  logger.info(`Number of records generation: ${numRecordsGenerated}`)
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
 * @returns {string}  Results of data-caterer
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

  const testResults = await runTests(
    parsedConfig,
    applicationConfigDirectory,
    config.baseFolder,
    config.dataCatererVersion,
    config.dockerToken
  )

  logger.info('Finished tests!')
  showTestResultSummary(testResults)

  return testResults
}

module.exports = { runIntegrationTests }
