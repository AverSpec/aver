import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { writeFileSync, renameSync, mkdirSync, existsSync, readFileSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'

// Module-level lock map keyed by file path.
// Two SafeJsonFile instances pointing at the same path share the lock.
const locks = new Map<string, Promise<void>>()

/**
 * Serialize async operations on the same key (file path).
 * Uses a Promise-chain: each call waits for the previous to finish.
 */
export function withLock(key: string, fn: () => Promise<void>): Promise<void> {
  const prev = locks.get(key) ?? Promise.resolve()
  const next = prev.then(fn, fn) // run fn regardless of prior rejection
  locks.set(key, next)
  next.then(() => {
    if (locks.get(key) === next) locks.delete(key)
  }, () => {
    if (locks.get(key) === next) locks.delete(key)
  })
  return next
}

/** @internal — exposed for testing only */
export function _testLockMapSize(): number {
  return locks.size
}

/**
 * Atomic write: write to temp file, then rename.
 * rename() is atomic on POSIX when source and target are on the same filesystem.
 */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const tmp = filePath + '.tmp'
  await writeFile(tmp, content, 'utf-8')
  await rename(tmp, filePath)
}

/**
 * Sync variant for stores that use sync I/O (RunStore).
 */
export function atomicWriteFileSync(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmp = filePath + '.tmp'
  writeFileSync(tmp, content, 'utf-8')
  renameSync(tmp, filePath)
}

// ------- PID-based cross-process lock ----------------------------------------

/** Track which lock files this process owns so we can clean up on exit. */
const ownedLockFiles = new Set<string>()

process.on('exit', () => {
  for (const lockPath of ownedLockFiles) {
    try { unlinkSync(lockPath) } catch { /* best-effort */ }
  }
})

/** Return true if a process with the given PID is alive. */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Maximum age (in ms) before a lock is considered stale, regardless of whether
 * the recorded PID is still alive. This handles PID reuse: the OS may assign
 * the same PID to an unrelated process after the original holder exits.
 *
 * @internal exported for testing only
 */
export const LOCK_STALE_MS = 30_000

/**
 * Shape of data stored in the `.pid` lock file.
 * @internal
 */
interface LockData {
  pid: number
  createdAt: number
}

/**
 * Parse a lock file's contents. Handles both the legacy format (plain PID
 * string) and the current JSON format `{ pid, createdAt }`.
 */
function parseLockFile(raw: string): LockData {
  const trimmed = raw.trim()
  // Legacy format: just a PID number
  if (/^\d+$/.test(trimmed)) {
    return { pid: parseInt(trimmed, 10), createdAt: 0 }
  }
  return JSON.parse(trimmed) as LockData
}

/**
 * Acquire a PID lock file for the given data file path.
 *
 * - If no lock file exists, write one with the current PID + timestamp.
 * - If a lock file exists and the recorded PID is this process, it's already held — fine.
 * - If the lock is older than LOCK_STALE_MS, consider it stale and take over
 *   (handles PID reuse by an unrelated process).
 * - If the recorded PID belongs to a dead process (stale lock), take over.
 * - If the recorded PID belongs to a live process and the lock is fresh, throw.
 *
 * @internal exported for testing only
 */
export function acquirePidLock(filePath: string): void {
  const lockPath = filePath + '.pid'
  const myPid = process.pid
  const now = Date.now()

  if (existsSync(lockPath)) {
    let lockData: LockData
    try {
      lockData = parseLockFile(readFileSync(lockPath, 'utf-8'))
    } catch {
      // Corrupt lock file — treat as stale.
      lockData = { pid: -1, createdAt: 0 }
    }

    if (lockData.pid === myPid) {
      // Already held by this process — refresh the timestamp.
      writeLockFile(lockPath, myPid, now)
      return
    }

    const age = now - lockData.createdAt
    const isStale = age >= LOCK_STALE_MS

    if (!isStale && isProcessAlive(lockData.pid)) {
      throw new Error(
        `SafeJsonFile: cannot acquire lock on "${filePath}" — ` +
        `process ${lockData.pid} already holds it and is still running. ` +
        `Only one process may mutate this file at a time.`
      )
    }

    // Stale lock (dead process or age exceeded) — take over.
  }

  writeLockFile(lockPath, myPid, now)
  ownedLockFiles.add(lockPath)
}

function writeLockFile(lockPath: string, pid: number, createdAt: number): void {
  mkdirSync(dirname(lockPath), { recursive: true })
  const data: LockData = { pid, createdAt }
  writeFileSync(lockPath, JSON.stringify(data), 'utf-8')
}

/** @internal exported for testing only */
export function releasePidLock(filePath: string): void {
  const lockPath = filePath + '.pid'
  ownedLockFiles.delete(lockPath)
  try { unlinkSync(lockPath) } catch { /* already gone */ }
}

// -----------------------------------------------------------------------------

/**
 * A JSON file with atomic writes and in-process mutex for safe concurrent access.
 * On the first `mutate()` call a `<filename>.pid` lock file is written so that
 * a second process attempting the same file will detect the conflict.
 *
 * - `read()` returns the file contents or a default value if the file doesn't exist.
 * - `write()` atomically writes the value (temp + rename).
 * - `mutate()` serializes read-modify-write operations under a mutex and holds the PID lock.
 */
export class SafeJsonFile<T> {
  constructor(
    private readonly filePath: string,
    private readonly defaultValue: () => T,
  ) {}

  async read(): Promise<T> {
    if (!existsSync(this.filePath)) return this.defaultValue()
    const content = await readFile(this.filePath, 'utf-8')
    return JSON.parse(content) as T
  }

  async write(value: T): Promise<void> {
    await atomicWriteFile(this.filePath, JSON.stringify(value, null, 2))
  }

  async mutate(fn: (current: T) => T): Promise<T> {
    // Acquire the cross-process PID lock before entering the in-process mutex.
    // This throws if another live process holds the lock.
    acquirePidLock(this.filePath)

    let result!: T
    await withLock(this.filePath, async () => {
      const current = await this.read()
      result = fn(current)
      await this.write(result)
    })
    return result
  }
}
