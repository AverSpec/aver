import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export async function loadSkill(name: string): Promise<string | undefined> {
  try {
    const skillPath = require.resolve(`@aver/skills/${name}.md`)
    return await readFile(skillPath, 'utf-8')
  } catch {
    console.warn(`aver: could not load skill '${name}' from @aver/skills — worker will operate without methodology guidance`)
    return undefined
  }
}
