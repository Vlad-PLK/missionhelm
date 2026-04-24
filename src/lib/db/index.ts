import Database from 'better-sqlite3';
import fs from 'fs';
import { schema } from './schema';
import { runMigrations, type MigrationRunReceipt } from './migrations';
import { runSchemaPreflight, type PreflightReceipt } from './inspection';
import { getDatabasePath } from '../branding';

let db: Database.Database | null = null;

export type DbStartupStatus = {
  ready: boolean;
  databasePath: string;
  initializedAt: string | null;
  isNewDatabase: boolean;
  migration: MigrationRunReceipt | null;
  preflight: PreflightReceipt | null;
  error?: string;
};

export class DbStartupError extends Error {
  constructor(message: string, readonly startupStatus: DbStartupStatus) {
    super(message);
    this.name = 'DbStartupError';
  }
}

let startupStatus: DbStartupStatus = {
  ready: false,
  databasePath: getDbPath(),
  initializedAt: null,
  isNewDatabase: false,
  migration: null,
  preflight: null,
};

function getDbPath(): string {
  return getDatabasePath();
}

export function getDb(): Database.Database {
  if (!db) {
    const databasePath = getDbPath();
    const isNewDb = !fs.existsSync(databasePath);

    startupStatus = {
      ready: false,
      databasePath,
      initializedAt: null,
      isNewDatabase: isNewDb,
      migration: null,
      preflight: null,
    };

    try {
      db = new Database(databasePath);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');

      // Initialize base schema (creates tables if they don't exist)
      db.exec(schema);

      const migration = runMigrations(db);
      const preflight = runSchemaPreflight(db);

      startupStatus = {
        ready: preflight.status !== 'failed',
        databasePath,
        initializedAt: new Date().toISOString(),
        isNewDatabase: isNewDb,
        migration,
        preflight,
        error: preflight.error,
      };

      if (isNewDb) {
        console.log('[DB] New database created at:', databasePath);
      }

      if (!startupStatus.ready) {
        throw new DbStartupError('Database schema preflight failed', startupStatus);
      }
    } catch (error) {
      startupStatus = {
        ...startupStatus,
        initializedAt: startupStatus.initializedAt ?? new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown database startup error',
      };

      if (db) {
        db.close();
        db = null;
      }

      if (error instanceof DbStartupError) {
        throw error;
      }

      throw new DbStartupError('Failed to initialize database', startupStatus);
    }
  }
  return db;
}

export function getDbStartupStatus(): DbStartupStatus {
  if (!db && !startupStatus.initializedAt) {
    try {
      getDb();
    } catch (error) {
      if (!(error instanceof DbStartupError)) {
        startupStatus = {
          ...startupStatus,
          databasePath: getDbPath(),
          initializedAt: startupStatus.initializedAt ?? new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown database startup error',
        };
      }
    }
  }

  return {
    ...startupStatus,
    databasePath: getDbPath(),
  };
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
  startupStatus = {
    ready: false,
    databasePath: getDbPath(),
    initializedAt: null,
    isNewDatabase: false,
    migration: null,
    preflight: null,
  };
}

// Type-safe query helpers
export function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql);
  return stmt.all(...params) as T[];
}

export function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  const stmt = getDb().prepare(sql);
  return stmt.get(...params) as T | undefined;
}

export function run(sql: string, params: unknown[] = []): Database.RunResult {
  const stmt = getDb().prepare(sql);
  return stmt.run(...params);
}

export function transaction<T>(fn: () => T): T {
  const db = getDb();
  return db.transaction(fn)();
}

// Export migration utilities for CLI use
export { runMigrations, getMigrationStatus } from './migrations';
