const { execSync, exec } = require('child_process')
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
} = require('./config')
const { dirname, basename } = require('node:path')

const dataCatererVersion = '0.11.2'

/**
 * Check if service names are supported by insta-infra
 * @param instaInfraFolder Folder where insta-infra is checked out
 * @param serviceNames Array of services
 */
function checkValidServiceNames(instaInfraFolder, serviceNames) {
  core.debug('Checking insta-infra to see what services are supported')
  const supportedServices = execSync(`${instaInfraFolder}/run.sh -l`, {
    encoding: 'utf-8'
  })
  // eslint-disable-next-line github/array-foreach
  serviceNames.forEach(service => {
    if (!supportedServices.includes(service)) {
      throw new Error(
        `Found unsupported insta-infra service in configuration, service=${service}`
      )
    }
  })
}

/**
 * Parse the configuration file as YAML
 * @param configFile  YAML configuration file
 * @returns {*} Parsed YAML object
 */
function parseConfigFile(configFile) {
  core.debug(`Parsing config file=${configFile}`)
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
      core.debug(`Parsing config for service=${serviceName}`)
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
        core.debug(
          `No environment variables defined for service=${serviceName}`
        )
      }

      if (service.data) {
        // service.data could be a URL, directory or single file
        const downloadLinkRegex = new RegExp('^http[s?]://.*$')
        if (downloadLinkRegex.test(service.data)) {
          // TODO Then we need to download directory or file
          core.info('Downloading data is currently unsupported')
        } else if (service.data.startsWith('/')) {
          envVars[`${envServiceName}_DATA`] = service.data
        } else {
          // Can be a relative directory from perspective of config YAML
          const dataPath = `${configFileDirectory}/${service.data}`
          core.debug(`Using env var: ${envServiceName}_DATA -> ${dataPath}`)
          envVars[`${envServiceName}_DATA`] = dataPath
        }
      } else {
        core.debug(`No custom data at startup used for service=${serviceName}`)
      }
    }
  } else {
    core.debug(`No services defined`)
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
    core.debug(`Found corresponding generation task, service=${service}`)
    return service
  } else {
    throw new Error(
      `Relationship defined without corresponding generation task, relationship=${sptRelationship[0]}`
    )
  }
}

function writeToFile(folder, fileName, content, isPlanText) {
  fs.mkdirSync(folder, { recursive: true })
  const fileContent = isPlanText ? content : yaml.dump(content)
  core.debug(`Creating file, file-path=${folder}/${fileName}`)
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
    core.debug('Checking for data generation configurations')
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

    // Need to add data gen task to notify this process that data caterer is one generating data and application can run
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
    core.debug('No data generation tasks defined')
  }
}

function extractRelationships(
  testConfig,
  generationTaskToServiceMapping,
  currentPlan
) {
  if (testConfig.relationship) {
    core.debug('Checking for data generation relationship configurations')
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
    core.debug('No relationships defined')
  }
}

function extractDataValidations(testConfig, appIndex, currValidations) {
  core.debug('Checking for data validation configurations')
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
    core.debug('No data validations defined')
  }
}

function extractDataCatererEnv(testConfig) {
  return testConfig.env ? testConfig.env : {}
}

function runDataCaterer(
  testConfig,
  appIndex,
  configurationFolder,
  sharedFolder
) {
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
  for (const currTask of currentTasks) {
    writeToFile(
      `${configurationFolder}/task`,
      `${currTask.name}.yaml`,
      currTask
    )
  }
  writeToFile(
    `${configurationFolder}/validation`,
    'my-validations.yaml',
    currValidations
  )
  const dockerRunCommand = createDataCatererDockerRunCommand(
    true,
    dataCatererVersion,
    sharedFolder,
    configurationFolder,
    'my-plan.yaml',
    dataCatererEnv
  )
  core.debug(
    `Running docker command for data-caterer, command=${dockerRunCommand}`
  )
  execSync(dockerRunCommand)
  // core.debug(`Exit code: ${runDocker}`)
}

