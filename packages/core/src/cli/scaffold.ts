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

  const configContent = `import { defineConfig } from '@averspec/core'

export default defineConfig({
  adapters: [],
})
`
  writeFileSync(join(dir, 'aver.config.ts'), configContent)

  const vitestConfigPath = join(dir, 'vitest.config.ts')
  if (!existsSync(vitestConfigPath)) {
    const vitestConfigContent = `import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./aver.config.ts'],
  },
})
`
    writeFileSync(vitestConfigPath, vitestConfigContent)
  }
}

export function initDomainFiles(dir: string, name: string, protocol: string): void {
  const kebab = toKebabCase(name)
  const configPath = join(dir, 'aver.config.ts')

  if (!existsSync(configPath)) {
    throw new Error('No aver.config.ts found. Run `aver init` first.')
  }

  const domainPath = join(dir, 'domains', `${kebab}.ts`)
  if (existsSync(domainPath)) {
    throw new Error(`Domain file already exists: domains/${kebab}.ts`)
  }

  writeFileSync(domainPath, `import { defineDomain, action, query, assertion } from '@averspec/core'

export const ${name} = defineDomain({
  name: '${kebab}',
  actions: {
    create: action<{ name: string }>(),
  },
  queries: {
    list: query<void, string[]>(),
  },
  assertions: {
    exists: assertion<{ name: string }>(),
  },
})
`)

  const adapterPath = join(dir, 'adapters', `${kebab}.${protocol}.ts`)
  writeFileSync(adapterPath, buildAdapterTemplate(name, kebab, protocol))

  const testPath = join(dir, 'tests', `${kebab}.spec.ts`)
  writeFileSync(testPath, `import { suite } from '@averspec/core'
import { ${name} } from '../domains/${kebab}.js'

const { test } = suite(${name})

test('create and verify', async ({ act, query, assert }) => {
  await act.create({ name: 'example' })
  const items = await query.list()
  await assert.exists({ name: 'example' })
})
`)

  updateConfig(dir, name, kebab, protocol)
}

function buildAdapterTemplate(name: string, kebab: string, protocol: string): string {
  const protocolImport = protocol === 'unit'
    ? `import { implement, unit } from '@averspec/core'`
    : protocol === 'http'
      ? `import { implement } from '@averspec/core'\nimport { http } from '@averspec/protocol-http'`
      : protocol === 'playwright'
        ? `import { implement } from '@averspec/core'\nimport { playwright } from '@averspec/protocol-playwright'`
        : `import { implement, ${protocol} } from '@averspec/core'`

  if (protocol === 'unit') {
    return `${protocolImport}
import { expect } from 'vitest'
import { ${name} } from '../domains/${kebab}.js'

export const unitAdapter = implement(${name}, {
  protocol: unit(() => {
    const items: string[] = []
    return { items }
  }),
  actions: {
    create: async (ctx, { name }) => {
      ctx.items.push(name)
    },
  },
  queries: {
    list: async (ctx) => {
      return [...ctx.items]
    },
  },
  assertions: {
    exists: async (ctx, { name }) => {
      expect(ctx.items).toContain(name)
    },
  },
})
`
  }

  return `${protocolImport}
import { ${name} } from '../domains/${kebab}.js'

export const ${protocol}Adapter = implement(${name}, {
  protocol: ${protocol}({
    // TODO: configure your ${protocol} protocol options (e.g., baseUrl)
  }),
  actions: {
    create: async (ctx, { name }) => {
      // TODO: implement create via ${protocol}
    },
  },
  queries: {
    list: async (ctx) => {
      // TODO: implement list via ${protocol}
      return []
    },
  },
  assertions: {
    exists: async (ctx, { name }) => {
      // TODO: implement exists via ${protocol}
    },
  },
})
`
}

function updateConfig(dir: string, name: string, kebab: string, protocol: string): void {
  const configPath = join(dir, 'aver.config.ts')
  let config = readFileSync(configPath, 'utf-8')

  const adapterName = `${protocol}Adapter`
  const importLine = `import { ${adapterName} } from './adapters/${kebab}.${protocol}.js'`

  const importLines = config.split('\n').filter(l => l.startsWith('import '))
  if (importLines.length > 0) {
    const lastImport = importLines[importLines.length - 1]
    config = config.replace(lastImport, `${lastImport}\n${importLine}`)
  } else {
    config = `${importLine}\n${config}`
  }

  const adaptersIdx = config.indexOf('adapters:')
  if (adaptersIdx === -1) {
    throw new Error('Could not find adapters: in aver.config.ts')
  }

  const openIdx = config.indexOf('[', adaptersIdx)
  if (openIdx === -1) {
    throw new Error('Could not find opening [ for adapters in aver.config.ts')
  }

  let depth = 1
  let closeIdx = -1
  for (let i = openIdx + 1; i < config.length; i++) {
    if (config[i] === '[') depth++
    else if (config[i] === ']') depth--
    if (depth === 0) {
      closeIdx = i
      break
    }
  }

  if (closeIdx === -1) {
    throw new Error('Could not find matching ] for adapters in aver.config.ts')
  }

  const inner = config.substring(openIdx + 1, closeIdx).trim()
  let newArrayContent: string
  if (inner === '') {
    newArrayContent = `[${adapterName}]`
  } else {
    const withoutTrailingComma = inner.replace(/,\s*$/, '')
    newArrayContent = `[${withoutTrailingComma}, ${adapterName}]`
  }

  config = config.substring(0, openIdx) + newArrayContent + config.substring(closeIdx + 1)

  writeFileSync(configPath, config)
}
