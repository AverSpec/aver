import { describe, it, expect, vi } from 'vitest'
import { loadSkill } from '../../src/worker/skill-loader.js'

describe('loadSkill', () => {
  it('loads investigation skill', async () => {
    const content = await loadSkill('investigation')
    expect(content).toBeDefined()
    expect(content).toContain('Investigation')
    expect(content).toContain('Seam Types')
  })

  it('loads tdd-loop skill', async () => {
    const content = await loadSkill('tdd-loop')
    expect(content).toBeDefined()
    expect(content).toContain('Inner Loop')
    expect(content).toContain('Double Loop')
  })

  it('loads characterization skill', async () => {
    const content = await loadSkill('characterization')
    expect(content).toBeDefined()
    expect(content).toContain('Characterization')
  })

  it('loads scenario-mapping skill', async () => {
    const content = await loadSkill('scenario-mapping')
    expect(content).toBeDefined()
    expect(content).toContain('Scenario Mapping')
    expect(content).toContain('Example Mapping')
  })

  it('loads specification skill', async () => {
    const content = await loadSkill('specification')
    expect(content).toBeDefined()
    expect(content).toContain('Specification')
    expect(content).toContain('Naming Vocabulary')
  })

  it('returns undefined for unknown skill', async () => {
    const content = await loadSkill('nonexistent')
    expect(content).toBeUndefined()
  })

  it('warns on stderr when skill is not found', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await loadSkill('nonexistent')
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('could not load skill'),
    )
    warnSpy.mockRestore()
  })
})
