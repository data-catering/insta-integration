const { createDataCatererDockerRunCommand } = require('../../src/util/config')
const { expect } = require('@jest/globals')

describe('createDataCatererDockerRunCommand', () => {
  it('should create a basic docker run command', () => {
    const result = createDataCatererDockerRunCommand(
      '1.0.0',
      '/shared',
      '/conf',
      'test-plan',
      {},
      [],
      1
    )
    expect(result).toContain('docker run -d')
    expect(result).toContain('--network insta-infra_default')
    expect(result).toContain('--name data-caterer-1')
    expect(result).toContain('-v /conf:/opt/app/custom')
    expect(result).toContain('-v /shared:/opt/app/shared')
    expect(result).toContain(
      '-e APPLICATION_CONFIG_PATH=/opt/app/custom/application.conf'
    )
    expect(result).toContain('-e PLAN_FILE_PATH=/opt/app/custom/plan/test-plan')
    expect(result).toContain('datacatering/data-caterer:1.0.0')
  })

  it('should include environment variables', () => {
    const envVars = { VAR1: 'value1', VAR2: 'value2' }
    const result = createDataCatererDockerRunCommand(
      '1.0.0',
      '/shared',
      '/conf',
      'test-plan',
      envVars,
      [],
      1
    )
    expect(result).toContain('-e VAR1=value1')
    expect(result).toContain('-e VAR2=value2')
  })

  it('should include volume mounts', () => {
    const volumeMounts = ['/host1:/container1', '/host2:/container2']
    const result = createDataCatererDockerRunCommand(
      '1.0.0',
      '/shared',
      '/conf',
      'test-plan',
      {},
      volumeMounts,
      1
    )
    expect(result).toContain('-v /host1:/container1')
    expect(result).toContain('-v /host2:/container2')
  })

  it('should include user when uid is 1001', () => {
    const originalGetuid = process.getuid
    const originalGetgid = process.getgid
    process.getuid = jest.fn(() => 1001)
    process.getgid = jest.fn(() => 1001)

    const result = createDataCatererDockerRunCommand(
      '1.0.0',
      '/shared',
      '/conf',
      'test-plan',
      {},
      [],
      1
    )
    expect(result).toContain('--user 1001:1001')

    process.getuid = originalGetuid
    process.getgid = originalGetgid
  })

  it('should not include user when uid is not 1001', () => {
    const originalGetuid = process.getuid
    process.getuid = jest.fn(() => 1000)

    const result = createDataCatererDockerRunCommand(
      '1.0.0',
      '/shared',
      '/conf',
      'test-plan',
      {},
      [],
      1
    )
    expect(result).not.toContain('--user')

    process.getuid = originalGetuid
  })

  it('should use correct app index in container name', () => {
    const result = createDataCatererDockerRunCommand(
      '1.0.0',
      '/shared',
      '/conf',
      'test-plan',
      {},
      [],
      3
    )
    expect(result).toContain('--name data-caterer-3')
  })
})

describe('notifyGenerationDoneTask', () => {
  const { notifyGenerationDoneTask } = require('../../src/util/config')

  it('should return an object with the correct structure', () => {
    const result = notifyGenerationDoneTask()
    expect(result).toEqual({
      count: { records: 1 },
      fields: [{ name: 'account_id' }],
      name: 'data-gen-done-step',
      options: { path: '/opt/app/shared/notify/data-gen-done' }
    })
  })

  it('should have a count of 1 record', () => {
    const result = notifyGenerationDoneTask()
    expect(result.count.records).toBe(1)
  })

  it('should have a single field named account_id', () => {
    const result = notifyGenerationDoneTask()
    expect(result.fields).toHaveLength(1)
    expect(result.fields[0].name).toBe('account_id')
  })

  it('should have the correct name', () => {
    const result = notifyGenerationDoneTask()
    expect(result.name).toBe('data-gen-done-step')
  })

  it('should have the correct options path', () => {
    const result = notifyGenerationDoneTask()
    expect(result.options.path).toBe('/opt/app/shared/notify/data-gen-done')
  })

  it('should return a new object each time it is called', () => {
    const result1 = notifyGenerationDoneTask()
    const result2 = notifyGenerationDoneTask()
    expect(result1).not.toBe(result2)
    expect(result1).toEqual(result2)
  })
})

describe('baseValidation', () => {
  const { baseValidation } = require('../../src/util/config')

  it('should return an object with the correct structure', () => {
    const result = baseValidation()
    expect(result).toEqual({
      name: 'my-data-validation',
      description: 'my-validations',
      dataSources: {}
    })
  })

  it('should return a new object each time it is called', () => {
    const result1 = baseValidation()
    const result2 = baseValidation()
    expect(result1).not.toBe(result2)
  })

  it('should have an empty dataSources object', () => {
    const result = baseValidation()
    expect(result.dataSources).toEqual({})
    expect(Object.keys(result.dataSources).length).toBe(0)
  })

  it('should have the correct name and description', () => {
    const result = baseValidation()
    expect(result.name).toBe('my-data-validation')
    expect(result.description).toBe('my-validations')
  })

  it('should not have any additional properties', () => {
    const result = baseValidation()
    const expectedKeys = ['name', 'description', 'dataSources']
    expect(Object.keys(result)).toEqual(expectedKeys)
  })
})

