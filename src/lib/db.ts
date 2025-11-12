import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { SessionRecord } from './types';

let db: Database.Database | null = null;

export function getDb() {
  if (!db) {
    db = new Database(process.env.SQLITE_PATH || 'data.sqlite');
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        createdAt INTEGER NOT NULL,
        name TEXT,
        email TEXT,
        income TEXT,
        askedFields TEXT
      );
    `);
    // Migrate existing sessions to add askedFields column if it doesn't exist
    try {
      db.exec(`ALTER TABLE sessions ADD COLUMN askedFields TEXT`);
    } catch (e) {
      // Column already exists, ignore
    }
  }
  return db;
}

export function createSession(): SessionRecord {
  const d = getDb();
  const id = randomUUID();
  const createdAt = Date.now();
  d.prepare(
    'INSERT INTO sessions (id, createdAt, askedFields) VALUES (?, ?, ?)' 
  ).run(id, createdAt, JSON.stringify([]));
  return { id, createdAt, name: null, email: null, income: null };
}

export function getSession(id: string): SessionRecord | null {
  const row = getDb()
    .prepare('SELECT id, createdAt, name, email, income, askedFields FROM sessions WHERE id = ?')
    .get(id) as any;
  if (!row) return null;
  const askedFields = row.askedFields ? JSON.parse(row.askedFields) : [];
  return { ...row, askedFields };
}

export function getAskedFields(id: string): string[] {
  const session = getSession(id);
  return (session as any)?.askedFields || [];
}

export function markFieldAsAsked(id: string, field: 'name' | 'email' | 'income'): void {
  const asked = getAskedFields(id);
  if (!asked.includes(field)) {
    asked.push(field);
    getDb()
      .prepare('UPDATE sessions SET askedFields = ? WHERE id = ?')
      .run(JSON.stringify(asked), id);
  }
}

export function upsertSessionFields(id: string, fields: Partial<Pick<SessionRecord, 'name' | 'email' | 'income'>>): void {
  const existing = getSession(id);
  if (!existing) {
    // create and apply fields
    const created = createSession();
    const merged = { ...created, ...fields };
    getDb()
      .prepare('UPDATE sessions SET name = ?, email = ?, income = ? WHERE id = ?')
      .run(merged.name ?? null, merged.email ?? null, merged.income ?? null, merged.id);
    return;
  }
  const merged = { ...existing, ...fields };
  getDb()
    .prepare('UPDATE sessions SET name = ?, email = ?, income = ? WHERE id = ?')
    .run(merged.name ?? null, merged.email ?? null, merged.income ?? null, id);
}

