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

  writeFileSync(domainPath, `import { defineDomain, action, query, assertion } from 'aver'

export const ${name} = defineDomain({
  name: '${kebab}',
  actions: {
    // Actions change system state. Define the payload type.
    // myAction: action<{ name: string }>(),
  },
  queries: {
    // Queries read data. Define <Payload, Return> types.
    // myQuery: query<{ id: string }, MyType>(),
  },
  assertions: {
    // Assertions verify expected state. They throw on failure.
    // myAssertion: assertion<{ expected: string }>(),
  },
})
`)

  const adapterPath = join(dir, 'adapters', `${kebab}.${protocol}.ts`)
  writeFileSync(adapterPath, `import { implement, ${protocol} } from 'aver'
import { ${name} } from '../domains/${kebab}.js'

export const ${protocol}Adapter = implement(${name}, {
  protocol: ${protocol}(() => {
    // Return your app context here.
  }),
  actions: {
    // Add a handler for each action in your domain.
  },
  queries: {
    // Add a handler for each query in your domain.
  },
  assertions: {
    // Add a handler for each assertion in your domain.
  },
})
`)

  const testPath = join(dir, 'tests', `${kebab}.spec.ts`)
  writeFileSync(testPath, `import { suite } from 'aver'
import { ${name} } from '../domains/${kebab}.js'
import '../aver.config.js'

const { test } = suite(${name})

test('example test', async ({ act, query, assert }) => {
  // await act.myAction({ name: 'example' })
  // await assert.myAssertion({ expected: 'example' })
})
`)

  updateConfig(dir, name, kebab, protocol)
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

  config = config.replace(
    /adapters: \[(.*?)\]/s,
    (match, inner) => {
      const trimmed = inner.trim()
      if (trimmed === '') return `adapters: [${adapterName}]`
      return `adapters: [${trimmed}, ${adapterName}]`
    },
  )

  writeFileSync(configPath, config)
}
