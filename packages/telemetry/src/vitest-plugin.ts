import { afterAll } from 'vitest'
import { getExtractionRegistry, isExtractionMode } from '@aver/core/internals'
import { extractContract } from './extract'
import { writeContracts } from './contract-io'
import { join } from 'node:path'

if (isExtractionMode()) {
  afterAll(async () => {
    const registry = getExtractionRegistry()
    for (const [domainName, domainResults] of registry) {
      if (!domainResults || domainResults.results.length === 0) continue
      try {
        const baseDir = join(process.cwd(), '.aver', 'contracts')
        const contract = extractContract({ domain: domainResults.domain, results: domainResults.results })
        if (contract.entries.length === 0) continue
        const paths = await writeContracts(contract, baseDir)
        console.log(`[aver] Extracted ${paths.length} contract(s) for "${domainName}" to ${baseDir}/${domainName}/`)
      } catch (err: any) {
        console.error(`[aver] Contract extraction failed for "${domainName}":`, err)
      }
    }
  })
}
