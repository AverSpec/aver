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
    test('creates project directory structure', async ({ act, assert, query }) => {
      const dir = await query.sessionDir()
      await act.initProject({ dir })

      await assert.fileExists({ path: join(dir, 'domains') })
      await assert.fileExists({ path: join(dir, 'adapters') })
      await assert.fileExists({ path: join(dir, 'tests') })
      await assert.fileExists({ path: join(dir, 'aver.config.ts') })
      await assert.fileExists({ path: join(dir, 'vitest.config.ts') })
    })

    test('generates valid aver.config.ts', async ({ act, query }) => {
      const dir = await query.sessionDir()
      await act.initProject({ dir })

      await query.fileContents({ path: join(dir, 'aver.config.ts') })
    })
  })

  describe('domain init', () => {
    test('generates domain file with correct structure', async ({ act, assert, query }) => {
      const dir = await query.sessionDir()
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

    test('generates adapter file for chosen protocol', async ({ act, assert, query }) => {
      const dir = await query.sessionDir()
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

    test('generates test file with suite and test boilerplate', async ({ act, assert, query }) => {
      const dir = await query.sessionDir()
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
      await assert.fileContains({
        path: join(dir, 'tests', 'task-board.spec.ts'),
        content: "import '../aver.config'",
        shouldContain: false,
      })
    })

    test('updates aver.config.ts with new adapter import', async ({ act, assert, query }) => {
      const dir = await query.sessionDir()
      await act.initProject({ dir })
      await act.initDomain({ dir, name: 'taskBoard', protocol: 'unit' })

      await assert.configRegistersAdapter({
        dir,
        adapterImport: './adapters/task-board.unit',
      })
    })

    test('kebab-cases domain name for filenames', async ({ act, assert, query }) => {
      const dir = await query.sessionDir()
      await act.initProject({ dir })
      await act.initDomain({ dir, name: 'shoppingCart', protocol: 'unit' })

      await assert.fileExists({ path: join(dir, 'domains', 'shopping-cart.ts') })
      await assert.fileExists({ path: join(dir, 'adapters', 'shopping-cart.unit.ts') })
      await assert.fileExists({ path: join(dir, 'tests', 'shopping-cart.spec.ts') })
    })

    test('errors when aver.config.ts does not exist', async ({ act, assert, query }) => {
      const dir = await query.sessionDir()
      await act.initDomain({ dir, name: 'taskBoard', protocol: 'unit' })

      await assert.throwsError({ message: 'aver.config.ts' })
    })

    test('errors when domain file already exists', async ({ act, assert, query }) => {
      const dir = await query.sessionDir()
      await act.initProject({ dir })
      await act.initDomain({ dir, name: 'taskBoard', protocol: 'unit' })
      await act.initDomain({ dir, name: 'taskBoard', protocol: 'unit' })

      await assert.throwsError({ message: 'already exists' })
    })
  })
})
