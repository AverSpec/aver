import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

export function initProjectFiles(dir: string): void {
  mkdirSync(join(dir, 'domains'), { recursive: true })
  mkdirSync(join(dir, 'adapters'), { recursive: true })
  mkdirSync(join(dir, 'tests'), { recursive: true })

  const configContent = `import { defineConfig } from 'aver'

export default defineConfig({
  adapters: [],
})
`
  writeFileSync(join(dir, 'aver.config.ts'), configContent)
}

export function initDomainFiles(_dir: string, _name: string, _protocol: string): void {
  throw new Error('Not implemented')
}
