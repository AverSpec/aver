import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { existsSync } from 'node:fs'
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
  return next
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

/**
 * A JSON file with atomic writes and in-process mutex for safe concurrent access.
 *
 * - `read()` returns the file contents or a default value if the file doesn't exist.
 * - `write()` atomically writes the value (temp + rename).
 * - `mutate()` serializes read-modify-write operations under a mutex.
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
    let result!: T
    await withLock(this.filePath, async () => {
      const current = await this.read()
      result = fn(current)
      await this.write(result)
    })
    return result
  }
}
