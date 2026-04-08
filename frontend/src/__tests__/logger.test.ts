import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createLogger } from '../utils/logger'

describe('createLogger', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a logger with all methods', () => {
    const logger = createLogger('test-module')
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
  })

  it('debug logs with module prefix', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const logger = createLogger('mymodule')
    logger.debug('hello')
    expect(spy).toHaveBeenCalledWith('[mymodule]', 'hello')
  })

  it('info logs with module prefix', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const logger = createLogger('mymodule')
    logger.info('info message')
    expect(spy).toHaveBeenCalledWith('[mymodule]', 'info message')
  })

  it('warn logs with module prefix', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logger = createLogger('mymodule')
    logger.warn('warning')
    expect(spy).toHaveBeenCalledWith('[mymodule]', 'warning')
  })

  it('error logs with module prefix and data', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = createLogger('mymodule')
    logger.error('boom', { code: 500 })
    expect(spy).toHaveBeenCalledWith('[mymodule]', 'boom', { code: 500 })
  })

  it('debug logs with data', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const logger = createLogger('test')
    logger.debug('msg', { key: 'value' })
    expect(spy).toHaveBeenCalledWith('[test]', 'msg', { key: 'value' })
  })

  it('info logs without data', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const logger = createLogger('test')
    logger.info('just text')
    expect(spy).toHaveBeenCalledWith('[test]', 'just text')
  })

  it('warn logs with data', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logger = createLogger('test')
    logger.warn('warning', { detail: 'x' })
    expect(spy).toHaveBeenCalledWith('[test]', 'warning', { detail: 'x' })
  })

  it('info logs with data', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const logger = createLogger('test')
    logger.info('info', { count: 42 })
    expect(spy).toHaveBeenCalledWith('[test]', 'info', { count: 42 })
  })
})
