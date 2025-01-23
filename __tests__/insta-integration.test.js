const {
  extractDataGenerationTasks,
  extractServiceFromGeneration,
  extractDataValidations,
  extractRelationships,
  extractServiceNamesAndEnv,
  shutdownApplication,
  runApplication
} = require('../src/insta-integration')
const logger = require('../src/util/log')
const { expect } = require('@jest/globals')

jest.mock('../src/util/log')

describe('extractDataGenerationTasks', () => {
  it('should not modify currentPlan or currentTasks when testConfig has no generation', () => {
    const testConfig = {}
    const currentPlan = { tasks: [] }
    const currentTasks = []
    const generationTaskToServiceMapping = {}

    extractDataGenerationTasks(
      testConfig,
      currentPlan,
      currentTasks,
      generationTaskToServiceMapping
    )

    expect(currentPlan.tasks).toEqual([])
    expect(currentTasks).toEqual([])
    expect(generationTaskToServiceMapping).toEqual({})
  })

  it('should add tasks for each data source generation', () => {
    const testConfig = {
      generation: {
        dataSource1: [{ name: 'task1' }],
        dataSource2: [{ name: 'task2' }]
      }
    }
    const currentPlan = { tasks: [] }
    const currentTasks = []
    const generationTaskToServiceMapping = {}

    extractDataGenerationTasks(
      testConfig,
      currentPlan,
      currentTasks,
      generationTaskToServiceMapping
    )

    expect(currentPlan.tasks).toEqual([
      { name: 'dataSource1-task', dataSourceName: 'dataSource1' },
      { name: 'dataSource2-task', dataSourceName: 'dataSource2' },
      { name: 'csv-task', dataSourceName: 'csv' }
    ])
    expect(currentTasks).toHaveLength(3)
    expect(generationTaskToServiceMapping).toEqual({
      task1: 'dataSource1',
      task2: 'dataSource2'
    })
  })

  it('should handle schema fields with oneOf options', () => {
    const testConfig = {
      generation: {
        dataSource: [
          {
            name: 'task',
            fields: [
              {
                name: 'field1',
                options: { oneOf: ['option1', 'option2'] }
              }
            ]
          }
        ]
      }
    }
    const currentPlan = { tasks: [] }
    const currentTasks = []
    const generationTaskToServiceMapping = {}

    extractDataGenerationTasks(
      testConfig,
      currentPlan,
      currentTasks,
      generationTaskToServiceMapping
    )

    expect(currentTasks[0].steps[0].fields[0].options).toEqual({
      oneOf: ['option1', 'option2']
    })
  })

  it('should handle schema fields with regex options', () => {
    const testConfig = {
      generation: {
        dataSource: [
          {
            name: 'task',
            fields: [
              {
                name: 'field1',
                options: { regex: '[A-Z]{3}' }
              }
            ]
          }
        ]
      }
    }
    const currentPlan = { tasks: [] }
    const currentTasks = []
    const generationTaskToServiceMapping = {}

    extractDataGenerationTasks(
      testConfig,
      currentPlan,
      currentTasks,
      generationTaskToServiceMapping
    )

    expect(currentTasks[0].steps[0].fields[0].options).toEqual({
      regex: '[A-Z]{3}'
    })
  })

  it('should add notifyGenerationDoneTask for csv tasks', () => {
    const testConfig = {
      generation: {
        csv: [{ name: 'csvTask' }]
      }
    }
    const currentPlan = { tasks: [] }
    const currentTasks = []
    const generationTaskToServiceMapping = {}

    extractDataGenerationTasks(
      testConfig,
      currentPlan,
      currentTasks,
      generationTaskToServiceMapping
    )

    expect(currentTasks[0].steps).toHaveLength(2)
    expect(currentTasks[0].steps[1]).toEqual(
      expect.objectContaining({
        name: 'data-gen-done-step',
        count: {
          records: 1
        },
        options: {
          path: '/opt/app/shared/notify/data-gen-done'
        },
        fields: [{ name: 'account_id' }]
      })
    )
  })
})

