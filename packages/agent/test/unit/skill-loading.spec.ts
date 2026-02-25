import { describe, it, expect } from 'vitest'
import { loadSkill } from '../../src/worker/skill-loader.js'

describe('loadSkill', () => {
  it('loads investigation skill', async () => {
    const result = await loadSkill('investigation')
    expect(result.content).toBeDefined()
    expect(result.content).toContain('Investigation')
    expect(result.content).toContain('Seam Types')
  })

  it('loads tdd-loop skill', async () => {
    const result = await loadSkill('tdd-loop')
    expect(result.content).toBeDefined()
    expect(result.content).toContain('Inner Loop')
    expect(result.content).toContain('Double Loop')
  })

  it('loads characterization skill', async () => {
    const result = await loadSkill('characterization')
    expect(result.content).toBeDefined()
    expect(result.content).toContain('Characterization')
  })

  it('loads scenario-mapping skill', async () => {
    const result = await loadSkill('scenario-mapping')
    expect(result.content).toBeDefined()
    expect(result.content).toContain('Scenario Mapping')
    expect(result.content).toContain('Example Mapping')
  })

  it('loads specification skill', async () => {
    const result = await loadSkill('specification')
    expect(result.content).toBeDefined()
    expect(result.content).toContain('Specification')
    expect(result.content).toContain('Naming Vocabulary')
  })

  it('returns undefined content with structured warning for unknown skill', async () => {
    const result = await loadSkill('nonexistent')
    expect(result.content).toBeUndefined()
    expect('warning' in result).toBe(true)
    if ('warning' in result) {
      expect(result.warning.skill).toBe('nonexistent')
      expect(result.warning.message).toContain('Could not load skill')
      expect(result.warning.message).toContain('nonexistent')
      expect(result.warning.cause).toBeDefined()
    }
  })
})
