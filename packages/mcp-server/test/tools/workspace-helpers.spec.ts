import { describe, it, expect } from 'vitest'
import { validateProjectId } from '../../src/tools/workspace-helpers.js'

describe('validateProjectId', () => {
  it('accepts a simple alphanumeric id', () => {
    expect(validateProjectId('myproject')).toBe('myproject')
  })

  it('accepts ids with dashes', () => {
    expect(validateProjectId('my-project')).toBe('my-project')
  })

  it('accepts ids with underscores', () => {
    expect(validateProjectId('my_project')).toBe('my_project')
  })

  it('accepts ids with dots', () => {
    expect(validateProjectId('my.project')).toBe('my.project')
  })

  it('accepts ids with mixed safe characters', () => {
    expect(validateProjectId('My-Project_v2.1')).toBe('My-Project_v2.1')
  })

  it('accepts foo..bar (not path traversal)', () => {
    expect(validateProjectId('foo..bar')).toBe('foo..bar')
  })

  it('rejects empty string', () => {
    expect(() => validateProjectId('')).toThrow('projectId must not be empty')
  })

  it('rejects forward slash path traversal', () => {
    expect(() => validateProjectId('../../etc')).toThrow('path separators')
  })

  it('rejects backslash path traversal', () => {
    expect(() => validateProjectId('..\\..\\etc')).toThrow('path separators')
  })

  it('rejects embedded forward slash', () => {
    expect(() => validateProjectId('foo/bar')).toThrow('path separators')
  })

  it('rejects embedded backslash', () => {
    expect(() => validateProjectId('foo\\bar')).toThrow('path separators')
  })

  it('rejects standalone dot', () => {
    expect(() => validateProjectId('.')).toThrow('path traversal')
  })

  it('rejects standalone dot-dot', () => {
    expect(() => validateProjectId('..')).toThrow('path traversal')
  })

  it('rejects ids with spaces', () => {
    expect(() => validateProjectId('my project')).toThrow('invalid characters')
  })

  it('rejects ids with special characters', () => {
    expect(() => validateProjectId('project@home')).toThrow('invalid characters')
  })
})
