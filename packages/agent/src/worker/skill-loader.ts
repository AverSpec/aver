import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export interface SkillLoadWarning {
  skill: string
  message: string
  cause: unknown
}

export async function loadSkill(
  name: string,
): Promise<{ content: string } | { content: undefined; warning: SkillLoadWarning }> {
  try {
    const skillPath = require.resolve(`@aver/skills/${name}.md`)
    const content = await readFile(skillPath, 'utf-8')
    return { content }
  } catch (err: unknown) {
    const warning: SkillLoadWarning = {
      skill: name,
      message: `Could not load skill '${name}' from @aver/skills — worker will operate without methodology guidance`,
      cause: err,
    }
    return { content: undefined, warning }
  }
}