describe('extractServiceFromGeneration', () => {
  it('should return the correct service when a matching generation task exists', () => {
    const testConfig = {}
    const sptRelationship = ['task1']
    const generationTaskToServiceMapping = { task1: 'dataSource1' }

    const result = extractServiceFromGeneration(
      testConfig,
      sptRelationship,
      generationTaskToServiceMapping
    )

    expect(result).toBe('dataSource1')
  })

  it('should throw an error when no matching generation task exists', () => {
    const testConfig = {}
    const sptRelationship = ['nonExistentTask']
    const generationTaskToServiceMapping = { task1: 'dataSource1' }

    expect(() => {
      extractServiceFromGeneration(
        testConfig,
        sptRelationship,
        generationTaskToServiceMapping
      )
    }).toThrow(
      'Relationship defined without corresponding generation task, relationship=nonExistentTask'
    )
  })

  it('should handle multiple relationships and return the correct service', () => {
    const testConfig = {}
    const sptRelationship = ['task2', 'task3']
    const generationTaskToServiceMapping = {
      task1: 'dataSource1',
      task2: 'dataSource2',
      task3: 'dataSource3'
    }

    const result = extractServiceFromGeneration(
      testConfig,
      sptRelationship,
      generationTaskToServiceMapping
    )

    expect(result).toBe('dataSource2')
  })

  it('should work with an empty testConfig', () => {
    const testConfig = {}
    const sptRelationship = ['task1']
    const generationTaskToServiceMapping = { task1: 'dataSource1' }

    const result = extractServiceFromGeneration(
      testConfig,
      sptRelationship,
      generationTaskToServiceMapping
    )

    expect(result).toBe('dataSource1')
  })

  it('should throw an error when sptRelationship is empty', () => {
    const testConfig = {}
    const sptRelationship = []
    const generationTaskToServiceMapping = { task1: 'dataSource1' }

    expect(() => {
      extractServiceFromGeneration(
        testConfig,
        sptRelationship,
        generationTaskToServiceMapping
      )
    }).toThrow(
      'Relationship defined without corresponding generation task, relationship=undefined'
    )
  })
})

describe('extractDataValidations', () => {
  it('should add validations to currValidations when testConfig has validation', () => {
    const testConfig = {
      validation: {
        service1: [{ name: 'validation1' }],
        service2: [{ name: 'validation2' }]
      }
    }
    const appIndex = 1
    const currValidations = { dataSources: {} }

    extractDataValidations(testConfig, appIndex, currValidations)

    expect(currValidations.dataSources).toEqual({
      service1: [
        {
          name: 'validation1',
          waitCondition: { path: '/opt/app/shared/app-1-done' }
        }
      ],
      service2: [
        {
          name: 'validation2',
          waitCondition: { path: '/opt/app/shared/app-1-done' }
        }
      ]
    })
  })

  it('should not modify currValidations when testConfig has no validation', () => {
    const testConfig = {}
    const appIndex = 1
    const currValidations = { dataSources: {} }

    extractDataValidations(testConfig, appIndex, currValidations)

    expect(currValidations.dataSources).toEqual({})
  })

  it('should not add waitCondition if it already exists', () => {
    const testConfig = {
      validation: {
        service1: [
          { name: 'validation1', waitCondition: { path: '/custom/path' } }
        ]
      }
    }
    const appIndex = 1
    const currValidations = { dataSources: {} }

    extractDataValidations(testConfig, appIndex, currValidations)

    expect(currValidations.dataSources).toEqual({
      service1: [
        { name: 'validation1', waitCondition: { path: '/custom/path' } }
      ]
    })
  })

  it('should handle multiple validations for a single service', () => {
    const testConfig = {
      validation: {
        service1: [
          { name: 'validation1' },
          { name: 'validation2', waitCondition: { path: '/custom/path' } }
        ]
      }
    }
    const appIndex = 1
    const currValidations = { dataSources: {} }

    extractDataValidations(testConfig, appIndex, currValidations)

    expect(currValidations.dataSources).toEqual({
      service1: [
        {
          name: 'validation1',
          waitCondition: { path: '/opt/app/shared/app-1-done' }
        },
        { name: 'validation2', waitCondition: { path: '/custom/path' } }
      ]
    })
  })

  it('should handle empty validation arrays', () => {
    const testConfig = {
      validation: {
        service1: []
      }
    }
    const appIndex = 1
    const currValidations = { dataSources: {} }

    extractDataValidations(testConfig, appIndex, currValidations)

    expect(currValidations.dataSources).toEqual({
      service1: []
    })
  })
})

