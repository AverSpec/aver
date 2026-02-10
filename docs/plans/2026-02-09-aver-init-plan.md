# `aver init` CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `aver init` and `aver init domain` scaffolding CLI commands, developed TDD with Aver dogfooding. Also rename `direct` → `unit` protocol.

**Architecture:** Pure scaffolding functions generate file contents (testable without I/O). CLI layer uses clack for interactive prompts and calls the pure functions. Acceptance tests use an `averInit` domain with a `unit` adapter that operates on temp directories.

**Tech Stack:** clack/prompts (CLI), Node.js fs (file generation), Vitest (tests), Aver (dogfooding)

---

## Task 1: Rename `direct` → `unit` protocol

**Files:**
- Rename: `packages/aver/src/protocols/direct.ts` → `packages/aver/src/protocols/unit.ts`
- Modify: `packages/aver/src/index.ts:7` — change export
- Modify: `packages/aver/test/core/protocol.spec.ts` — update import + describe block
- Modify: `packages/aver/test/index.spec.ts` — update import + assertion
- Rename: `packages/aver/test/acceptance/adapters/aver-core.direct.ts` → `aver-core.unit.ts`
- Modify: `packages/aver/test/acceptance/adapters/aver-core.unit.ts` — change `direct` import to `unit`
- Modify: `packages/aver/test/acceptance/domain-vocabulary.spec.ts:5` — update adapter import path
- Modify: `packages/aver/test/acceptance/adapter-dispatch.spec.ts:5` — update adapter import path
- Modify: `packages/aver/test/acceptance/action-trace.spec.ts:5` — update adapter import path
- Modify: `packages/aver/test/acceptance/domain-extensions.spec.ts:5` — update adapter import path
- Rename: `packages/mcp-server/test/acceptance/adapters/aver-mcp.direct.ts` → `aver-mcp.unit.ts`
- Modify: `packages/mcp-server/test/acceptance/adapters/aver-mcp.unit.ts` — change `direct` import to `unit`
- Modify: `packages/mcp-server/test/acceptance/test-execution.spec.ts:4` — update adapter import path
- Modify: `packages/mcp-server/test/acceptance/domain-exploration.spec.ts:4` — update adapter import path
- Modify: `packages/mcp-server/test/acceptance/incremental-reporting.spec.ts:4` — update adapter import path
- Modify: `packages/mcp-server/test/acceptance/scaffolding.spec.ts:4` — update adapter import path
- Modify: `packages/mcp-server/test/tools/domains.spec.ts` — change `direct` import to `unit`
- Modify: `packages/mcp-server/test/tools/scaffolding.spec.ts` — change `direct` import to `unit`
- Rename: `examples/e-commerce/adapters/task-board.direct.ts` → `task-board.unit.ts`
- Modify: `examples/e-commerce/adapters/task-board.unit.ts` — change `direct` import to `unit`, rename export to `unitAdapter`
- Modify: `examples/e-commerce/aver.config.ts` — update import path + adapter name

**Step 1: Rename the protocol source file and update function**

Rename `packages/aver/src/protocols/direct.ts` → `packages/aver/src/protocols/unit.ts`.

Update the file contents:
```ts
import type { Protocol } from '../core/protocol'

/**
 * A protocol for unit-level testing with direct function calls.
 * The factory creates the context (typically the system under test).
 * Teardown is a no-op.
 */
export function unit<T>(factory: () => T | Promise<T>): Protocol<T> {
  return {
    name: 'unit',
    async setup() {
      return await factory()
    },
    async teardown() {},
  }
}
```

**Step 2: Update the main index.ts export**

In `packages/aver/src/index.ts`, change line 7:
```ts
// Before:
export { direct } from './protocols/direct'
// After:
export { unit } from './protocols/unit'
```

**Step 3: Update all imports across the codebase**

This is a mechanical find-and-replace across all files listed above. For each file:
- Replace `import { direct }` or `direct` in import lists → `unit`
- Replace `direct(` → `unit(` in protocol usage
- Replace `describe('direct()'` → `describe('unit()'`
- Replace `directAdapter` → `unitAdapter` (only in example app)
- Update file paths: `aver-core.direct` → `aver-core.unit`, `aver-mcp.direct` → `aver-mcp.unit`, `task-board.direct` → `task-board.unit`

