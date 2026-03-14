import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { BehavioralContract, ContractEntry } from '../src/types'
import { slugify, writeContracts, readContracts, readContractFile } from '../src/contract-io'
import type { ContractFile } from '../src/contract-io'

// -- Fixtures --

const sampleEntry: ContractEntry = {
  testName: 'signup creates account',
  spans: [
    {
      name: 'user.signup',
      attributes: { 'user.email': { kind: 'correlated', symbol: '$email' } },
    },
    {
      name: 'account.created',
      attributes: { 'account.email': { kind: 'correlated', symbol: '$email' } },
      parentName: 'user.signup',
    },
  ],
}

const sampleContract: BehavioralContract = {
  domain: 'signup-flow',
  entries: [sampleEntry],
}

// -- Helpers --

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'aver-contract-io-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true })
  }
  tempDirs.length = 0
})

// -- Tests --

describe('slugify', () => {
  it('converts spaces to hyphens and lowercases', () => {
    expect(slugify('signup creates account')).toBe('signup-creates-account')
  })

  it('strips special characters', () => {
    expect(slugify("signup with 'special' chars & symbols!")).toBe(
      'signup-with-special-chars-symbols',
    )
  })

  it('collapses multiple hyphens', () => {
    expect(slugify('foo---bar   baz')).toBe('foo-bar-baz')
  })
})

describe('writeContracts', () => {
  it('writes per-example files to correct paths', async () => {
    const dir = await makeTempDir()
    const paths = await writeContracts(sampleContract, dir)

    expect(paths).toHaveLength(1)
    expect(paths[0]).toBe(join(dir, 'signup-flow', 'signup-creates-account.contract.json'))
  })

  it('file contains correct ContractFile JSON', async () => {
    const dir = await makeTempDir()
    await writeContracts(sampleContract, dir)

    const filePath = join(dir, 'signup-flow', 'signup-creates-account.contract.json')
    const raw = await readFile(filePath, 'utf-8')
    const parsed: ContractFile = JSON.parse(raw)

    expect(parsed.version).toBe(1)
    expect(parsed.domain).toBe('signup-flow')
    expect(parsed.testName).toBe('signup creates account')
    expect(parsed.extractedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(parsed.entry).toEqual(sampleEntry)
  })

  it('creates directories if they do not exist', async () => {
    const dir = await makeTempDir()
    const nested = join(dir, 'deeply', 'nested')
    // baseDir doesn't exist yet
    const paths = await writeContracts(sampleContract, nested)

    expect(paths).toHaveLength(1)
    const raw = await readFile(paths[0], 'utf-8')
    expect(JSON.parse(raw).version).toBe(1)
  })

  it('overwrites existing files (idempotent)', async () => {
    const dir = await makeTempDir()
    await writeContracts(sampleContract, dir)
    // Write again — should not throw
    const paths = await writeContracts(sampleContract, dir)
    expect(paths).toHaveLength(1)

    const raw = await readFile(paths[0], 'utf-8')
    expect(JSON.parse(raw).version).toBe(1)
  })

  it('returns list of written file paths', async () => {
    const dir = await makeTempDir()
    const multiContract: BehavioralContract = {
      domain: 'auth',
      entries: [
        { testName: 'login succeeds', spans: [] },
        { testName: 'login fails', spans: [] },
      ],
    }
    const paths = await writeContracts(multiContract, dir)
    expect(paths).toEqual([
      join(dir, 'auth', 'login-succeeds.contract.json'),
      join(dir, 'auth', 'login-fails.contract.json'),
    ])
  })
})

describe('readContracts', () => {
  it('reads back what writeContracts wrote', async () => {
    const dir = await makeTempDir()
    await writeContracts(sampleContract, dir)

    const contracts = await readContracts(dir)
    expect(contracts).toHaveLength(1)
    expect(contracts[0].domain).toBe('signup-flow')
    expect(contracts[0].entries).toHaveLength(1)
    expect(contracts[0].entries[0]).toEqual(sampleEntry)
  })

  it('returns empty array if directory does not exist', async () => {
    const dir = join(tmpdir(), 'aver-nonexistent-' + Date.now())
    const contracts = await readContracts(dir)
    expect(contracts).toEqual([])
  })

  it('handles multiple domains (multiple subdirectories)', async () => {
    const dir = await makeTempDir()

    const contractA: BehavioralContract = {
      domain: 'auth',
      entries: [{ testName: 'login works', spans: [] }],
    }
    const contractB: BehavioralContract = {
      domain: 'billing',
      entries: [{ testName: 'charge succeeds', spans: [] }],
    }

    await writeContracts(contractA, dir)
    await writeContracts(contractB, dir)

    const contracts = await readContracts(dir)
    expect(contracts).toHaveLength(2)

    const domains = contracts.map((c) => c.domain).sort()
    expect(domains).toEqual(['auth', 'billing'])

    const authContract = contracts.find((c) => c.domain === 'auth')!
    expect(authContract.entries).toHaveLength(1)
    expect(authContract.entries[0].testName).toBe('login works')
  })
})

describe('readContractFile', () => {
  it('reads a single file correctly', async () => {
    const dir = await makeTempDir()
    const paths = await writeContracts(sampleContract, dir)

    const result = await readContractFile(paths[0])
    expect(result.domain).toBe('signup-flow')
    expect(result.entry).toEqual(sampleEntry)
  })

  it('throws if file does not exist', async () => {
    await expect(readContractFile('/tmp/nonexistent.contract.json')).rejects.toThrow()
  })

  it('throws on invalid JSON', async () => {
    const dir = await makeTempDir()
    const filePath = join(dir, 'bad.contract.json')
    await writeFile(filePath, '{ not valid json !!!', 'utf-8')

    await expect(readContractFile(filePath)).rejects.toThrow('Invalid JSON')
  })

  it('throws on unsupported contract version', async () => {
    const dir = await makeTempDir()
    const filePath = join(dir, 'v2.contract.json')
    await writeFile(filePath, JSON.stringify({ version: 2, domain: 'x', entry: { testName: 'a', spans: [] } }), 'utf-8')

    await expect(readContractFile(filePath)).rejects.toThrow('Unsupported contract version')
  })

  it('throws when domain is missing', async () => {
    const dir = await makeTempDir()
    const filePath = join(dir, 'no-domain.contract.json')
    await writeFile(filePath, JSON.stringify({ version: 1, entry: { testName: 'a', spans: [] } }), 'utf-8')

    await expect(readContractFile(filePath)).rejects.toThrow('missing domain')
  })

  it('throws when entry is missing', async () => {
    const dir = await makeTempDir()
    const filePath = join(dir, 'no-entry.contract.json')
    await writeFile(filePath, JSON.stringify({ version: 1, domain: 'x' }), 'utf-8')

    await expect(readContractFile(filePath)).rejects.toThrow('missing entry')
  })

  it('throws when entry.testName is missing', async () => {
    const dir = await makeTempDir()
    const filePath = join(dir, 'no-testname.contract.json')
    await writeFile(filePath, JSON.stringify({ version: 1, domain: 'x', entry: { spans: [] } }), 'utf-8')

    await expect(readContractFile(filePath)).rejects.toThrow('missing entry.testName')
  })

  it('throws when entry.spans is not an array', async () => {
    const dir = await makeTempDir()
    const filePath = join(dir, 'bad-spans.contract.json')
    await writeFile(filePath, JSON.stringify({ version: 1, domain: 'x', entry: { testName: 'a', spans: 'not-array' } }), 'utf-8')

    await expect(readContractFile(filePath)).rejects.toThrow('missing entry.spans')
  })
})
