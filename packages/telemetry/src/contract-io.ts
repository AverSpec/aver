import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { BehavioralContract, ContractEntry } from './types'

/** On-disk format for a single contract entry. */
export interface ContractFile {
  version: 1
  domain: string
  testName: string
  extractedAt: string
  entry: ContractEntry
}

/** Slugify a test name for use as a filename. */
export function slugify(testName: string): string {
  return testName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}

/** Write all contract entries to per-example files. */
export async function writeContracts(
  contract: BehavioralContract,
  baseDir: string,
): Promise<string[]> {
  const domainDir = join(baseDir, contract.domain)
  await mkdir(domainDir, { recursive: true })

  const now = new Date().toISOString()
  const paths: string[] = []

  for (const entry of contract.entries) {
    const slug = slugify(entry.testName)
    const filePath = join(domainDir, `${slug}.contract.json`)

    const file: ContractFile = {
      version: 1,
      domain: contract.domain,
      testName: entry.testName,
      extractedAt: now,
      entry,
    }

    await writeFile(filePath, JSON.stringify(file, null, 2) + '\n', 'utf-8')
    paths.push(filePath)
  }

  return paths
}

/** Read all contract files from a directory, reconstruct BehavioralContracts grouped by domain. */
export async function readContracts(baseDir: string): Promise<BehavioralContract[]> {
  // Return empty if directory doesn't exist
  try {
    await stat(baseDir)
  } catch {
    return []
  }

  const subdirs = await readdir(baseDir, { withFileTypes: true })
  const domainMap = new Map<string, ContractEntry[]>()

  for (const dirent of subdirs) {
    if (!dirent.isDirectory()) continue

    const domainDir = join(baseDir, dirent.name)
    const files = await readdir(domainDir)

    for (const file of files) {
      if (!file.endsWith('.contract.json')) continue

      const { domain, entry } = await readContractFile(join(domainDir, file))

      let entries = domainMap.get(domain)
      if (!entries) {
        entries = []
        domainMap.set(domain, entries)
      }
      entries.push(entry)
    }
  }

  const contracts: BehavioralContract[] = []
  for (const [domain, entries] of domainMap) {
    contracts.push({ domain, entries })
  }

  return contracts
}

/** Read a single contract file with schema validation. */
export async function readContractFile(
  filePath: string,
): Promise<{ domain: string; entry: ContractEntry }> {
  const raw = await readFile(filePath, 'utf-8')

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Invalid JSON in contract file ${filePath}`)
  }

  const obj = parsed as Record<string, unknown>

  if (obj.version !== 1) {
    throw new Error(`Unsupported contract version ${obj.version} in ${filePath}`)
  }

  if (typeof obj.domain !== 'string' || obj.domain === '') {
    throw new Error(`Invalid contract file ${filePath}: missing domain`)
  }

  if (!obj.entry) {
    throw new Error(`Invalid contract file ${filePath}: missing entry`)
  }

  const entry = obj.entry as Record<string, unknown>

  if (typeof entry.testName !== 'string') {
    throw new Error(`Invalid contract file ${filePath}: missing entry.testName`)
  }

  if (!Array.isArray(entry.spans)) {
    throw new Error(`Invalid contract file ${filePath}: missing entry.spans`)
  }

  return { domain: obj.domain as string, entry: obj.entry as ContractEntry }
}
