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
    test('creates project directory structure', async ({ given, when, then, query }) => {
      const dir = await query.sessionDir()
      await when.initProject({ dir })

      await then.fileExists({ path: join(dir, 'domains') })
      await then.fileExists({ path: join(dir, 'adapters') })
      await then.fileExists({ path: join(dir, 'tests') })
      await then.fileExists({ path: join(dir, 'aver.config.ts') })
      await then.fileExists({ path: join(dir, 'vitest.config.ts') })
    })

    test('generates valid aver.config.ts', async ({ when, query }) => {
      const dir = await query.sessionDir()
      await when.initProject({ dir })

      await query.fileContents({ path: join(dir, 'aver.config.ts') })
    })
  })

  describe('domain init', () => {
    test('generates domain file with correct structure', async ({ given, when, then, query }) => {
      const dir = await query.sessionDir()
      await given.initProject({ dir })
      await when.initDomain({ dir, name: 'taskBoard', protocol: 'unit' })

      await then.fileExists({ path: join(dir, 'domains', 'task-board.ts') })
      await then.fileContains({
        path: join(dir, 'domains', 'task-board.ts'),
        content: 'defineDomain',
      })
      await then.fileContains({
        path: join(dir, 'domains', 'task-board.ts'),
        content: "name: 'task-board'",
      })
      await then.fileContains({
        path: join(dir, 'domains', 'task-board.ts'),
        content: 'create: action',
      })
    })

    test('generates adapter file for chosen protocol', async ({ given, when, then, query }) => {
      const dir = await query.sessionDir()
      await given.initProject({ dir })
      await when.initDomain({ dir, name: 'taskBoard', protocol: 'unit' })

      await then.fileExists({ path: join(dir, 'adapters', 'task-board.unit.ts') })
      await then.fileContains({
        path: join(dir, 'adapters', 'task-board.unit.ts'),
        content: 'adapt',
      })
      await then.fileContains({
        path: join(dir, 'adapters', 'task-board.unit.ts'),
        content: 'unit(',
      })
      await then.fileContains({
        path: join(dir, 'adapters', 'task-board.unit.ts'),
        content: 'create: async',
      })
    })

    test('generates test file with suite and test boilerplate', async ({ given, when, then, query }) => {
      const dir = await query.sessionDir()
      await given.initProject({ dir })
      await when.initDomain({ dir, name: 'taskBoard', protocol: 'unit' })

      await then.fileExists({ path: join(dir, 'tests', 'task-board.spec.ts') })
      await then.fileContains({
        path: join(dir, 'tests', 'task-board.spec.ts'),
        content: 'suite(taskBoard)',
      })
      await then.fileContains({
        path: join(dir, 'tests', 'task-board.spec.ts'),
        content: 'act, query, assert',
      })
      await then.fileContains({
        path: join(dir, 'tests', 'task-board.spec.ts'),
        content: "import '../aver.config'",
        shouldContain: false,
      })
      await then.fileContains({
        path: join(dir, 'tests', 'task-board.spec.ts'),
        content: 'act.create',
      })
    })

    test('updates aver.config.ts with new adapter import', async ({ given, when, then, query }) => {
      const dir = await query.sessionDir()
      await given.initProject({ dir })
      await when.initDomain({ dir, name: 'taskBoard', protocol: 'unit' })

      await then.configRegistersAdapter({
        dir,
        adapterImport: './adapters/task-board.unit',
      })
    })

    test('kebab-cases domain name for filenames', async ({ given, when, then, query }) => {
      const dir = await query.sessionDir()
      await given.initProject({ dir })
      await when.initDomain({ dir, name: 'shoppingCart', protocol: 'unit' })

      await then.fileExists({ path: join(dir, 'domains', 'shopping-cart.ts') })
      await then.fileExists({ path: join(dir, 'adapters', 'shopping-cart.unit.ts') })
      await then.fileExists({ path: join(dir, 'tests', 'shopping-cart.spec.ts') })
    })

    test('errors when aver.config.ts does not exist', async ({ when, then, query }) => {
      const dir = await query.sessionDir()
      await when.initDomain({ dir, name: 'taskBoard', protocol: 'unit' })

      await then.throwsError({ message: 'aver.config.ts' })
    })

    test('errors when domain file already exists', async ({ given, when, then, query }) => {
      const dir = await query.sessionDir()
      await given.initProject({ dir })
      await when.initDomain({ dir, name: 'taskBoard', protocol: 'unit' })
      await when.initDomain({ dir, name: 'taskBoard', protocol: 'unit' })

      await then.throwsError({ message: 'already exists' })
    })
  })
})
