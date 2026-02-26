/**
 * SQLite schema for the Aver agent database.
 * All tables auto-create on first connection.
 */

export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    goal TEXT,
    skill TEXT,
    permission TEXT,
    scenario_id TEXT,
    model TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    stage TEXT NOT NULL,
    confirmed_by TEXT,
    domain_id TEXT,
    questions TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    priority TEXT NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    referenced_at TEXT,
    superseded_by TEXT
  )`,

  `CREATE INDEX IF NOT EXISTS idx_observations_scope ON observations(scope)`,

  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    type TEXT NOT NULL,
    data TEXT,
    created_at TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)`,

  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    goal TEXT,
    status TEXT NOT NULL,
    token_usage TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
] as const
