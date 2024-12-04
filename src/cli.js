#!/usr/bin/env node

const { program } = require('commander')
const { run } = require('./main')

program
  .version('1.0.14')
  .description(
    'insta-integration CLI - Simple integration testing for any application or job'
  )
  .option(
    '-b, --base-folder <folder>',
    'Folder pathway for execution files',
    `${process.env.HOME}/.insta-integration`
  )
  .option(
    '-c, --config-file <file>',
    'Configuration file for insta-integration',
    'insta-integration.yaml'
  )
  .option(
    '-d, --data-caterer-version <version>',
    'Version of data-caterer Docker image',
    '0.12.3'
  )
  .option(
    '-i, --insta-infra-folder <folder>',
    'Folder pathway to insta-infra repository',
    `${process.env.HOME}/.insta-integration/insta-infra`
  )
  .action(options => {
    if (options.configFile) {
      process.env.CONFIGURATION_FILE = options.configFile
    }
    if (options.instaInfraFolder) {
      process.env.INSTA_INFRA_FOLDER = options.instaInfraFolder
    }
    if (options.baseFolder) {
      process.env.BASE_FOLDER = options.baseFolder
    }
    if (options.dataCatererVersion) {
      process.env.DATA_CATERER_VERSION = options.dataCatererVersion
    }
    run()
  })

program.parse(process.argv)
