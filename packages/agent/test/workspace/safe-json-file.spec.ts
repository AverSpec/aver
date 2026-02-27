import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { existsSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SafeJsonFile, atomicWriteFile, atomicWriteFileSync, withLock, _testLockMapSize, acquirePidLock, releasePidLock } from '../../src/workspace/safe-json-file'

describe('SafeJsonFile', () => {
  let dir: string
  let filePath: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aver-safe-'))
    filePath = join(dir, 'test.json')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns default value when file does not exist', async () => {
    const file = new SafeJsonFile(filePath, () => ({ count: 0 }))
    const value = await file.read()
    expect(value).toEqual({ count: 0 })
  })

  it('writes and reads a value', async () => {
    const file = new SafeJsonFile(filePath, () => ({ count: 0 }))
    await file.write({ count: 42 })
    const value = await file.read()
    expect(value).toEqual({ count: 42 })
  })

  it('mutates value atomically', async () => {
    const file = new SafeJsonFile(filePath, () => ({ count: 0 }))
    await file.write({ count: 5 })
    const result = await file.mutate(v => ({ count: v.count + 1 }))
    expect(result).toEqual({ count: 6 })
    expect(await file.read()).toEqual({ count: 6 })
  })

  it('serializes concurrent mutate calls', async () => {
    const file = new SafeJsonFile(filePath, () => ({ count: 0 }))
    await file.write({ count: 0 })

    // Fire 20 concurrent increments
    const promises = Array.from({ length: 20 }, () =>
      file.mutate(v => ({ count: v.count + 1 }))
    )
    await Promise.all(promises)

    const final = await file.read()
    expect(final).toEqual({ count: 20 })
  })

  it('concurrent mutates produce correct final value even under contention', async () => {
    const file = new SafeJsonFile(filePath, () => ({ count: 0 }))
    await file.write({ count: 0 })

    // Fire many concurrent mutates — without the mutex, some increments would be lost
    const promises = Array.from({ length: 50 }, () =>
      file.mutate(v => ({ count: v.count + 1 }))
    )
    await Promise.all(promises)
    expect(await file.read()).toEqual({ count: 50 })
  })

  it('creates parent directories on write', async () => {
    const nestedPath = join(dir, 'a', 'b', 'c', 'nested.json')
    const file = new SafeJsonFile(nestedPath, () => ({ ok: true }))
    await file.write({ ok: true })
    expect(await file.read()).toEqual({ ok: true })
  })

  it('ignores stale .tmp file on read', async () => {
    const file = new SafeJsonFile(filePath, () => ({ count: 0 }))
    // Write the real file
    await file.write({ count: 10 })
    // Leave a stale tmp file
    await writeFile(filePath + '.tmp', '{"count": 999}', 'utf-8')
    // read() should return the real file contents
    expect(await file.read()).toEqual({ count: 10 })
  })

  it('overwrites stale .tmp file on next write', async () => {
    // Leave a stale tmp file
    await writeFile(filePath + '.tmp', 'stale', 'utf-8')
    const file = new SafeJsonFile(filePath, () => ({ count: 0 }))
    await file.write({ count: 1 })
    // tmp file should be gone (renamed to target)
    expect(await file.read()).toEqual({ count: 1 })
  })

  it('two instances sharing the same path share the lock', async () => {
    const file1 = new SafeJsonFile(filePath, () => ({ count: 0 }))
    const file2 = new SafeJsonFile(filePath, () => ({ count: 0 }))
    await file1.write({ count: 0 })

    const promises = [
      ...Array.from({ length: 5 }, () => file1.mutate(v => ({ count: v.count + 1 }))),
      ...Array.from({ length: 5 }, () => file2.mutate(v => ({ count: v.count + 1 }))),
    ]
    await Promise.all(promises)
    expect(await file1.read()).toEqual({ count: 10 })
  })
})

describe('atomicWriteFile', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aver-atomic-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('writes file atomically', async () => {
    const path = join(dir, 'test.txt')
    await atomicWriteFile(path, 'hello')
    const content = await readFile(path, 'utf-8')
    expect(content).toBe('hello')
    // tmp file should not linger
    expect(existsSync(path + '.tmp')).toBe(false)
  })

  it('creates parent directories', async () => {
    const path = join(dir, 'a', 'b', 'test.txt')
    await atomicWriteFile(path, 'nested')
    expect(await readFile(path, 'utf-8')).toBe('nested')
  })
})

