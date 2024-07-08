const process = require('process')

/**
 * Application configuration file used by data-caterer
 * @returns {string}
 */
const baseApplicationConf = () => `
flags {
    enableCount = true
    enableCount = \${?ENABLE_COUNT}
    enableGenerateData = true
    enableGenerateData = \${?ENABLE_GENERATE_DATA}
    enableGeneratePlanAndTasks = false
    enableGeneratePlanAndTasks = \${?ENABLE_GENERATE_PLAN_AND_TASKS}
    enableRecordTracking = true
    enableRecordTracking = \${?ENABLE_RECORD_TRACKING}
    enableDeleteGeneratedRecords = false
    enableDeleteGeneratedRecords = \${?ENABLE_DELETE_GENERATED_RECORDS}
    enableFailOnError = true
    enableFailOnError = \${?ENABLE_FAIL_ON_ERROR}
    enableUniqueCheck = true
    enableUniqueCheck = \${?ENABLE_UNIQUE_CHECK}
    enableSinkMetadata = true
    enableSinkMetadata = \${?ENABLE_SINK_METADATA}
    enableSaveReports = true
    enableSaveReports = \${?ENABLE_SAVE_REPORTS}
    enableValidation = true
    enableValidation = \${?ENABLE_VALIDATION}
    enableGenerateValidations = false
    enableGenerateValidations = \${?ENABLE_GENERATE_VALIDATIONS}
    enableAlerts = false
    enableAlerts = \${?ENABLE_ALERTS}
}

folders {
    generatedPlanAndTaskFolderPath = "/opt/app/custom/generated"
    generatedPlanAndTaskFolderPath = \${?GENERATED_PLAN_AND_TASK_FOLDER_PATH}
    planFilePath = "/opt/app/custom/plan/data-generation-plan.yaml"
    planFilePath = \${?PLAN_FILE_PATH}
    taskFolderPath = "/opt/app/custom/task"
    taskFolderPath = \${?TASK_FOLDER_PATH}
    recordTrackingFolderPath = "/opt/app/shared/data/generated/record-tracking"
    recordTrackingFolderPath = \${?RECORD_TRACKING_FOLDER_PATH}
    generatedReportsFolderPath = "/opt/app/custom/report"
    generatedReportsFolderPath = \${?GENERATED_REPORTS_FOLDER_PATH}
    validationFolderPath = "/opt/app/custom/validation"
    validationFolderPath = \${?VALIDATION_FOLDER_PATH}
}

metadata {
    numRecordsFromDataSource = 10000
    numRecordsFromDataSource = \${?METADATA_NUM_RECORDS_FROM_DATA_SOURCE}
    numRecordsForAnalysis = 10000
    numRecordsForAnalysis = \${?METADATA_NUM_RECORDS_FOR_ANALYSIS}
    oneOfDistinctCountVsCountThreshold = 0.1
    oneOfDistinctCountVsCountThreshold = \${?METADATA_ONE_OF_DISTINCT_COUNT_VS_COUNT_THRESHOLD}
    oneOfMinCount = 1000
    oneOfMinCount = \${?ONE_OF_MIN_COUNT}
    numGeneratedSamples = 10
    numGeneratedSamples = \${?NUM_GENERATED_SAMPLES}
}

generation {
    numRecordsPerBatch = 100000
    numRecordsPerBatch = \${?GENERATION_NUM_RECORDS_PER_BATCH}
}

validation {
    numSampleErrorRecords = 5
    numSampleErrorRecords = \${?NUM_SAMPLE_ERROR_RECORDS}
    enableDeleteRecordTrackingFiles = true
    enableDeleteRecordTrackingFiles = \${?ENABLE_DELETE_RECORD_TRACKING_FILES}
}

alert {
    triggerOn = "all"
    triggerOn = \${?ALERT_TRIGGER_ON}
    slackAlertConfig {
        token = ""
        token = \${?ALERT_SLACK_TOKEN}
        channels = []
        channels = \${?ALERT_SLACK_CHANNELS}
    }
}

runtime {
    master = "local[*]"
    master = \${?DATA_CATERER_MASTER}
    config {
        "spark.driver.memory" = "2g"
        "spark.executor.memory" = "2g"
        "spark.sql.cbo.enabled" = "true"
        "spark.sql.adaptive.enabled" = "true"
        "spark.sql.cbo.planStats.enabled" = "true"
        "spark.sql.legacy.allowUntypedScalaUDF" = "true"
        "spark.sql.legacy.allowParameterlessCount" = "true",
        "spark.sql.statistics.histogram.enabled" = "true"
        "spark.sql.shuffle.partitions" = "10"
        "spark.sql.catalog.postgres" = ""
        "spark.sql.catalog.cassandra" = "com.datastax.spark.connector.datasource.CassandraCatalog"
        "spark.sql.catalog.iceberg" = "org.apache.iceberg.spark.SparkCatalog",
        "spark.sql.catalog.iceberg.type" = "hadoop",
        "spark.hadoop.fs.s3a.directory.marker.retention" = "keep"
        "spark.hadoop.fs.s3a.bucket.all.committer.magic.enabled" = "true"
        "spark.hadoop.fs.hdfs.impl" = "org.apache.hadoop.hdfs.DistributedFileSystem",
        "spark.hadoop.fs.file.impl" = "com.globalmentor.apache.hadoop.fs.BareLocalFileSystem",
        "spark.sql.extensions" = "io.delta.sql.DeltaSparkSessionExtension,org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions"
    }
}

# connection type
jdbc {
    postgres {
        url = "jdbc:postgresql://postgres:5432/customer"
        url = \${?POSTGRES_URL}
        user = "postgres"
        user = \${?POSTGRES_USER}
        password = "postgres"
        password = \${?POSTGRES_PASSWORD}
        driver = "org.postgresql.Driver"
    }
    mysql {
        url = "jdbc:mysql://mysql:3306/customer"
        url = \${?MYSQL_URL}
        user = "root"
        user = \${?MYSQL_USER}
        password = "root"
        password = \${?MYSQL_PASSWORD}
        driver = "com.mysql.cj.jdbc.Driver"
    }
}

org.apache.spark.sql.cassandra {
    cassandra {
        spark.cassandra.connection.host = "cassandra"
        spark.cassandra.connection.host = \${?CASSANDRA_HOST}
        spark.cassandra.connection.port = "9042"
        spark.cassandra.connection.port = \${?CASSANDRA_PORT}
        spark.cassandra.auth.username = "cassandra"
        spark.cassandra.auth.username = \${?CASSANDRA_USER}
        spark.cassandra.auth.password = "cassandra"
        spark.cassandra.auth.password = \${?CASSANDRA_PASSWORD}
    }
}

http {
    httpbin {
    }
}

jms {
    solace {
        initialContextFactory = "com.solacesystems.jndi.SolJNDIInitialContextFactory"
        initialContextFactory = \${?SOLACE_INITIAL_CONTEXT_FACTORY}
        connectionFactory = "/jms/cf/default"
        connectionFactory = \${?SOLACE_CONNECTION_FACTORY}
        url = "smf://solace:55554"
        url = \${?SOLACE_URL}
        user = "admin"
        user = \${?SOLACE_USER}
        password = "admin"
        password = \${?SOLACE_PASSWORD}
        vpnName = "default"
        vpnName = \${?SOLACE_VPN}
    }
}

kafka {
    kafka {
        kafka.bootstrap.servers = "localhost:9092"
        kafka.bootstrap.servers = \${?KAFKA_BOOTSTRAP_SERVERS}
    }
}

csv {
    csv {
        path = "/opt/app/data/csv"
        path = \${?CSV_PATH}
    }
}

delta {
    delta {
        path = "/opt/app/data/delta"
        path = \${?DELTA_PATH}
    }
}

iceberg {
    iceberg {
        path = "/opt/app/data/iceberg"
        path = \${?ICEBERG_WAREHOUSE_PATH}
        catalogType = "hadoop"
        catalogType = \${?ICEBERG_CATALOG_TYPE}
        catalogUri = ""
        catalogUri = \${?ICEBERG_CATALOG_URI}
    }
}

json {
    json {
        path = "/opt/app/data/json"
        path = \${?JSON_PATH}
    }
}

orc {
    orc {
        path = "/opt/app/data/orc"
        path = \${?JSON_PATH}
    }
}

parquet {
    parquet {
        path = "/opt/app/data/parquet"
        path = \${?PARQUET_PATH}
    }
}

datastax-java-driver.advanced.metadata.schema.refreshed-keyspaces = [ "/.*/" ]
`

