import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSkill } from '../../src/worker/skill-loader.js'

describe('loadSkill', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aver-skills-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('loads built-in investigation skill', async () => {
    const content = await loadSkill('investigation')
    expect(content).toContain('Investigation')
    expect(content).toContain('Do NOT modify any files')
  })

  it('loads built-in tdd-loop skill', async () => {
    const content = await loadSkill('tdd-loop')
    expect(content).toContain('TDD Loop')
    expect(content).toContain('failing aver acceptance test')
  })

  it('loads built-in characterization skill', async () => {
    const content = await loadSkill('characterization')
    expect(content).toContain('Characterization')
    expect(content).toContain('lock in existing behavior')
  })

  it('loads custom skill from override path', async () => {
    await writeFile(join(dir, 'investigation.md'), '## Custom Investigation\n\nDo something custom.')
    const content = await loadSkill('investigation', dir)
    expect(content).toContain('Custom Investigation')
    expect(content).not.toContain('Do NOT modify any files')
  })

  it('falls back to built-in when override path has no file', async () => {
    const content = await loadSkill('investigation', dir)
    expect(content).toContain('Investigation')
    expect(content).toContain('Do NOT modify any files')
  })

  it('returns undefined for unknown skill with no override', async () => {
    const content = await loadSkill('nonexistent')
    expect(content).toBeUndefined()
  })
})