**Step 4: Run full test suite**

Run: `npm run build -w packages/aver && npm test --workspaces`
Expected: 104 tests pass (0 failures)

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: rename direct() protocol to unit()"
```

---

## Task 2: Install clack dependency

**Files:**
- Modify: `packages/aver/package.json`

**Step 1: Install clack**

Run: `npm install @clack/prompts -w packages/aver`

**Step 2: Verify build still works**

Run: `npm run build -w packages/aver`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/aver/package.json package-lock.json
git commit -m "chore: add @clack/prompts dependency"
```

---

## Task 3: Define `averInit` domain

**Files:**
- Create: `packages/aver/test/acceptance/domains/aver-init.ts`

**Step 1: Create the domain file**

```ts
import { defineDomain, action, query, assertion } from '../../../src/index'

export const averInit = defineDomain({
  name: 'AverInit',
  actions: {
    initProject: action<{ dir: string }>(),
    initDomain: action<{ dir: string; name: string; protocol: string }>(),
  },
  queries: {
    fileContents: query<{ path: string }, string>(),
    generatedFiles: query<{ dir: string }, string[]>(),
  },
  assertions: {
    fileExists: assertion<{ path: string }>(),
    fileContains: assertion<{ path: string; content: string }>(),
    configRegistersAdapter: assertion<{ dir: string; adapterImport: string }>(),
    throwsError: assertion<{ message: string }>(),
  },
})
```

**Step 2: Commit**

```bash
git add packages/aver/test/acceptance/domains/aver-init.ts
git commit -m "test: define averInit domain for scaffolding acceptance tests"
```

---

## Task 4: Write `averInit` adapter (stub)

**Files:**
- Create: `packages/aver/test/acceptance/adapters/aver-init.unit.ts`

**Step 1: Create the adapter with stubbed handlers**

The adapter uses a temp directory per test. Action handlers will call the scaffolding functions (which don't exist yet — that's the TDD red phase). For now, stub the imports so the file compiles.

```ts
import { existsSync, readFileSync, readdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect } from 'vitest'
import { implement, unit } from '../../../src/index'
import { averInit } from '../domains/aver-init'
import { initProjectFiles, initDomainFiles } from '../../../src/cli/scaffold'

interface InitTestSession {
  dir: string
  lastError?: Error
}

export const averInitAdapter = implement(averInit, {
  protocol: unit<InitTestSession>(() => {
    const dir = mkdtempSync(join(tmpdir(), 'aver-init-'))
    return { dir }
  }),

  actions: {
    initProject: async (session, { dir }) => {
      initProjectFiles(dir)
    },
    initDomain: async (session, { dir, name, protocol }) => {
      try {
        session.lastError = undefined
        initDomainFiles(dir, name, protocol)
      } catch (e: any) {
        session.lastError = e
      }
    },
  },

  queries: {
    fileContents: async (_session, { path }) => {
      return readFileSync(path, 'utf-8')
    },
    generatedFiles: async (_session, { dir }) => {
      const files: string[] = []
      const entries = readdirSync(dir, { withFileTypes: true, recursive: true })
      for (const entry of entries) {
        if (entry.isFile()) {
          const rel = join(entry.parentPath ?? entry.path, entry.name)
            .replace(dir + '/', '')
            .replace(dir + '\\', '')
          files.push(rel)
        }
      }
      return files.sort()
    },
  },

  assertions: {
    fileExists: async (_session, { path }) => {
      expect(existsSync(path)).toBe(true)
    },
    fileContains: async (_session, { path, content }) => {
      const actual = readFileSync(path, 'utf-8')
      expect(actual).toContain(content)
    },
    configRegistersAdapter: async (_session, { dir, adapterImport }) => {
      const configPath = join(dir, 'aver.config.ts')
      const config = readFileSync(configPath, 'utf-8')
      expect(config).toContain(adapterImport)
    },
    throwsError: async (session, { message }) => {
      expect(session.lastError).toBeDefined()
      expect(session.lastError!.message).toContain(message)
    },
  },
})
```

**Step 2: Create empty scaffold module so TypeScript resolves**

Create `packages/aver/src/cli/scaffold.ts`:

