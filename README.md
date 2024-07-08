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

1. Create YAML file `insta-integration.yaml` to define your integration tests

   1. [Examples can be found here.](example)

1. Push your code and the GitHub Action will run

### Generation and Validation

Since it uses data-caterer behind the scenes to help with data generation and
validation, check the following pages for discovering what options are
available.

- [Data Generation](https://data.catering/setup/generator/data-generator/)
- [Data Validation](https://data.catering/setup/validation/)

### GitHub Action Options

#### Input

Optional configurations to alter the files and folders used by the GitHub Action
can be found below.

| Name               | Description                                                                                  | Default                      |
| ------------------ | -------------------------------------------------------------------------------------------- | ---------------------------- |
| configuration_file | File path to configuration file                                                              | insta-integration.yaml       |
| insta_infra_folder | Folder path to insta-infra ([this repository](https://github.com/data-catering/insta-infra)) | integration-test/insta-infra |
| base_folder        | Folder path to use for execution files                                                       | /tmp/insta-integration       |

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

| Name                    | Description                                                 | Default |
| ----------------------- | ----------------------------------------------------------- | ------- |
| num_records_generated   | Total number of records generated.                          | 0       |
| num_success_validations | Total number of successful validations.                     | 0       |
| num_failed_validations  | Total number of failed validations.                         | 0       |
| num_validations         | Total number of validations.                                | 0       |
| validation_success_rate | Success rate of validations (i.e. 0.75 = 75% success rate). | 0       |

For example, you can print out the results like below:

```yaml
- name: Run integration tests
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
- [VS Code](https://code.visualstudio.com/docs/languages/json#_json-schemas-and-settings)

### Example Flows

[Examples can be found here.](example)

## Test Command Locally

```shell
npm run local
```
