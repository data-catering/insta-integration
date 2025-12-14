const { createLogger, format, transports } = require('winston')

const LOG_LEVEL = process.env.LOG_LEVEL || 'info'

// Custom format for cleaner, more readable logs
const customFormat = format.printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
  return `${timestamp} [${level.toUpperCase().padEnd(5)}] ${message}${metaStr}`
})

const logger = createLogger({
  level: LOG_LEVEL,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    customFormat
  ),
  transports: [new transports.Console({})]
})

// Add helper method to check if debug is enabled
logger.isDebugEnabled = function () {
  return LOG_LEVEL === 'debug'
}

// Prefixes for consistent logging
const PREFIX = {
  DOCKER: '[Docker]',
  SERVICE: '[Service]',
  CONFIG: '[Config]',
  APP: '[App]',
  DATA_GEN: '[DataGen]',
  VALIDATION: '[Validation]',
  SUMMARY: '[Summary]'
}

// Helper functions for consistent logging patterns
function logStep(step, message) {
  logger.info(`${step} ${message}`)
}

function logError(prefix, message, error = null) {
  if (error) {
    logger.error(`${prefix} ${message}: ${error.message || error}`)
  } else {
    logger.error(`${prefix} ${message}`)
  }
}

function logSuccess(prefix, message) {
  logger.info(`${prefix} ✓ ${message}`)
}

function logSectionStart(title) {
  logger.info(`${'─'.repeat(50)}`)
  logger.info(`${title}`)
  logger.info(`${'─'.repeat(50)}`)
}

function logSummary(title, items) {
  logger.info('')
  logger.info(`${'═'.repeat(50)}`)
  logger.info(`${PREFIX.SUMMARY} ${title}`)
  logger.info(`${'═'.repeat(50)}`)
  for (const [key, value] of Object.entries(items)) {
    logger.info(`  ${key}: ${value}`)
  }
  logger.info(`${'═'.repeat(50)}`)
  logger.info('')
}

// Attach helpers to logger object for easy access
logger.PREFIX = PREFIX
logger.logStep = logStep
logger.logError = logError
logger.logSuccess = logSuccess
logger.logSectionStart = logSectionStart
logger.logSummary = logSummary

module.exports = logger
