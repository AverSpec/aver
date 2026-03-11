import { describe, it, expect, afterEach } from 'vitest'
import { suite } from '../../src/core/suite'
import { defineDomain } from '../../src/core/domain'
import { adapt } from '../../src/core/adapter'
import { action, query, assertion } from '../../src/core/markers'
import type { Protocol } from '../../src/core/protocol'

// --- Test fixtures ---

const adminCalls: string[] = []
const userCalls: string[] = []

const adminProtocol: Protocol<{ log: typeof adminCalls }> = {
  name: 'admin-proto',
  async setup() {
    adminCalls.length = 0
    return { log: adminCalls }
  },
  async teardown() {
    adminCalls.push('teardown')
  },
}

const userProtocol: Protocol<{ log: typeof userCalls }> = {
  name: 'user-proto',
  async setup() {
    userCalls.length = 0
    return { log: userCalls }
  },
  async teardown() {
    userCalls.push('teardown')
  },
}

const adminDomain = defineDomain({
  name: 'Admin',
  actions: {
    createProject: action<{ name: string }>(),
  },
  queries: {
    projectCount: query<number>(),
  },
  assertions: {
    projectExists: assertion<{ name: string }>(),
  },
})

const userDomain = defineDomain({
  name: 'User',
  actions: {
    addTask: action<{ project: string; title: string }>(),
  },
  queries: {
    taskCount: query<number>(),
  },
  assertions: {
    accessDenied: assertion<{ project: string }>(),
  },
})

const adminAdapter = adapt(adminDomain, {
  protocol: adminProtocol,
  actions: {
    createProject: async (ctx, { name }) => { ctx.log.push(`create:${name}`) },
  },
  queries: {
    projectCount: async () => 3,
  },
  assertions: {
    projectExists: async () => {},
  },
})

const userAdapter = adapt(userDomain, {
  protocol: userProtocol,
  actions: {
    addTask: async (ctx, { project, title }) => { ctx.log.push(`task:${project}:${title}`) },
  },
  queries: {
    taskCount: async () => 5,
  },
  assertions: {
    accessDenied: async () => {},
  },
})

// --- Tests ---