describe('extractRelationships', () => {
  let testConfig
  let generationTaskToServiceMapping
  let currentPlan

  beforeEach(() => {
    testConfig = {}
    generationTaskToServiceMapping = {}
    currentPlan = { sinkOptions: { foreignKeys: [] } }
  })

  it('should not modify currentPlan when testConfig has no relationship', () => {
    extractRelationships(
      testConfig,
      generationTaskToServiceMapping,
      currentPlan
    )
    expect(currentPlan.sinkOptions.foreignKeys).toEqual([])
  })

  it('should throw an error for invalid relationship pattern', () => {
    testConfig = {
      relationship: {
        invalidPattern: ['child.field']
      },
      generation: {}
    }
    expect(() => {
      extractRelationships(
        testConfig,
        generationTaskToServiceMapping,
        currentPlan
      )
    }).toThrow(
      'Relationship should follow pattern: <generation name>.<field name>'
    )
  })

  it('should throw an error when relationship is defined without generation', () => {
    testConfig = {
      relationship: {
        'service.field': ['child.field']
      }
    }
    expect(() => {
      extractRelationships(
        testConfig,
        generationTaskToServiceMapping,
        currentPlan
      )
    }).toThrow('Cannot define relationship without any data generation defined')
  })

  it('should correctly extract relationships and update currentPlan', () => {
    testConfig = {
      relationship: {
        'parentTask.id': ['child1Task.parent_id', 'child2Task.parent_id']
      },
      generation: {
        parent: [{ name: 'parentTask' }],
        child1: [{ name: 'child1Task' }],
        child2: [{ name: 'child2Task' }]
      }
    }
    generationTaskToServiceMapping = {
      parentTask: 'parent',
      child1Task: 'child1',
      child2Task: 'child2'
    }

    extractRelationships(
      testConfig,
      generationTaskToServiceMapping,
      currentPlan
    )

    expect(currentPlan.sinkOptions.foreignKeys).toEqual([
      {
        source: {
          dataSource: 'parent',
          step: 'parentTask',
          fields: ['id']
        },
        generate: [
          {
            dataSource: 'child1',
            step: 'child1Task',
            fields: ['parent_id']
          },
          {
            dataSource: 'child2',
            step: 'child2Task',
            fields: ['parent_id']
          }
        ]
      }
    ])
  })

  it('should handle multiple relationships', () => {
    testConfig = {
      relationship: {
        'userTask.id': ['orderTask.user_id'],
        'productTask.id': ['orderTask.product_id']
      },
      generation: {
        user: [{ name: 'userTask' }],
        product: [{ name: 'productTask' }],
        order: [{ name: 'orderTask' }]
      }
    }
    generationTaskToServiceMapping = {
      userTask: 'user',
      productTask: 'product',
      orderTask: 'order'
    }

    extractRelationships(
      testConfig,
      generationTaskToServiceMapping,
      currentPlan
    )

    expect(currentPlan.sinkOptions.foreignKeys).toEqual([
      {
        source: {
          dataSource: 'user',
          step: 'userTask',
          fields: ['id']
        },
        generate: [
          {
            dataSource: 'order',
            step: 'orderTask',
            fields: ['user_id']
          }
        ]
      },
      {
        source: {
          dataSource: 'product',
          step: 'productTask',
          fields: ['id']
        },
        generate: [
          {
            dataSource: 'order',
            step: 'orderTask',
            fields: ['product_id']
          }
        ]
      }
    ])
  })
})

