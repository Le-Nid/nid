import { describe, it, expect, vi } from 'vitest'
import { extractPagination } from '../utils/pagination'
import { escapeIlike, notFound } from '../utils/db'

describe('extractPagination', () => {
  it('returns defaults for empty params', () => {
    const result = extractPagination({})
    expect(result).toEqual({ page: 1, limit: 50, offset: 0 })
  })

  it('parses page and limit', () => {
    const result = extractPagination({ page: '3', limit: '20' })
    expect(result).toEqual({ page: 3, limit: 20, offset: 40 })
  })

  it('caps limit at 100', () => {
    const result = extractPagination({ limit: '500' })
    expect(result.limit).toBe(100)
  })

  it('uses custom default limit', () => {
    const result = extractPagination({}, 25)
    expect(result.limit).toBe(25)
  })

  it('computes offset correctly for page 1', () => {
    const result = extractPagination({ page: '1', limit: '10' })
    expect(result.offset).toBe(0)
  })

  it('computes offset correctly for page 5', () => {
    const result = extractPagination({ page: '5', limit: '10' })
    expect(result.offset).toBe(40)
  })
})

describe('escapeIlike', () => {
  it('escapes percent sign', () => {
    expect(escapeIlike('50%')).toBe('50\\%')
  })

  it('escapes underscore', () => {
    expect(escapeIlike('hello_world')).toBe('hello\\_world')
  })

  it('escapes backslash', () => {
    expect(escapeIlike('path\\file')).toBe('path\\\\file')
  })

  it('escapes all special chars', () => {
    expect(escapeIlike('100%_done\\')).toBe('100\\%\\_done\\\\')
  })

  it('returns unchanged string without special chars', () => {
    expect(escapeIlike('hello world')).toBe('hello world')
  })
})

describe('notFound', () => {
  it('sends 404 with default message', () => {
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() }
    notFound(reply as any)
    expect(reply.code).toHaveBeenCalledWith(404)
    expect(reply.send).toHaveBeenCalledWith({ error: 'Not found' })
  })

  it('sends 404 with custom message', () => {
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() }
    notFound(reply as any, 'User not found')
    expect(reply.code).toHaveBeenCalledWith(404)
    expect(reply.send).toHaveBeenCalledWith({ error: 'User not found' })
  })
})
