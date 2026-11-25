import pg from 'pg';

const { Pool } = pg;

/**
 * One process-wide connection pool for every PostgreSQL consumer in the server.
 *
 * A single pool matters for more than tidiness: the mission store, the CRM
 * store and the read-only SQL console all target the same database, and
 * separate pools would multiply connections against a small dev instance for no
 * benefit.
 */
declare global {
  var _school76PgPool: pg.Pool | undefined;
}

export interface PgConfig {
  host: string;
  port: number;
  user: string;
  password: string | undefined;
  database: string;
}

/**
 * PostgreSQL is opt-in: the app still has to boot on a machine that has none.
 * All three of host, user and database must be present before we consider the
 * database configured, matching what the deployment documentation promises.
 */
export function getPgConfig(): PgConfig | null {
  const host = process.env.POSTGRES_HOST?.trim();
  const user = process.env.POSTGRES_USER?.trim();
  const database = process.env.POSTGRES_DB?.trim();
  if (!host || !user || !database) return null;

  return {
    host,
    port: Number(process.env.POSTGRES_PORT || 5432),
    user,
    password: process.env.POSTGRES_PASSWORD || undefined,
    database,
  };
}

export function isPgConfigured(): boolean {
  return getPgConfig() !== null;
}

export function getPool(): pg.Pool | null {
  const config = getPgConfig();
  if (!config) return null;

  if (!global._school76PgPool) {
    const pool = new Pool({
      ...config,
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    // An idle client error must never take the process down: the pool discards
    // the broken client and the next query opens a fresh one.
    pool.on('error', (err) => {
      console.warn('[PostgreSQL] Idle client notice:', err.message);
    });
    global._school76PgPool = pool;
  }
  return global._school76PgPool;
}

export async function closePool(): Promise<void> {
  if (global._school76PgPool) {
    const pool = global._school76PgPool;
    global._school76PgPool = undefined;
    await pool.end().catch(() => undefined);
  }
}

/** Human-readable one-liner used by health and status endpoints. */
export function describeTarget(): string {
  const config = getPgConfig();
  if (!config) return 'not configured';
  return `${config.user}@${config.host}:${config.port}/${config.database}`;
}