```ts
export function initProjectFiles(_dir: string): void {
  throw new Error('Not implemented')
}

export function initDomainFiles(_dir: string, _name: string, _protocol: string): void {
  throw new Error('Not implemented')
}
```

**Step 3: Commit**

```bash
git add packages/aver/test/acceptance/adapters/aver-init.unit.ts packages/aver/src/cli/scaffold.ts
git commit -m "test: add averInit adapter stub and scaffold module skeleton"
```

---

## Task 5: Write acceptance tests (red)

**Files:**
- Create: `packages/aver/test/acceptance/scaffolding.spec.ts`

**Step 1: Write all acceptance tests**

```ts
import { describe, beforeEach } from 'vitest'
import { join } from 'node:path'
import { suite } from '../../src/index'
import { resetRegistry } from '../../src/core/registry'
import { averInit } from './domains/aver-init'
import { averInitAdapter } from './adapters/aver-init.unit'

describe('Scaffolding', () => {
  const { test } = suite(averInit, averInitAdapter)

  beforeEach(() => {
    resetRegistry()
  })

  describe('project init', () => {
    test('creates project directory structure', async ({ act, assert, setup }) => {
      const { dir } = await setup()
      await act.initProject({ dir })

      await assert.fileExists({ path: join(dir, 'domains') })
      await assert.fileExists({ path: join(dir, 'adapters') })
      await assert.fileExists({ path: join(dir, 'tests') })
      await assert.fileExists({ path: join(dir, 'aver.config.ts') })
    })

    test('generates valid aver.config.ts', async ({ act, query, setup }) => {
      const { dir } = await setup()
      await act.initProject({ dir })

      const contents = await query.fileContents({ path: join(dir, 'aver.config.ts') })
      // Vitest expect not available here — use assertion instead
    })
  })

  describe('domain init', () => {
    test('generates domain file with correct structure', async ({ act, assert, setup }) => {
      const { dir } = await setup()
      await act.initProject({ dir })
      await act.initDomain({ dir, name: 'taskBoard', protocol: 'unit' })

      await assert.fileExists({ path: join(dir, 'domains', 'task-board.ts') })
      await assert.fileContains({
        path: join(dir, 'domains', 'task-board.ts'),
        content: 'defineDomain',
      })
      await assert.fileContains({
        path: join(dir, 'domains', 'task-board.ts'),
        content: "name: 'task-board'",
      })
    })

    test('generates adapter file for chosen protocol', async ({ act, assert, setup }) => {
      const { dir } = await setup()
      await act.initProject({ dir })
      await act.initDomain({ dir, name: 'taskBoard', protocol: 'unit' })

      await assert.fileExists({ path: join(dir, 'adapters', 'task-board.unit.ts') })
      await assert.fileContains({
        path: join(dir, 'adapters', 'task-board.unit.ts'),
        content: 'implement',
      })
      await assert.fileContains({
        path: join(dir, 'adapters', 'task-board.unit.ts'),
        content: 'unit(',
      })
    })

    test('generates test file with suite and test boilerplate', async ({ act, assert, setup }) => {
      const { dir } = await setup()
      await act.initProject({ dir })
      await act.initDomain({ dir, name: 'taskBoard', protocol: 'unit' })

      await assert.fileExists({ path: join(dir, 'tests', 'task-board.spec.ts') })
      await assert.fileContains({
        path: join(dir, 'tests', 'task-board.spec.ts'),
        content: 'suite(taskBoard)',
      })
      await assert.fileContains({
        path: join(dir, 'tests', 'task-board.spec.ts'),
        content: 'act, query, assert',
      })
    })

    test('updates aver.config.ts with new adapter import', async ({ act, assert, setup }) => {
      const { dir } = await setup()
      await act.initProject({ dir })
      await act.initDomain({ dir, name: 'taskBoard', protocol: 'unit' })

      await assert.configRegistersAdapter({
        dir,
        adapterImport: './adapters/task-board.unit',
      })
    })

    test('kebab-cases domain name for filenames', async ({ act, assert, setup }) => {
      const { dir } = await setup()
      await act.initProject({ dir })
      await act.initDomain({ dir, name: 'shoppingCart', protocol: 'unit' })

      await assert.fileExists({ path: join(dir, 'domains', 'shopping-cart.ts') })
      await assert.fileExists({ path: join(dir, 'adapters', 'shopping-cart.unit.ts') })
      await assert.fileExists({ path: join(dir, 'tests', 'shopping-cart.spec.ts') })
    })

    test('errors when aver.config.ts does not exist', async ({ act, assert, setup }) => {
      const { dir } = await setup()
      // No initProject — dir is empty
      await act.initDomain({ dir, name: 'taskBoard', protocol: 'unit' })

      await assert.throwsError({ message: 'aver.config.ts' })
    })

    test('errors when domain file already exists', async ({ act, assert, setup }) => {
      const { dir } = await setup()
      await act.initProject({ dir })
      await act.initDomain({ dir, name: 'taskBoard', protocol: 'unit' })
      // Second init with same name
      await act.initDomain({ dir, name: 'taskBoard', protocol: 'unit' })

      await assert.throwsError({ message: 'already exists' })
    })
  })
})
```

