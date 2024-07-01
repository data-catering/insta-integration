# Data Caterer Action

[![GitHub Super-Linter](https://github.com/actions/javascript-action/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)
![CI](https://github.com/actions/javascript-action/actions/workflows/ci.yml/badge.svg)

Automated integration tests for any application or job.

- Spin up any external services
- Generate production-like data
- Run data validations to ensure application or job works as expected

## Usage

1. Create YAML file `.github/workflows/integration-test.yaml`
   ```yaml
   name: Integration Test
   on:
     push:
       branches:
         - *
   jobs:
     integration-test:
       name: Integration Test via Data Caterer
       runs-on: ubuntu-latest
       steps:
         - name: Run integration tests
           uses: data-catering/data-caterer-action@v1
   ```
1. Create YAML file `data-caterer.yaml`
   1. For the latest supported services,
      [check here](https://github.com/data-catering/insta-infra?tab=readme-ov-file#services).
      Supported services include: activemq, airflow, cassandra, clickhouse,
      cockroachdb, dagster, data-caterer, debezium, doris, druid, duckdb,
      elasticsearch, flight-sql, flink, httpbin, kafka, keycloak, mage-ai,
      mariadb, marquez, minio, mongodb, mysql, neo4j, pinot, postgres, prefect,
      presto, rabbitmq, solace, spanner, sqlite, temporal, trino, unitycatalog,
      zookeeper
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

### Example Flow

GitHub Action YAML

```yaml
name: Integration Test
on:
  push:
    branches:
      - *
jobs:
  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest

    steps:
      - name: Run integration tests
        uses: data-catering/data-caterer-action@v1
```

YAML config file:

```yaml
services: #what external services your app/job connects to
  - name: kafka:1.1.0 #optionally define a version
    data: https://github.com/data-catering/insta-infra/blob/main/data/kafka/my_data.sh
  - name: postgres
    data: src/main/resources/postgres/ddl
run: #how to run your app/job, can run multiple, run in order
  - command: ./run-app.sh
    #    command: java -jar build/target/my-app.jar
    #    command: docker run -p 8080:8080 my-image:${APP_VERSION:-1.3.1}
    #allow for env variable substitution anywhere in the YAML
    env:
      - APP_VERSION=1.3.1
    test: #using data-caterer, generate and validate data
      generation:
        - name: kafka #name matches with service from above
      validation:
        - name: postgres
options: #additional options
  keepAlive: true #could allow services to be kept alive after running
  deleteData: false #retain data for further investigation/debugging/testing
```

## Test Command

```shell
CONFIGURATION_FILE=example/postgres-to-csv.yaml INSTA_INFRA_FOLDER=../insta-infra BASE_FOLDER=/tmp/data-caterer-action node src/index.js
```

docker run --entrypoint /bin/bash -it datacatering/data-caterer-basic:0.11.2 -c
'echo "1001:x:1001:127:github:/opt/app:/sbin/nologin" >> /etc/passwd && addgroup
-G github && adduser -G github -u 1001 github && cat /etc/passwd && bash
/opt/app/run-data-caterer.sh' docker run --entrypoint /bin/bash -it
datacatering/data-caterer-basic:0.11.2 -c 'adduser -G github -u 1001 github &&
cat /etc/passwd && bash /opt/app/run-data-caterer.sh'
