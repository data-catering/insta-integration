# insta-integration - Integration Testing

Automated integration tests for any application/job.

- Spin up any external services
- Generate production-like data
- Run data validations to ensure application/job works as expected

Problems it can help with:

- Unreliable test environments
- Dependencies on other teams
- Simulate complex data flows

## Usage

### CLI

1. Install via `npm install -g insta-integration`
1. Create YAML file `insta-integration.yaml` to define your integration tests

   1. [Examples can be found here.](example)
   1. [Use JSON schema to help guide you on available options](#json-schema-for-insta-integrationyaml)

1. Run `insta-integration`

### GitHub Action

1. Create YAML file `.github/workflows/integration-test.yaml`

   ```yaml
   name: Integration Test
   on:
     push:
       branches:
         - *
   jobs:
     integration-test:
       name: Integration Test
       runs-on: ubuntu-latest
       steps:
         - name: Run integration tests
           uses: data-catering/insta-integration@v1
   ```

1. Create YAML file `insta-integration.yaml` to define your integration tests

   1. [Examples can be found here.](example)
   1. [Use JSON schema to help guide you on available options](#json-schema-for-insta-integrationyaml)

1. Push your code and the GitHub Action will run

### Services

The following services are available to run alongside your application/job.

<details>
<summary>Click here</summary>

| Service Type                | Service       | Supported |
| --------------------------- | ------------- | --------- |
| Change Data Capture         | debezium      | ✅        |
| Database                    | cassandra     | ✅        |
| Database                    | cockroachdb   | ✅        |
| Database                    | elasticsearch | ✅        |
| Database                    | mariadb       | ✅        |
| Database                    | mongodb       | ✅        |
| Database                    | mssql         | ✅        |
| Database                    | mysql         | ✅        |
| Database                    | neo4j         | ✅        |
| Database                    | postgres      | ✅        |
| Database                    | spanner       | ✅        |
| Database                    | sqlite        | ✅        |
| Database                    | opensearch    | ❌        |
| Data Catalog                | marquez       | ✅        |
| Data Catalog                | unitycatalog  | ✅        |
| Data Catalog                | amundsen      | ❌        |
| Data Catalog                | datahub       | ❌        |
| Data Catalog                | openmetadata  | ❌        |
| Distributed Coordination    | zookeeper     | ✅        |
| Distributed Data Processing | flink         | ✅        |
| HTTP                        | httpbin       | ✅        |
| Identity Management         | keycloak      | ✅        |
| Job Orchestrator            | airflow       | ✅        |
| Job Orchestrator            | dagster       | ✅        |
| Job Orchestrator            | mage-ai       | ✅        |
| Job Orchestrator            | prefect       | ✅        |
| Messaging                   | activemq      | ✅        |
| Messaging                   | kafka         | ✅        |
| Messaging                   | rabbitmq      | ✅        |
| Messaging                   | solace        | ✅        |
| Notebook                    | jupyter       | ✅        |
| Object Storage              | minio         | ✅        |
| Query Engine                | duckdb        | ✅        |
| Query Engine                | flight-sql    | ✅        |
| Query Engine                | presto        | ✅        |
| Query Engine                | trino         | ✅        |
| Real-time OLAP              | clickhouse    | ✅        |
| Real-time OLAP              | doris         | ✅        |
| Real-time OLAP              | druid         | ✅        |
| Real-time OLAP              | pinot         | ✅        |
| Test Data Management        | data-caterer  | ✅        |
| Workflow                    | temporal      | ✅        |

</details>

### Generation and Validation

Since it uses [data-caterer](https://data.catering/) behind the scenes to help
with data generation and validation, check the following pages for discovering
what options are available.

- [Data Generation](https://data.catering/setup/generator/data-generator/)
- [Data Validation](https://data.catering/setup/validation/)

#### Data Sources

The following data sources are available to generate/validate data.

<details>
<summary>Click here</summary>

| Data Source Type | Data Source                        | Support |
| ---------------- |------------------------------------| ------- |
| Cloud Storage    | AWS S3                             | ✅      |
| Cloud Storage    | Azure Blob Storage                 | ✅      |
| Cloud Storage    | GCP Cloud Storage                  | ✅      |
| Database         | Cassandra                          | ✅      |
| Database         | MySQL                              | ✅      |
| Database         | Postgres                           | ✅      |
| Database         | Elasticsearch                      | ❌      |
| Database         | MongoDB                            | ❌      |
| Database         | Opensearch                         | ❌      |
| File             | CSV                                | ✅      |
| File             | Delta Lake                         | ✅      |
| File             | JSON                               | ✅      |
| File             | Iceberg                            | ✅      |
| File             | ORC                                | ✅      |
| File             | Parquet                            | ✅      |
| File             | Hudi                               | ❌      |
| HTTP             | REST API                           | ✅      |
| Messaging        | Kafka                              | ✅      |
| Messaging        | Solace                             | ✅      |
| Messaging        | ActiveMQ                           | ❌      |
| Messaging        | Pulsar                             | ❌      |
| Messaging        | RabbitMQ                           | ❌      |
| Metadata         | Data Contract CLI                  | ✅      |
| Metadata         | Great Expectations                 | ✅      |
| Metadata         | Marquez                            | ✅      |
| Metadata         | OpenAPI/Swagger                    | ✅      |
| Metadata         | OpenMetadata                       | ✅      |
| Metadata         | Open Data Contract Standard (ODCS) | ✅      |
| Metadata         | Amundsen                           | ❌      |
| Metadata         | Datahub                            | ❌      |
| Metadata         | Data Contract CLI                  | ❌      |
| Metadata         | Solace Event Portal                | ❌      |

</details>

#### Examples

##### Simple Example

```yaml
services: []
run:
  - command: ./my-app/run-app.sh
    test:
      generation:
        parquet:
          - options:
              path: /tmp/parquet/accounts
            schema:
              fields:
                - name: account_id
      validation:
        parquet:
          - options:
              path: /tmp/parquet/accounts
            validations:
              - expr: ISNOTNULL(account_id)
              - aggType: count
                aggExpr: count == 1000
```

##### Full Example

```yaml
services:
  - name: postgres #define external services
    data: my-data/sql #initial service setup (i.e. schema/tables, topics, queues)
run:
  - command: ./my-app/run-postgres-extract-app.sh #how to run your application/job
    env: #environment variables for your application/job
      POSTGRES_URL: jdbc:postgresql://postgres:5432/docker
    test:
      env: #environment variables for data generation/validation
        POSTGRES_URL: jdbc:postgresql://postgres:5432/docker
      mount: #volume mount for data validation
        - ${PWD}/example/my-app/shared/generated:/opt/app/shared/generated
      relationship: #generate data with same values used across different data sources
        postgres_balance.account_number: #ensure account_number in balance table exists when transaction created
          - postgres_transaction.account_number
      generation: #define data sources for data generation
        postgres:
          - name: postgres_transaction #give it a name to use in relationship definition
            options: #configuration on specific data source
              dbtable: account.transactions
            count: #how many records to generate (1,000 by default)
              perColumn: #generate 5 records per account_number
                columnNames: [account_number]
                count: 5
            schema: #schema of the data source
              fields:
                - name: account_number
                  type: string
                - name: create_time
                  type: timestamp
                - name: transaction_id
                  type: string
                - name: amount
                  type: double
          - name: postgres_balance
            options:
              dbtable: account.balances
            schema:
              fields:
                - name: account_number
                  options: #additional metadata for data generation
                    isUnique: true
                    regex: ACC[0-9]{10}
                - name: create_time
                  type: timestamp
                - name: account_status
                  type: string
                  options:
                    oneOf: [open, closed]
                - name: balance
                  type: double
      validation:
        csv: #define data source for data validations
          - options:
              path: /opt/app/shared/generated/balances.csv
              header: true
            validations: #list of validation to run, can be basic SQL, aggregations, upstream data source or column name validations
              - expr: ISNOTNULL(account_number)
              - aggType: count
                aggExpr: count == 1000
          - options:
              path: /opt/app/shared/generated/transactions.csv
              header: true
            validations:
              - expr: ISNOTNULL(account_number)
              - aggType: count
                aggExpr: count == 5000
              - groupByCols: [account_number]
                aggType: count
                aggExpr: count == 5
```

### GitHub Action Options

#### Input

Optional configurations to alter the files and folders used by the GitHub Action
can be found below.

| Name                 | Description                                                                                  | Default                                  |
| -------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------- |
| configuration_file   | File path to configuration file                                                              | `insta-integration.yaml`                 |
| insta_infra_folder   | Folder path to insta-infra ([this repository](https://github.com/data-catering/insta-infra)) | `${HOME}/.insta-integration/insta-infra` |
| base_folder          | Folder path to use for execution files                                                       | `${HOME}/.insta-integration`             |
| data_caterer_version | Version of data-caterer Docker image                                                         | `0.11.8`                                 |

To use these configurations, alter your
`.github/workflows/integration-test.yaml`.

```yaml
name: Integration Test
on:
  push:
    branches:
      - *
jobs:
  integration-test:
    name: Integration Test
    runs-on: ubuntu-latest
    steps:
      - name: Run integration tests
        uses: data-catering/insta-integration@v1
        with:
          configuration_file: my/custom/folder/insta-integration.yaml
```

#### Output

If you want to use the output of the GitHub Action, the following attributes are
available:

| Name                    | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| num_records_generated   | Total number of records generated.                           |
| num_success_validations | Total number of successful validations.                      |
| num_failed_validations  | Total number of failed validations.                          |
| num_validations         | Total number of validations.                                 |
| validation_success_rate | Success rate of validations (i.e. 0.75 = 75% success rate).  |
| full_result             | All result details as JSON (data generation and validation). |

For example, you can print out the results like below:

```yaml
- name: Run integration tests
  id: test-action
  uses: data-catering/insta-integration@v1
- name: Print Output
  id: output
  run: |
    echo "Records generated:         ${{ steps.test-action.outputs.num_records_generated }}"
    echo "Successful validations:    ${{ steps.test-action.outputs.num_success_validations }}"
    echo "Failed validations:        ${{ steps.test-action.outputs.num_failed_validations }}"
    echo "Number of validations:     ${{ steps.test-action.outputs.num_validations }}"
    echo "Validation success rate:   ${{ steps.test-action.outputs.validation_success_rate }}"
```

### JSON Schema for insta-integration.yaml

[A JSON Schema has been created](schema/insta-integration-config-latest.json) to
help guide users on what is possible in the `insta-integration.yaml`. The links
below show how you can import the schema in your favourite IDE:

- [IntelliJ](https://www.jetbrains.com/help/idea/json.html#ws_json_schema_add_custom)
- [Visual Studio Code](https://code.visualstudio.com/docs/languages/json#_json-schemas-and-settings)

#### Validate JSON Schema

Using the following tool [`ajv`](https://www.npmjs.com/package/ajv).

Validate the JSON Schema:

```shell
ajv compile --spec=draft2019 -s schema/insta-integration-config-latest.json
```

Validate a `insta-integration.yaml` file:

```shell
ajv validate --spec=draft2019 -s schema/insta-integration-config-latest.json -d example/postgres-to-csv.yaml
```

### Example Flows

[Examples can be found here.](example)

## Why Integration Test?

It is the closest you get to simulating production. This involves:

- Test your application/job end-to-end
- Connect to data sources
- Production-like data processed
