# insta-integration - Integration Testing

[![GitHub Super-Linter](https://github.com/actions/insta-integration/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)
![CI](https://github.com/actions/insta-integration/actions/workflows/ci.yml/badge.svg)

Automated integration tests for any application or job.

- Spin up any external services
- Generate production-like data
- Run data validations to ensure application or job works as expected

Problems it can help with:

- Unreliable test environments
- Dependencies on other teams
- Simulate complex data flows

## Why Integration Test?

It is the closest you get to simulating production. This involves:

- Test your application/job end-to-end
- Connect to data sources
- Production-like data processed

## Usage

1. (**If you want it as a GitHub Action**) Create YAML file
   `.github/workflows/integration-test.yaml`

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

1. Create YAML file `insta-integration.yaml`

   1. For the latest supported services,
      [check here](https://github.com/data-catering/insta-infra?tab=readme-ov-file#services).
      Supported services include: activemq, airflow, cassandra, clickhouse,
      cockroachdb, dagster, data-caterer, debezium, doris, druid, duckdb,
      elasticsearch, flight-sql, flink, httpbin, kafka, keycloak, mage-ai,
      mariadb, marquez, minio, mongodb, mysql, neo4j, pinot, postgres, prefect,
      presto, rabbitmq, solace, spanner, sqlite, temporal, trino, unitycatalog,
      zookeeper

   ```yaml
   services: #what external services your app/job connects to
     - name: postgres
       data: my-data/sql #define SQL DDL scripts needed to create initial schemas/tables
   run: #how to run your app/job, can run multiple, run in order
     - command: ./my-app/run-postgres-extract-app.sh
       env:
         APP_VERSION: 1.3.1 #additional env vars to pass to your app/job
       test:
         env:
           POSTGRES_URL: jdbc:postgresql://postgres:5432/docker #additional env vars to pass to data generation/validation
         relationship: #define relationships where data needs to match across data sources
           postgres_balance.account_number: #transaction account_number should also exist in balance
             - postgres_transaction.account_number
         generation:
           postgres: #match with service from above or can be another data source (i.e. csv, parquet)
             - name: postgres_transaction #name of generation task, used to define relationships
               options: #additional connection options
                 dbtable: account.transactions
               count: #how many records to generate, default to 1000
                 perColumn:
                   columnNames: [account_number]
                   count: 5 #per unique account_number, generate 5 records
               schema:
                 fields:
                   - name: account_number #default to data type string
                   - name: create_time
                     type: timestamp
                   - name: transaction_id
                   - name: amount
                     type: double
             - name: postgres_balance
               options:
                 dbtable: account.balances
               schema:
                 fields:
                   - name: account_number
                     generator:
                       options: #additional generator options
                         isUnique: true #generate unique values
                   - name: create_time
                     type: timestamp
                   - name: account_status
                   - name: balance
                     type: double
         validation:
           csv: #data source to run data validations on
             - options:
                 path: /opt/app/shared/generated/balances.csv
                 header: true
               validations: #list of validation rules to run
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

1. Push your code and the GitHub Action should start

### Generation and Validation

Since it uses data-caterer behind the scenes to help with data generation and
validation, check the following pages for discovering what options are
available.

- [Data Generation](https://data.catering/setup/generator/data-generator/)
- [Data Validation](https://data.catering/setup/validation/)

#### JSON Schema for insta-integration.yaml

[A JSON Schema has been created](schema/insta-integration-config-latest.json) to
help guide users on what is possible in the `insta-integration.yaml`. The links
below show how you can import the schema in your favourite IDE:

- [IntelliJ](https://www.jetbrains.com/help/idea/json.html#ws_json_schema_add_custom)
- [VS Code](https://code.visualstudio.com/docs/languages/json#_json-schemas-and-settings)

### Example Flows

[Examples can be found here.](example)

## Test Command Locally

```shell
npm run local
```
