import pino from 'pino'
import { config } from './config'

const rootLogger = pino({
  level: config.LOG_LEVEL,
  transport:
    config.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
})

/**
 * Create a child logger for a specific module.
 * Inherits LOG_LEVEL and transport from the root logger.
 */
export function createLogger(name: string) {
  return rootLogger.child({ module: name })
}

export { rootLogger as logger }