/**
 * Plan format used by data-caterer
 * @type {function(): {name: string, description: string, sinkOptions: {foreignKeys: []}, tasks: []}}
 */
const basePlan = () => {
  return {
    name: 'my-plan',
    description: 'my-description',
    tasks: [],
    sinkOptions: {
      foreignKeys: []
    },
    validations: ['my-data-validation']
  }
}

/**
 * Task format used by data-caterer
 * @type {function(): {name: string, steps: []}}
 */
const baseTask = () => {
  return {
    name: 'my-data-generation-task',
    steps: []
  }
}

/**
 * Validation format used by data-caterer
 * @type {(function(): *)|*}
 */
const baseValidation = () => {
  return {
    name: 'my-data-validation',
    description: 'my-validations',
    dataSources: {}
  }
}

/**
 * Extra step appended to notify when data-caterer has finished generating data
 * @returns {{schema: {fields: [{name: string}]}, name: string, options: {path: string}, count: {records: number}}}
 */
const notifyGenerationDoneTask = () => {
  return {
    name: 'data-gen-done-step',
    options: { path: '/opt/app/shared/notify/data-gen-done' },
    count: { records: 1 },
    schema: { fields: [{ name: 'account_id' }] }
  }
}

/**
 * Docker run command for data-caterer
 * @param basicImage  Use basic image or not
 * @param version Version of data-caterer Docker image
 * @param sharedFolder  Folder to volume mount for shared files between host and data-caterer
 * @param confFolder  Configuration folder containing plan, tasks and validation files
 * @param planName  Name of plan to run
 * @param envVars Additional environment variables for data-caterer
 * @returns {string}
 */
function createDataCatererDockerRunCommand(
  basicImage,
  version,
  sharedFolder,
  confFolder,
  planName,
  envVars
) {
  const imageName = basicImage ? 'data-caterer-basic' : 'data-caterer'
  const dockerEnvVars = []
  for (const [key, value] of Object.entries(envVars)) {
    dockerEnvVars.push(`-e ${key}=${value}`)
  }
  const uid = process.getuid()
  const gid = process.getgid()
  let user = ``
  //to make it work for GitHub Actions
  if (uid === 1001) {
    user = `--user ${uid}:${gid}`
  }
  return `docker run -d -p 4040:4040 \
  --network insta-infra_default \
  --name data-caterer ${user} \
  -v ${confFolder}:/opt/app/custom \
  -v ${sharedFolder}:/opt/app/shared \
  -e APPLICATION_CONFIG_PATH=/opt/app/custom/application.conf \
  -e PLAN_FILE_PATH=/opt/app/custom/plan/${planName} \
  ${dockerEnvVars.join(' ')} \
  datacatering/${imageName}:${version}`
}

module.exports = {
  baseTask,
  basePlan,
  baseValidation,
  baseApplicationConf,
  notifyGenerationDoneTask,
  createDataCatererDockerRunCommand
}