describe('atomicWriteFileSync', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aver-atomic-sync-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('writes file atomically using sync APIs', async () => {
    const path = join(dir, 'test.txt')
    atomicWriteFileSync(path, 'sync-hello')
    const content = await readFile(path, 'utf-8')
    expect(content).toBe('sync-hello')
    expect(existsSync(path + '.tmp')).toBe(false)
  })
})

describe('withLock', () => {
  it('serializes operations on the same key', async () => {
    const order: number[] = []

    const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

    // First operation is slow, second is fast
    const p1 = withLock('test-key', async () => {
      await delay(30)
      order.push(1)
    })
    const p2 = withLock('test-key', async () => {
      order.push(2)
    })

    await Promise.all([p1, p2])
    expect(order).toEqual([1, 2]) // 1 finishes before 2 starts
  })

  it('allows parallel operations on different keys', async () => {
    const order: string[] = []

    const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

    const p1 = withLock('key-a', async () => {
      await delay(30)
      order.push('a')
    })
    const p2 = withLock('key-b', async () => {
      order.push('b')
    })

    await Promise.all([p1, p2])
    // b should finish before a (different keys, no serialization)
    expect(order).toEqual(['b', 'a'])
  })

  it('cleans up lock entries after operations complete', async () => {
    await withLock('cleanup-key', async () => {})
    // Allow microtask to run cleanup
    await new Promise(r => setTimeout(r, 0))
    expect(_testLockMapSize()).toBe(0)
  })
})

describe('PID lock', () => {
  let dir: string
  let filePath: string
  let lockPath: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aver-pid-'))
    filePath = join(dir, 'data.json')
    lockPath = filePath + '.pid'
  })

  afterEach(async () => {
    // Always release the lock before cleaning up the temp dir
    releasePidLock(filePath)
    await rm(dir, { recursive: true, force: true })
  })

  it('acquires the lock file on first mutate()', async () => {
    const file = new SafeJsonFile(filePath, () => ({ x: 0 }))
    await file.mutate(v => ({ x: v.x + 1 }))
    // Lock file should now exist and contain this process's PID
    expect(existsSync(lockPath)).toBe(true)
    const pid = parseInt(await readFile(lockPath, 'utf-8'), 10)
    expect(pid).toBe(process.pid)
  })

  it('acquirePidLock succeeds when no lock file exists', () => {
    expect(() => acquirePidLock(filePath)).not.toThrow()
    expect(existsSync(lockPath)).toBe(true)
    expect(parseInt(readFileSync(lockPath, 'utf-8').trim(), 10)).toBe(process.pid)
  })

  it('acquirePidLock succeeds when the same process already holds the lock', () => {
    acquirePidLock(filePath)
    // Calling again should not throw — this process already owns it
    expect(() => acquirePidLock(filePath)).not.toThrow()
  })

  it('takes over a stale lock from a dead process', () => {
    // Write a lock file with a PID that cannot possibly be alive (pid 0 is not a valid user process)
    // Use a very high PID that almost certainly does not exist
    const deadPid = 2_000_000_000
    writeFileSync(lockPath, String(deadPid), 'utf-8')

    // Should take over silently
    expect(() => acquirePidLock(filePath)).not.toThrow()
    // Lock file should now record our PID
    const pid = parseInt(readFileSync(lockPath, 'utf-8').trim(), 10)
    expect(pid).toBe(process.pid)
  })

  it('throws when an active process holds the lock', () => {
    // Use the current process's own PID but write it manually so acquirePidLock
    // thinks it was written by a *different* call — we simulate a foreign process
    // by writing a PID that is provably alive: process.pid itself.
    // We need to trick the check into thinking it is NOT our PID.
    // The simplest approach: write a PID we know is alive that is NOT process.pid.
    // process.ppid is our parent shell — it is always alive during a test run.
    const alivePid = process.ppid
    writeFileSync(lockPath, String(alivePid), 'utf-8')

    expect(() => acquirePidLock(filePath)).toThrow(
      /cannot acquire lock.*already holds it and is still running/
    )
  })

  it('releasePidLock removes the lock file', () => {
    acquirePidLock(filePath)
    expect(existsSync(lockPath)).toBe(true)
    releasePidLock(filePath)
    expect(existsSync(lockPath)).toBe(false)
  })
})
