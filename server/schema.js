import { query } from './db.js';

export async function createTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      customer TEXT NOT NULL,
      keywords JSONB NOT NULL DEFAULT '[]',
      compound_rules JSONB NOT NULL DEFAULT '[]',
      exclude_keywords JSONB NOT NULL DEFAULT '[]',
      note TEXT,
      source TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS exclude_patterns (
      id SERIAL PRIMARY KEY,
      pattern TEXT NOT NULL UNIQUE,
      reason TEXT NOT NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS company_scoped_excludes (
      id TEXT PRIMARY KEY,
      pattern TEXT NOT NULL,
      company TEXT NOT NULL,
      reason TEXT NOT NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      kam TEXT NOT NULL,
      rh TEXT NOT NULL,
      to_pay_flag BOOLEAN NOT NULL DEFAULT false,
      active BOOLEAN NOT NULL DEFAULT true
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      customer TEXT NOT NULL DEFAULT '',
      bank TEXT NOT NULL,
      account TEXT NOT NULL,
      company TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      ref_no TEXT NOT NULL DEFAULT '',
      narration TEXT NOT NULL DEFAULT '',
      kam TEXT NOT NULL DEFAULT '',
      rh TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'manual_review',
      advise_status TEXT NOT NULL DEFAULT 'pending',
      advise_file TEXT,
      advise_data TEXT,
      created_at TEXT NOT NULL,
      exclude_reason TEXT,
      comment TEXT,
      fuzzy_hint TEXT
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      kam_name TEXT,
      rh_name TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      password_hash TEXT NOT NULL DEFAULT ''
    )
  `);

  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT ''`);

  await query(`
    CREATE TABLE IF NOT EXISTS targets (
      id SERIAL PRIMARY KEY,
      kam_name TEXT NOT NULL,
      month_year TEXT NOT NULL,
      customer TEXT NOT NULL,
      p1 NUMERIC NOT NULL DEFAULT 0,
      p2 NUMERIC NOT NULL DEFAULT 0,
      p3 NUMERIC NOT NULL DEFAULT 0,
      total_amount NUMERIC NOT NULL DEFAULT 0,
      uploaded_at TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      UNIQUE (kam_name, month_year, customer)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS target_meta (
      kam_name TEXT NOT NULL,
      month_year TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      file_base64 TEXT,
      PRIMARY KEY (kam_name, month_year)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS recycle_bin (
      bin_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload JSONB NOT NULL,
      deleted_at TEXT NOT NULL,
      deleted_by TEXT NOT NULL,
      reason TEXT
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS seed_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      key TEXT PRIMARY KEY,
      account_no TEXT NOT NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS column_overrides (
      bank TEXT PRIMARY KEY,
      overrides JSONB NOT NULL DEFAULT '{}'
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Advise files — stored separately to avoid returning large base64 blobs with every transaction load
  await query(`
    CREATE TABLE IF NOT EXISTS advise_files (
      tx_id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      file_data TEXT NOT NULL,
      uploaded_at TEXT NOT NULL
    )
  `);

  // Migrate existing advise_data from transactions table into advise_files
  await query(`
    INSERT INTO advise_files (tx_id, file_name, file_data, uploaded_at)
    SELECT id, COALESCE(advise_file, 'advise'), advise_data, created_at
    FROM transactions
    WHERE advise_data IS NOT NULL AND advise_data <> ''
    ON CONFLICT (tx_id) DO NOTHING
  `);

  // Performance indexes — critical once transaction volume grows
  await query(`CREATE INDEX IF NOT EXISTS idx_txn_bank_company ON transactions(bank, company)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(date)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_txn_status ON transactions(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_txn_customer ON transactions(customer)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_txn_ref_no ON transactions(ref_no) WHERE ref_no <> ''`);
  await query(`CREATE INDEX IF NOT EXISTS idx_txn_month ON transactions(LEFT(date, 7))`);
}
