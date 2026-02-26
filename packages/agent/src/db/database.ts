import { createClient, type Client } from '@libsql/client'
import { SCHEMA_STATEMENTS } from './schema.js'

/**
 * Create a SQLite database connection, enable WAL mode, and run schema migrations.
 *
 * @param path - File path for the database, or ':memory:' for in-memory.
 * @returns A ready-to-use libsql Client.
 */
export async function createDatabase(path: string): Promise<Client> {
  const url = path === ':memory:' ? ':memory:' : `file:${path}`
  const client = createClient({ url })

  await client.execute('PRAGMA journal_mode=WAL')

  for (const stmt of SCHEMA_STATEMENTS) {
    await client.execute(stmt)
  }

  return client
}

/**
 * Close a database connection.
 */
export function closeDatabase(client: Client): void {
  client.close()
}
