/**
 * Frontend logger — structured console logging with level control.
 * In production, only warn and error are logged.
 * In development, all levels are enabled.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const currentLevel: LogLevel = import.meta.env.PROD ? 'warn' : 'debug'

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel]
}

function formatArgs(module: string, message: string, data?: Record<string, unknown>) {
  const prefix = `[${module}]`
  return data ? [prefix, message, data] : [prefix, message]
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
}

export function createLogger(module: string): Logger {
  return {
    debug(message: string, data?: Record<string, unknown>) {
      if (shouldLog('debug')) console.debug(...formatArgs(module, message, data))
    },
    info(message: string, data?: Record<string, unknown>) {
      if (shouldLog('info')) console.info(...formatArgs(module, message, data))
    },
    warn(message: string, data?: Record<string, unknown>) {
      if (shouldLog('warn')) console.warn(...formatArgs(module, message, data))
    },
    error(message: string, data?: Record<string, unknown>) {
      if (shouldLog('error')) console.error(...formatArgs(module, message, data))
    },
  }
}