function cleanAppDoneFiles(parsedConfig, sharedFolder) {
  // Clean up 'app-*-done' files in shared directory
  core.debug('Removing files relating to notifying the application is done')
  for (const [i] of parsedConfig.run.entries()) {
    try {
      fs.unlinkSync(`${sharedFolder}/app-${i}-done`)
    } catch (error) {
      core.warning(error)
    }
  }
}

async function checkExistsWithTimeout(filePath, timeout = 60000) {
  await new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      watcher.close()
      reject(
        new Error('File did not exists and was not created during the timeout.')
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
    setTimeout(resolve, 500)
  })
}

async function waitForDataGeneration(sharedFolder) {
  // For applications/jobs that rely on data to be generated first before running, we wait until data caterer has
  // created a csv file to notify us that it has completed generating data
  const notifyFilePath = `${sharedFolder}/notify/data-gen-done`
  await checkExistsWithTimeout(notifyFilePath)
  core.debug('Removing data generation done folder')
  try {
    fs.rmSync(`${sharedFolder}/notify/data-gen-done`, {
      recursive: true,
      force: true
    })
  } catch (error) {
    core.warning(error)
  }
}

async function runTests(parsedConfig, configFileDirectory, baseFolder) {
  let testResult = ''
  const configurationFolder = `${baseFolder}/conf`
  const sharedFolder = `${baseFolder}/shared`
  fs.mkdirSync(configurationFolder, { recursive: true })
  fs.mkdirSync(sharedFolder, { recursive: true })

  if (parsedConfig.run) {
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
      if (
        (runConf.generateFirst &&
          runConf.generateFirst === 'true' &&
          runConf.test) ||
        !runConf.generateFirst
      ) {
        core.info('Running data caterer')
        testResult = runDataCaterer(
          runConf.test,
          i,
          configurationFolder,
          sharedFolder
        )
        await waitForDataGeneration(sharedFolder, i)
        core.info('Running application/job')
        execSync(runConf.command, { cwd: configFileDirectory })
        writeToFile(sharedFolder, `app-${i}-done`, 'done', true)
      } else {
        core.info('Running application/job')
        execSync(runConf.command, { cwd: configFileDirectory })
        writeToFile(sharedFolder, `app-${i}-done`, 'done', true)
        core.info('Running data caterer')
        testResult = runDataCaterer(
          runConf.test,
          i,
          configurationFolder,
          sharedFolder
        )
      }
    }
    cleanAppDoneFiles(parsedConfig, sharedFolder)
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
 * @param applicationConfig Base configuration file defining requirements for integration tests
 * @param instaInfraFolder  Folder where insta-infra is checked out
 * @param baseFolder Folder where execution files get saved
 * @returns {string}  Results of data-caterer
 */
function runIntegrationTests(applicationConfig, instaInfraFolder, baseFolder) {
  if (instaInfraFolder.includes(' ')) {
    throw new Error(`Invalid insta-infra folder pathway=${instaInfraFolder}`)
  }
  const parsedConfig = parseConfigFile(applicationConfig)
  const applicationConfigDirectory = applicationConfig.startsWith('/')
    ? dirname(applicationConfig)
    : `${process.cwd()}/${dirname(applicationConfig)}`

  const { serviceNames, envVars } = extractServiceNamesAndEnv(
    parsedConfig,
    applicationConfigDirectory
  )

  if (serviceNames.length > 0) {
    checkValidServiceNames(instaInfraFolder, serviceNames)
    const serviceNamesInstaInfra = serviceNames.join(' ')
    core.info(`Running services=${serviceNamesInstaInfra}`)
    for (const env of Object.entries(envVars)) {
      process.env[env[0]] = env[1]
    }
    execSync(`./run.sh ${serviceNamesInstaInfra}`, {
      cwd: instaInfraFolder
    })
  }

  const testResults = runTests(
    parsedConfig,
    applicationConfigDirectory,
    baseFolder
  )
  core.info('Finished tests!')
  return testResults
}

module.exports = { runIntegrationTests }
