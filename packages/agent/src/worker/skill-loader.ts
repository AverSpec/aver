import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BUILT_IN_DIR = join(__dirname, '..', 'skills')

export async function loadSkill(name: string, overridePath?: string): Promise<string | undefined> {
  // Try override path first
  if (overridePath) {
    try {
      return await readFile(join(overridePath, `${name}.md`), 'utf-8')
    } catch {
      // Fall through to built-in
    }
  }

  // Try built-in
  try {
    return await readFile(join(BUILT_IN_DIR, `${name}.md`), 'utf-8')
  } catch {
    return undefined
  }
}