describe('baseTask', () => {
  const { baseTask } = require('../../src/util/config')

  it('should return an object with the correct structure', () => {
    const result = baseTask()
    expect(result).toEqual({
      name: 'my-data-generation-task',
      steps: []
    })
  })

  it('should return a new object each time it is called', () => {
    const result1 = baseTask()
    const result2 = baseTask()
    expect(result1).not.toBe(result2)
  })

  it('should have an empty steps array', () => {
    const result = baseTask()
    expect(Array.isArray(result.steps)).toBe(true)
    expect(result.steps.length).toBe(0)
  })

  it('should have a name property with the correct value', () => {
    const result = baseTask()
    expect(result.name).toBe('my-data-generation-task')
  })

  it('should not have any additional properties', () => {
    const result = baseTask()
    const keys = Object.keys(result)
    expect(keys).toHaveLength(2)
    expect(keys).toContain('name')
    expect(keys).toContain('steps')
  })
})

describe('basePlan', () => {
  const { basePlan } = require('../../src/util/config')

  it('should return an object with the correct structure', () => {
    const result = basePlan()
    expect(result).toEqual({
      name: 'my-plan',
      description: 'my-description',
      tasks: [],
      sinkOptions: {
        foreignKeys: []
      },
      validations: ['my-data-validation'],
      runId: result.runId
    })
  })

  it('should return a new object each time it is called', () => {
    const plan1 = basePlan()
    const plan2 = basePlan()
    expect(plan1).not.toBe(plan2)
  })

  it('should have an empty tasks array', () => {
    const result = basePlan()
    expect(result.tasks).toEqual([])
    expect(Array.isArray(result.tasks)).toBe(true)
  })

  it('should have an empty foreignKeys array in sinkOptions', () => {
    const result = basePlan()
    expect(result.sinkOptions.foreignKeys).toEqual([])
    expect(Array.isArray(result.sinkOptions.foreignKeys)).toBe(true)
  })

  it('should have a validations array with one element', () => {
    const result = basePlan()
    expect(result.validations).toEqual(['my-data-validation'])
    expect(Array.isArray(result.validations)).toBe(true)
    expect(result.validations.length).toBe(1)
  })
})

describe('baseApplicationConf', () => {
  const { baseApplicationConf } = require('../../src/util/config')

  it('should return a string', () => {
    const result = baseApplicationConf()
    expect(typeof result).toBe('string')
  })

  it('should contain default flag values', () => {
    const result = baseApplicationConf()
    expect(result).toContain('enableCount = true')
    expect(result).toContain('enableGenerateData = true')
  })

  it('should contain default folder paths', () => {
    const result = baseApplicationConf()
    expect(result).toContain(
      'generatedPlanAndTaskFolderPath = "/opt/app/custom/generated"'
    )
    expect(result).toContain(
      'planFilePath = "/opt/app/custom/plan/data-generation-plan.yaml"'
    )
  })

  it('should contain default metadata values', () => {
    const result = baseApplicationConf()
    expect(result).toContain('numRecordsFromDataSource = 10000')
    expect(result).toContain('numRecordsForAnalysis = 10000')
  })

  it('should contain default generation values', () => {
    const result = baseApplicationConf()
    expect(result).toContain('numRecordsPerBatch = 100000')
  })

  it('should contain default validation values', () => {
    const result = baseApplicationConf()
    expect(result).toContain('numSampleErrorRecords = 5')
  })

  it('should contain default alert values', () => {
    const result = baseApplicationConf()
    expect(result).toContain('triggerOn = "all"')
  })

  it('should contain default runtime values', () => {
    const result = baseApplicationConf()
    expect(result).toContain('master = "local[*]"')
  })

  it('should contain default jdbc values', () => {
    const result = baseApplicationConf()
    expect(result).toContain('url = "jdbc:postgresql://postgres:5432/customer"')
    expect(result).toContain('user = "postgres"')
  })

  it('should contain default kafka values', () => {
    const result = baseApplicationConf()
    expect(result).toContain('kafka.bootstrap.servers = "localhost:9092"')
  })

  it('should contain default csv values', () => {
    const result = baseApplicationConf()
    expect(result).toContain('path = "/opt/app/data/csv"')
  })

  it('should contain default delta values', () => {
    const result = baseApplicationConf()
    expect(result).toContain('path = "/opt/app/data/delta"')
  })

  it('should contain default iceberg values', () => {
    const result = baseApplicationConf()
    expect(result).toContain('path = "/opt/app/data/iceberg"')
  })

  it('should contain default json values', () => {
    const result = baseApplicationConf()
    expect(result).toContain('path = "/opt/app/data/json"')
  })

  it('should contain default orc values', () => {
    const result = baseApplicationConf()
    expect(result).toContain('path = "/opt/app/data/orc"')
  })

  it('should contain default parquet values', () => {
    const result = baseApplicationConf()
    expect(result).toContain('path = "/opt/app/data/parquet"')
  })
})
