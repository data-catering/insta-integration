const fs = require('fs')
const path = require('path')
const Ajv2019 = require('ajv/dist/2019')
const yaml = require('js-yaml')
const glob = require('glob')

async function validateYamlFiles(yamlDirectory, schemaFile) {
  try {
    const ajv = new Ajv2019()
    const schema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'))
    const validate = ajv.compile(schema)

    const yamlFiles = glob.sync('**/*.y?(a)ml', {
      cwd: yamlDirectory,
      absolute: true
    })

    const validationErrors = []

    for (const file of yamlFiles) {
      try {
        const yamlContent = fs.readFileSync(file, 'utf8')
        const data = yaml.load(yamlContent)

        const valid = validate(data)

        if (!valid) {
          validationErrors.push({
            file: path.relative(yamlDirectory, file),
            errors: validate.errors
          })
        }
      } catch (error) {
        validationErrors.push({
          file: path.relative(yamlDirectory, file),
          errors: [{ message: error.message || 'Error processing file' }]
        })
      }
    }

    if (validationErrors.length > 0) {
      console.error('YAML validation failed for the following files:')
      // eslint-disable-next-line github/array-foreach
      validationErrors.forEach(({ file, errors }) => {
        console.error(`  - ${file}:`)
        // eslint-disable-next-line github/array-foreach
        errors.forEach(error => {
          console.error(`    - ${error.message} (path: ${error.instancePath})`)
        })
      })
      process.exit(1) // Exit with a non-zero code to indicate failure
    } else {
      console.log('All YAML files validated successfully.')
    }
  } catch (error) {
    console.error('Error during validation:', error)
    process.exit(1)
  }
}

// Example usage:
const yamlDirectory = './example' // Adjust the YAML directory
const schemaFile = './schema/insta-integration-config-latest.json' // Adjust the schema file path

validateYamlFiles(yamlDirectory, schemaFile)