describe('extractServiceNamesAndEnv', () => {
  it('should extract service names and environment variables correctly', () => {
    const parsedConfig = {
      services: [
        {
          name: 'service1:1.0.0',
          env: {
            KEY1: 'value1',
            KEY2: 'value2'
          },
          data: '/path/to/data'
        },
        {
          name: 'service2',
          env: {
            KEY3: 'value3'
          }
        }
      ]
    }
    const configFileDirectory = '/config'

    const result = extractServiceNamesAndEnv(parsedConfig, configFileDirectory)

    expect(result.serviceNames).toEqual(['service1', 'service2'])
    expect(result.envVars).toEqual({
      SERVICE1_VERSION: '1.0.0',
      KEY1: 'value1',
      KEY2: 'value2',
      SERVICE1_DATA: '/path/to/data',
      KEY3: 'value3'
    })
  })

  it('should handle relative data paths correctly', () => {
    const parsedConfig = {
      services: [
        {
          name: 'service1',
          data: 'relative/path'
        }
      ]
    }
    const configFileDirectory = '/config'

    const result = extractServiceNamesAndEnv(parsedConfig, configFileDirectory)

    expect(result.envVars).toEqual({
      SERVICE1_DATA: '/config/relative/path'
    })
  })

  it('should handle services without env or data', () => {
    const parsedConfig = {
      services: [
        {
          name: 'service1'
        },
        {
          name: 'service2'
        }
      ]
    }
    const configFileDirectory = '/config'

    const result = extractServiceNamesAndEnv(parsedConfig, configFileDirectory)

    expect(result.serviceNames).toEqual(['service1', 'service2'])
    expect(result.envVars).toEqual({})
  })

  it('should return empty arrays when no services are defined', () => {
    const parsedConfig = {}
    const configFileDirectory = '/config'

    const result = extractServiceNamesAndEnv(parsedConfig, configFileDirectory)

    expect(result.serviceNames).toEqual([])
    expect(result.envVars).toEqual({})
  })

  it('should handle service names with hyphens', () => {
    const parsedConfig = {
      services: [
        {
          name: 'service-with-hyphens:2.0.0',
          env: {
            KEY: 'value'
          }
        }
      ]
    }
    const configFileDirectory = '/config'

    const result = extractServiceNamesAndEnv(parsedConfig, configFileDirectory)

    expect(result.serviceNames).toEqual(['service-with-hyphens'])
    expect(result.envVars).toEqual({
      SERVICE_WITH_HYPHENS_VERSION: '2.0.0',
      KEY: 'value'
    })
  })

  it('handles services with no environment variables or data', () => {
    const parsedConfig = {
      services: [{ name: 'service1' }, { name: 'service2' }]
    }
    const configFileDirectory = '/config'
    const result = extractServiceNamesAndEnv(parsedConfig, configFileDirectory)
    expect(result.serviceNames).toEqual(['service1', 'service2'])
    expect(result.envVars).toEqual({})
  })

  it('handles services with environment variables and data', () => {
    const parsedConfig = {
      services: [
        {
          name: 'service1:1.0.0',
          env: { KEY1: 'value1' },
          data: '/path/to/data'
        }
      ]
    }
    const configFileDirectory = '/config'
    const result = extractServiceNamesAndEnv(parsedConfig, configFileDirectory)
    expect(result.serviceNames).toEqual(['service1'])
    expect(result.envVars).toEqual({
      SERVICE1_VERSION: '1.0.0',
      KEY1: 'value1',
      SERVICE1_DATA: '/path/to/data'
    })
  })

  it('handles relative data paths correctly', () => {
    const parsedConfig = {
      services: [
        {
          name: 'service1',
          data: 'relative/path'
        }
      ]
    }
    const configFileDirectory = '/config'
    const result = extractServiceNamesAndEnv(parsedConfig, configFileDirectory)
    expect(result.envVars).toEqual({
      SERVICE1_DATA: '/config/relative/path'
    })
  })

  it('handles service names with hyphens', () => {
    const parsedConfig = {
      services: [
        {
          name: 'service-with-hyphens:2.0.0',
          env: { KEY: 'value' }
        }
      ]
    }
    const configFileDirectory = '/config'
    const result = extractServiceNamesAndEnv(parsedConfig, configFileDirectory)
    expect(result.serviceNames).toEqual(['service-with-hyphens'])
    expect(result.envVars).toEqual({
      SERVICE_WITH_HYPHENS_VERSION: '2.0.0',
      KEY: 'value'
    })
  })
})

