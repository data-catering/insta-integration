#!/usr/bin/env node

const { program } = require('commander')
const { run } = require('./main')

program
  .version('1.0.0')
  .description(
    'insta-integration CLI - Simple integration testing for any application or job'
  )
  .option(
    '-c, --config-file <type>',
    'Configuration file for insta-integration',
    'insta-integration.yaml'
  )
  .option(
    '-i, --insta-infra-folder <type>',
    'Folder pathway to insta-infra repository',
    'insta-infra'
  )
  .option(
    '-b, --base-folder <type>',
    'Folder pathway for execution files',
    'insta-integration-docker'
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
    run()
  })

program.parse(process.argv)