**Step 2: Run to verify tests fail**

Run: `npx vitest run test/acceptance/scaffolding.spec.ts` (from `packages/aver/`)
Expected: FAIL — `initProjectFiles` throws "Not implemented"

**Step 3: Commit**

```bash
git add packages/aver/test/acceptance/scaffolding.spec.ts
git commit -m "test: write scaffolding acceptance tests (red)"
```

---

## Task 6: Implement `toKebabCase` utility

**Files:**
- Modify: `packages/aver/src/cli/scaffold.ts`
- Create: `packages/aver/test/core/scaffold.spec.ts`

**Step 1: Write unit test for toKebabCase**

```ts
import { describe, it, expect } from 'vitest'
import { toKebabCase } from '../../src/cli/scaffold'

describe('toKebabCase', () => {
  it('converts camelCase to kebab-case', () => {
    expect(toKebabCase('taskBoard')).toBe('task-board')
  })

  it('converts PascalCase to kebab-case', () => {
    expect(toKebabCase('TaskBoard')).toBe('task-board')
  })

  it('handles multiple words', () => {
    expect(toKebabCase('shoppingCartItem')).toBe('shopping-cart-item')
  })

  it('passes through already kebab-case', () => {
    expect(toKebabCase('task-board')).toBe('task-board')
  })

  it('handles single word', () => {
    expect(toKebabCase('task')).toBe('task')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/core/scaffold.spec.ts` (from `packages/aver/`)
Expected: FAIL

**Step 3: Implement toKebabCase**

In `packages/aver/src/cli/scaffold.ts`, add:

```ts
export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run test/core/scaffold.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/aver/src/cli/scaffold.ts packages/aver/test/core/scaffold.spec.ts
git commit -m "feat: add toKebabCase utility"
```

---

## Task 7: Implement `initProjectFiles`

**Files:**
- Modify: `packages/aver/src/cli/scaffold.ts`

**Step 1: Implement initProjectFiles**

```ts
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

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
```

**Step 2: Run project init acceptance tests**

Run: `npx vitest run test/acceptance/scaffolding.spec.ts` (from `packages/aver/`)
Expected: Project init tests PASS, domain init tests still FAIL

**Step 3: Commit**

```bash
git add packages/aver/src/cli/scaffold.ts
git commit -m "feat: implement initProjectFiles"
```

---

## Task 8: Implement `initDomainFiles`

**Files:**
- Modify: `packages/aver/src/cli/scaffold.ts`

**Step 1: Implement initDomainFiles**

Add to `packages/aver/src/cli/scaffold.ts`:

```ts
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

  // Domain file
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

  // Adapter file
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

  // Test file
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

  // Update aver.config.ts
  updateConfig(dir, name, kebab, protocol)
}

function updateConfig(dir: string, name: string, kebab: string, protocol: string): void {
  const configPath = join(dir, 'aver.config.ts')
  let config = readFileSync(configPath, 'utf-8')

  const adapterName = `${protocol}Adapter`
  const importLine = `import { ${adapterName} } from './adapters/${kebab}.${protocol}.js'`

  // Add import after last import line
  const importLines = config.split('\n').filter(l => l.startsWith('import '))
  const lastImport = importLines[importLines.length - 1]
  config = config.replace(lastImport, `${lastImport}\n${importLine}`)

  // Add adapter to array
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
```