describe('suite(config) [composed]', () => {
  const originalTest = (globalThis as any).test
  const originalIt = (globalThis as any).it

  afterEach(() => {
    if (originalTest) (globalThis as any).test = originalTest
    if (originalIt) (globalThis as any).it = originalIt
    delete process.env.AVER_DOMAIN
  })

  describe('namespace dispatch', () => {
    const { test: composedTest } = suite({
      admin: [adminDomain, adminAdapter],
      user: [userDomain, userAdapter],
    })

    composedTest('each namespace dispatches to its own adapter', async ({ admin, user }) => {
      await admin.act.createProject({ name: 'Restricted' })
      await user.act.addTask({ project: 'Restricted', title: 'Task' })

      expect(adminCalls).toContain('create:Restricted')
      expect(userCalls).toContain('task:Restricted:Task')
    })

    composedTest('all domains write to single shared trace', async ({ admin, user, trace }) => {
      await admin.act.createProject({ name: 'P1' })
      await user.act.addTask({ project: 'P1', title: 'T1' })

      const t = trace()
      expect(t).toHaveLength(2)
      expect(t[0]).toMatchObject({ kind: 'action', name: 'createProject' })
      expect(t[1]).toMatchObject({ kind: 'action', name: 'addTask' })
    })

    composedTest('trace entries carry domainName', async ({ admin, user, trace }) => {
      await admin.act.createProject({ name: 'P1' })
      await user.act.addTask({ project: 'P1', title: 'T1' })

      const t = trace()
      expect(t[0].domainName).toBe('Admin')
      expect(t[1].domainName).toBe('User')
    })

    composedTest('given/when/then aliases work per namespace', async ({ admin, user, trace }) => {
      await admin.given.createProject({ name: 'Setup' })
      await user.when.addTask({ project: 'Setup', title: 'Trigger' })
      await user.then.accessDenied({ project: 'Setup' })

      const t = trace()
      expect(t[0]).toMatchObject({ kind: 'action', category: 'given', name: 'createProject', domainName: 'Admin' })
      expect(t[1]).toMatchObject({ kind: 'action', category: 'when', name: 'addTask', domainName: 'User' })
      expect(t[2]).toMatchObject({ kind: 'assertion', category: 'then', name: 'accessDenied', domainName: 'User' })
    })

    composedTest('query return values work per namespace', async ({ admin, user }) => {
      const projects = await admin.query.projectCount()
      const tasks = await user.query.taskCount()

      expect(projects).toBe(3)
      expect(tasks).toBe(5)
    })
  })

  describe('protocol lifecycle', () => {
    it('calls setup for all domains before test body', async () => {
      const order: string[] = []

      const proto1: Protocol<null> = {
        name: 'p1',
        async setup() { order.push('setup:p1'); return null },
        async teardown() { order.push('teardown:p1') },
      }
      const proto2: Protocol<null> = {
        name: 'p2',
        async setup() { order.push('setup:p2'); return null },
        async teardown() { order.push('teardown:p2') },
      }

      const d1 = defineDomain({ name: 'D1', actions: { go: action() }, queries: {}, assertions: {} })
      const d2 = defineDomain({ name: 'D2', actions: { go: action() }, queries: {}, assertions: {} })
      const a1 = adapt(d1, { protocol: proto1, actions: { go: async () => { order.push('body') } }, queries: {}, assertions: {} })
      const a2 = adapt(d2, { protocol: proto2, actions: { go: async () => {} }, queries: {}, assertions: {} })

      let pending: Promise<void> | undefined
      const fakeTest = (_name: string, fn: () => Promise<void>) => { pending = fn() }
      fakeTest.skip = () => {}
      ;(globalThis as any).test = fakeTest

      const { test: ct } = suite({ d1: [d1, a1], d2: [d2, a2] })
      ct('lifecycle test', async ({ d1: ns1 }) => {
        await ns1.act.go()
      })

      await pending
      expect(order).toEqual(['setup:p1', 'setup:p2', 'body', 'teardown:p2', 'teardown:p1'])
    })

    it('tears down all domains after test even on failure', async () => {
      const order: string[] = []

      const proto1: Protocol<null> = {
        name: 'p1',
        async setup() { return null },
        async teardown() { order.push('teardown:p1') },
      }
      const proto2: Protocol<null> = {
        name: 'p2',
        async setup() { return null },
        async teardown() { order.push('teardown:p2') },
      }

      const d1 = defineDomain({ name: 'D1', actions: { boom: action() }, queries: {}, assertions: {} })
      const d2 = defineDomain({ name: 'D2', actions: {}, queries: {}, assertions: {} })
      const a1 = adapt(d1, { protocol: proto1, actions: { boom: async () => { throw new Error('kaboom') } }, queries: {}, assertions: {} })
      const a2 = adapt(d2, { protocol: proto2, actions: {}, queries: {}, assertions: {} })

      let pending: Promise<void> | undefined
      const fakeTest = (_name: string, fn: () => Promise<void>) => { pending = fn() }
      fakeTest.skip = () => {}
      ;(globalThis as any).test = fakeTest

      const { test: ct } = suite({ d1: [d1, a1], d2: [d2, a2] })
      ct('failing test', async ({ d1: ns1 }) => {
        await ns1.act.boom()
      })

      await pending!.catch(() => {})
      expect(order).toContain('teardown:p1')
      expect(order).toContain('teardown:p2')
    })

    it('tears down in reverse order', async () => {
      const order: string[] = []

      const makeProto = (name: string): Protocol<null> => ({
        name,
        async setup() { return null },
        async teardown() { order.push(`teardown:${name}`) },
      })

      const d1 = defineDomain({ name: 'D1', actions: {}, queries: {}, assertions: {} })
      const d2 = defineDomain({ name: 'D2', actions: {}, queries: {}, assertions: {} })
      const d3 = defineDomain({ name: 'D3', actions: {}, queries: {}, assertions: {} })
      const a1 = adapt(d1, { protocol: makeProto('p1'), actions: {}, queries: {}, assertions: {} })
      const a2 = adapt(d2, { protocol: makeProto('p2'), actions: {}, queries: {}, assertions: {} })
      const a3 = adapt(d3, { protocol: makeProto('p3'), actions: {}, queries: {}, assertions: {} })

      let pending: Promise<void> | undefined
      const fakeTest = (_name: string, fn: () => Promise<void>) => { pending = fn() }
      fakeTest.skip = () => {}
      ;(globalThis as any).test = fakeTest

      const { test: ct } = suite({ d1: [d1, a1], d2: [d2, a2], d3: [d3, a3] })
      ct('order test', async () => {})

      await pending
      expect(order).toEqual(['teardown:p3', 'teardown:p2', 'teardown:p1'])
    })

    it('partial setup failure tears down already-setup protocols', async () => {
      const order: string[] = []

      const proto1: Protocol<null> = {
        name: 'p1',
        async setup() { order.push('setup:p1'); return null },
        async teardown() { order.push('teardown:p1') },
      }
      const proto2: Protocol<null> = {
        name: 'p2',
        async setup() { throw new Error('setup failed') },
        async teardown() { order.push('teardown:p2') },
      }

      const d1 = defineDomain({ name: 'D1', actions: {}, queries: {}, assertions: {} })
      const d2 = defineDomain({ name: 'D2', actions: {}, queries: {}, assertions: {} })
      const a1 = adapt(d1, { protocol: proto1, actions: {}, queries: {}, assertions: {} })
      const a2 = adapt(d2, { protocol: proto2, actions: {}, queries: {}, assertions: {} })

      let pending: Promise<void> | undefined
      const fakeTest = (_name: string, fn: () => Promise<void>) => { pending = fn() }
      fakeTest.skip = () => {}
      ;(globalThis as any).test = fakeTest

      const { test: ct } = suite({ d1: [d1, a1], d2: [d2, a2] })
      ct('partial setup test', async () => {})

      let caught: any
      await pending!.catch(e => { caught = e })
      expect(caught.message).toBe('setup failed')
      expect(order).toEqual(['setup:p1', 'teardown:p1'])
    })
  })

  describe('test modifiers', () => {
    it('.only / .skip / .each work via recursive Proxy', () => {
      const { test: ct } = suite({
        admin: [adminDomain, adminAdapter],
      })

      expect(typeof (ct as any).only).toBe('function')
      expect(typeof (ct as any).skip).toBe('function')
      expect(typeof (ct as any).each).toBe('function')
    })
  })

  describe('AVER_DOMAIN filtering', () => {
    it('skips when no domains match', () => {
      const calls: string[] = []
      const skipCalls: string[] = []
      const fakeTest = (name: string, _fn: any) => { calls.push(name) }
      fakeTest.skip = (name: string, _fn: any) => { skipCalls.push(name) }

      ;(globalThis as any).test = fakeTest

      process.env.AVER_DOMAIN = 'OtherDomain'
      const { test: ct } = suite({
        admin: [adminDomain, adminAdapter],
        user: [userDomain, userAdapter],
      })
      ct('filtered test', async () => {})

      expect(calls).toHaveLength(0)
      expect(skipCalls).toEqual(['filtered test'])
    })

    it('runs when any domain matches', () => {
      const calls: string[] = []
      const skipCalls: string[] = []
      const fakeTest = (name: string, _fn: any) => { calls.push(name) }
      fakeTest.skip = (name: string, _fn: any) => { skipCalls.push(name) }

      ;(globalThis as any).test = fakeTest

      process.env.AVER_DOMAIN = 'Admin'
      const { test: ct } = suite({
        admin: [adminDomain, adminAdapter],
        user: [userDomain, userAdapter],
      })
      ct('matching test', async () => {})

      expect(calls).toEqual(['matching test'])
      expect(skipCalls).toHaveLength(0)
    })
  })

  describe('error reporting', () => {
    it('error messages include merged multi-domain trace with domain names', async () => {
      let pending: Promise<void> | undefined
      const fakeTest = (_name: string, fn: () => Promise<void>) => { pending = fn() }
      fakeTest.skip = () => {}
      ;(globalThis as any).test = fakeTest

      const failDomain = defineDomain({
        name: 'FailDomain',
        actions: {},
        queries: {},
        assertions: { boom: assertion() },
      })
      const failAdapter = adapt(failDomain, {
        protocol: {
          name: 'fail-proto',
          async setup() { return {} },
          async teardown() {},
        },
        actions: {},
        queries: {},
        assertions: { boom: async () => { throw new Error('assertion failed') } },
      })

      const { test: ct } = suite({
        admin: [adminDomain, adminAdapter],
        fail: [failDomain, failAdapter],
      })
      ct('error trace test', async ({ admin, fail }) => {
        await admin.act.createProject({ name: 'P1' })
        await fail.assert.boom()
      })

      let caught: any
      await pending!.catch(e => { caught = e })
      expect(caught).toBeDefined()
      expect(caught.message).toContain('assertion failed')
      expect(caught.message).toContain('Action trace')
      expect(caught.message).toContain('Admin.createProject')
      expect(caught.message).toContain('FailDomain.boom')
    })
  })
})