describe('runApplication', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.spyOn(logger, 'info')
    jest.spyOn(logger, 'debug')
    jest.spyOn(logger, 'error')
  })

  it('runs the application and waits for it to finish', async () => {
    const runConf = {
      command: 'echo "Hello World"',
      commandWaitForFinish: true
    }
    const configFolder = '/tmp/insta-integration-test/config'
    const baseFolder = '/tmp/insta-integration-test/base'
    const appIndex = 1
    const result = await runApplication(
      runConf,
      configFolder,
      baseFolder,
      appIndex,
      true
    )
    expect(result).not.toBeNull()
    expect(logger.info).toHaveBeenCalledWith('Running application/job')
    expect(logger.info).toHaveBeenCalledWith('Application 1 exited with code 0')
  })

  it('runs the application without waiting for it to finish', async () => {
    const runConf = {
      command: 'echo "Hello World"',
      commandWaitForFinish: false
    }
    const configFolder = '/tmp/insta-integration-test/config'
    const baseFolder = '/tmp/insta-integration-test/base'
    const appIndex = 1
    const result = await runApplication(
      runConf,
      configFolder,
      baseFolder,
      appIndex,
      false
    )
    expect(result).not.toBeNull()
    expect(logger.info).toHaveBeenCalledWith('Running application/job')
  })

  it('throws an error if the command fails', async () => {
    const runConf = { command: 'invalid_command' }
    const configFolder = '/tmp/insta-integration-test/config'
    const baseFolder = '/tmp/insta-integration-test/base'
    const appIndex = 1
    await expect(
      runApplication(runConf, configFolder, baseFolder, appIndex, true)
    ).rejects.toThrow('Application 1 exited with code 127')
    expect(logger.error).toHaveBeenCalledWith({
      command: 'invalid_command',
      message: 'Failed to run application/job'
    })
  })

  it('returns null if no command is defined', async () => {
    const runConf = {}
    const configFolder = '/tmp/insta-integration-test/config'
    const baseFolder = '/tmp/insta-integration-test/base'
    const appIndex = 1
    const result = await runApplication(
      runConf,
      configFolder,
      baseFolder,
      appIndex,
      true
    )
    expect(result).toBeNull()
    expect(logger.debug).toHaveBeenCalledWith('No command defined')
  })
})

describe('shutdownApplication', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.spyOn(logger, 'debug')
  })

  it('shuts down the application if it is running', () => {
    const applicationProcess = { runApp: { kill: jest.fn() } }
    shutdownApplication(applicationProcess)
    expect(applicationProcess.runApp.kill).toHaveBeenCalled()
    expect(logger.debug).toHaveBeenCalledWith('Killing application now')
  })

  it('does not attempt to shut down if the application is already stopped', () => {
    const applicationProcess = { runApp: null }
    shutdownApplication(applicationProcess)
    expect(logger.debug).toHaveBeenCalledWith('Application already stopped')
  })

  it('does not attempt to shut down if the application process is null', () => {
    const applicationProcess = null
    shutdownApplication(applicationProcess)
    expect(logger.debug).toHaveBeenCalledWith(
      'Application process is null, not attempting to shutdown'
    )
  })
})