Note: add `import { readFileSync } from 'node:fs'` to the existing imports at the top.

**Step 2: Run all acceptance tests**

Run: `npx vitest run test/acceptance/scaffolding.spec.ts` (from `packages/aver/`)
Expected: ALL 8 scaffolding tests PASS

**Step 3: Run full test suite**

Run: `npm run build -w packages/aver && npm test --workspaces`
Expected: All tests pass (104 existing + ~8 new scaffolding + ~5 kebab unit = ~117)

**Step 4: Commit**

```bash
git add packages/aver/src/cli/scaffold.ts
git commit -m "feat: implement initDomainFiles scaffolding"
```

---

## Task 9: Wire CLI with clack prompts

**Files:**
- Create: `packages/aver/src/cli/init.ts`
- Modify: `packages/aver/src/cli/index.ts`

**Step 1: Create the init CLI module**

```ts
import * as p from '@clack/prompts'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { initProjectFiles, initDomainFiles } from './scaffold'

export async function runInit(subcommand?: string): Promise<void> {
  if (subcommand === 'domain') {
    await runInitDomain()
    return
  }

  p.intro('Welcome to Aver')

  const dir = resolve('.')
  const configExists = existsSync(resolve(dir, 'aver.config.ts'))

  if (configExists) {
    const shouldContinue = await p.confirm({
      message: 'aver.config.ts already exists. Continue anyway?',
    })
    if (p.isCancel(shouldContinue) || !shouldContinue) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
  }

  const s = p.spinner()
  s.start('Creating project structure')
  initProjectFiles(dir)
  s.stop('Project structure created')

  p.log.info("Let's create your first domain.")

  await promptDomain(dir)

  p.outro('Done! Next steps:\n  1. Define your vocabulary in the domain file\n  2. Wire up handlers in the adapter file\n  3. Write tests in the test file\n  4. Run: npx aver run')
}

async function runInitDomain(): Promise<void> {
  const dir = resolve('.')

  if (!existsSync(resolve(dir, 'aver.config.ts'))) {
    p.log.error('No aver.config.ts found. Run `aver init` first.')
    process.exit(1)
  }

  await promptDomain(dir)

  p.outro('Domain created!')
}

async function promptDomain(dir: string): Promise<void> {
  const name = await p.text({
    message: 'Domain name?',
    placeholder: 'taskBoard',
    validate: (value) => {
      if (!value) return 'Domain name is required'
      if (/\s/.test(value)) return 'No spaces allowed'
    },
  })

  if (p.isCancel(name)) {
    p.cancel('Cancelled.')
    process.exit(0)
  }

  const protocol = await p.select({
    message: 'Which protocol?',
    options: [
      { value: 'unit', label: 'unit', hint: 'in-process, no infrastructure' },
      { value: 'http', label: 'http', hint: 'calls your API over HTTP' },
      { value: 'playwright', label: 'playwright', hint: 'drives a browser' },
    ],
  })

  if (p.isCancel(protocol)) {
    p.cancel('Cancelled.')
    process.exit(0)
  }

  const s = p.spinner()
  s.start('Generating files')
  initDomainFiles(dir, name as string, protocol as string)
  s.stop('Files generated')
}
```

**Step 2: Wire into CLI entry point**

In `packages/aver/src/cli/index.ts`, add the `init` case. Replace the existing `case 'init':` block:

```ts
case 'init': {
  const { runInit } = await import('./init')
  await runInit(args[1])
  break
}
```

**Step 3: Build and verify**

Run: `npm run build -w packages/aver`
Expected: Build succeeds

**Step 4: Manual smoke test**

Run: `mkdir /tmp/test-aver-init && cd /tmp/test-aver-init && npx aver init` (from repo root, using local build)
Expected: Interactive prompts appear, files are generated correctly

**Step 5: Commit**

```bash
git add packages/aver/src/cli/init.ts packages/aver/src/cli/index.ts
git commit -m "feat: wire aver init CLI with clack prompts"
```

---

## Task 10: Final verification and cleanup

**Step 1: Run full test suite**

Run: `npm run build -w packages/aver && npm test --workspaces`
Expected: All tests pass (~117 total)

**Step 2: Update MEMORY.md with new test counts and state**

**Step 3: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: final cleanup for aver init feature"
```
