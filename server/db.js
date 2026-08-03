import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const sslConfig = () => {
  if (process.env.DB_SSL === 'false') return false;
  if (process.env.DB_SSL === 'true') return { rejectUnauthorized: false };
  // fallback: use SSL in production (Neon) but not for local/internal DBs
  return process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;
};

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig(),
});

pool.on('error', (err) => {
  console.error('Unexpected pool error (safe to ignore ECONNRESET):', err.message);
});

// Single-query helper — acquires and releases one client per call.
export async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// Transactional helper — all queries inside fn(client) run on ONE dedicated client.
// Automatically commits on success and rolls back on any thrown error.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Write a server-side audit entry. Never throws — audit failures must not block the operation.
export async function logAudit(userName, action, details) {
  const id = `H${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await query(
    `INSERT INTO history (id, timestamp, user_name, action, details)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
    [id, new Date().toISOString(), userName || 'system', action, details]
  ).catch(err => console.error('Audit log error:', err.message));
}
