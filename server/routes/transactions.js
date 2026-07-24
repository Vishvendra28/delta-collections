import { Router } from 'express';
import { query, withTransaction, logAudit } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// GET /page?offset=0&limit=500 — paginated, returns { rows, total }
router.get('/page', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 500, 2000);
    const offset = parseInt(req.query.offset) || 0;
    const { bank, company, month } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (bank)    { params.push(bank);    where += ` AND bank = $${params.length}`; }
    if (company) { params.push(company); where += ` AND company = $${params.length}`; }
    if (month)   { params.push(month);   where += ` AND LEFT(date, 7) = $${params.length}`; }
    const countRes = await query(`SELECT COUNT(*) FROM transactions ${where}`, params);
    const total = parseInt(countRes.rows[0].count);
    params.push(limit, offset);
    const dataRes = await query(
      `SELECT * FROM transactions ${where} ORDER BY date DESC, created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ rows: dataRes.rows.map(toApi), total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transactions page' });
  }
});

// GET all transactions (optional ?bank=&company=&month= filters)
// Note: advise_data is excluded from this endpoint to avoid sending large blobs on every load.
// Fetch advise data separately via GET /api/advise-files/:txId.
router.get('/', async (req, res) => {
  try {
    const { bank, company, month } = req.query;
    let sql = `SELECT id, date, customer, bank, account, company, amount, ref_no, narration,
                      kam, rh, status, advise_status, advise_file, created_at,
                      exclude_reason, comment, fuzzy_hint
               FROM transactions WHERE 1=1`;
    const params = [];
    if (bank)    { params.push(bank);    sql += ` AND bank = $${params.length}`; }
    if (company) { params.push(company); sql += ` AND company = $${params.length}`; }
    if (month)   { params.push(month);   sql += ` AND LEFT(date, 7) = $${params.length}`; }
    sql += ` ORDER BY date DESC, created_at DESC LIMIT 5000`;
    const result = await query(sql, params);
    res.json(result.rows.map(toApi));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// POST /bulk — accepts snake_case array; uses a real DB transaction via withTransaction
router.post('/bulk', async (req, res) => {
  try {
    const txs = req.body;
    if (!Array.isArray(txs) || txs.length === 0) return res.json({ success: true, imported: 0 });

    // Validate each row — reject the entire batch on any bad row
    for (let i = 0; i < txs.length; i++) {
      const t = txs[i];
      const { ok, errors } = validate(t, {
        id:      { required: true, type: 'string' },
        date:    { required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        bank:    { required: true, type: 'string' },
        company: { required: true, type: 'string' },
        amount:  { required: true, type: 'number' },
      });
      if (!ok) return res.status(400).json({ error: `Row ${i + 1}: ${errors.join('; ')}` });
    }

    const imported = await withTransaction(async (client) => {
      let count = 0;
      for (const t of txs) {
        const result = await client.query(
          `INSERT INTO transactions
            (id, date, customer, bank, account, company, amount, ref_no, narration,
             kam, rh, status, advise_status, advise_file, created_at,
             exclude_reason, comment, fuzzy_hint)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
           ON CONFLICT (id) DO UPDATE SET
             status = EXCLUDED.status, customer = EXCLUDED.customer,
             kam = EXCLUDED.kam, rh = EXCLUDED.rh,
             exclude_reason = EXCLUDED.exclude_reason
           RETURNING id`,
          [t.id, t.date, t.customer || '', t.bank, t.account, t.company,
           t.amount, t.ref_no || '', t.narration || '',
           t.kam || '', t.rh || '', t.status || 'manual_review',
           t.advise_status || 'pending', t.advise_file || null,
           t.created_at, t.exclude_reason || null, t.comment || null, t.fuzzy_hint || null]
        );
        if (result.rowCount > 0) count++;
      }
      return count;
    });

    const firstTx = txs[0];
    await logAudit(
      req.user?.email, 'import',
      `Imported ${txs.length} transactions — ${firstTx?.bank || ''} / ${firstTx?.company || ''}`
    );

    res.json({ success: true, imported });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to import transactions' });
  }
});

// PATCH update single transaction — accepts snake_case fields
router.patch('/:id', async (req, res) => {
  try {
    const updates = req.body;
    const fields = [];
    const params = [];
    const allowed = ['customer', 'kam', 'rh', 'status', 'advise_status', 'advise_file',
                     'exclude_reason', 'comment', 'fuzzy_hint'];
    for (const col of allowed) {
      if (col in updates) {
        params.push(updates[col]);
        fields.push(`${col} = $${params.length}`);
      }
    }
    if (fields.length === 0) return res.json({ success: true });
    params.push(req.params.id);
    await query(`UPDATE transactions SET ${fields.join(', ')} WHERE id = $${params.length}`, params);

    if (updates.status === 'matched' && updates.customer) {
      await logAudit(req.user?.email, 'assign', `Transaction assigned to ${updates.customer} by ${req.user?.email}`);
    } else if (updates.status === 'excluded') {
      await logAudit(req.user?.email, 'reject', `Transaction rejected (${updates.exclude_reason || 'no reason'}) by ${req.user?.email}`);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// DELETE single transaction
router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM transactions WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

// DELETE /clear/by-bank-month — accepts query params (GET-style delete)
router.delete('/clear/by-bank-month', async (req, res) => {
  try {
    const { bank, month, company } = req.query;
    if (!bank || !month) return res.status(400).json({ error: 'bank and month required' });
    let sql = `DELETE FROM transactions WHERE bank = $1 AND LEFT(date, 7) = $2`;
    const params = [bank, month];
    if (company) { params.push(company); sql += ` AND company = $${params.length}`; }
    await query(sql, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear transactions' });
  }
});

// Returns snake_case — the frontend API client converts to camelCase
function toApi(row) {
  return {
    id: row.id,
    date: row.date,
    customer: row.customer,
    bank: row.bank,
    account: row.account,
    company: row.company,
    amount: parseFloat(row.amount),
    ref_no: row.ref_no,
    narration: row.narration,
    kam: row.kam,
    rh: row.rh,
    status: row.status,
    advise_status: row.advise_status,
    advise_file: row.advise_file,
    advise_data: row.advise_data,
    created_at: row.created_at,
    exclude_reason: row.exclude_reason,
    comment: row.comment,
    fuzzy_hint: row.fuzzy_hint,
  };
}

// Fix blank KAM/RH for matched transactions by joining against customers table
router.post('/fix-kam-rh', async (req, res) => {
  const result = await query(`
    UPDATE transactions t
    SET
      kam = c.kam,
      rh  = c.rh
    FROM customers c
    WHERE LOWER(TRIM(t.customer)) = LOWER(TRIM(c.name))
      AND t.customer <> ''
      AND (t.kam = '' OR t.rh = '' OR t.kam IS NULL OR t.rh IS NULL)
  `);
  res.json({ updated: result.rowCount });
});

// Diagnostic: find transactions with blank KAM/RH and explain why
router.get('/kam-rh-diagnostic', async (req, res) => {
  // Group 1: customer is in transactions but NOT in customer master at all
  const notInMaster = await query(`
    SELECT DISTINCT t.customer, COUNT(t.id) as txn_count
    FROM transactions t
    LEFT JOIN customers c ON LOWER(TRIM(t.customer)) = LOWER(TRIM(c.name))
    WHERE t.customer <> ''
      AND (t.kam = '' OR t.rh = '' OR t.kam IS NULL OR t.rh IS NULL)
      AND c.name IS NULL
    GROUP BY t.customer
    ORDER BY txn_count DESC
  `);

  // Group 2: customer IS in master but master has blank KAM or RH
  const masterBlank = await query(`
    SELECT DISTINCT c.name, c.kam, c.rh, COUNT(t.id) as txn_count
    FROM transactions t
    JOIN customers c ON LOWER(TRIM(t.customer)) = LOWER(TRIM(c.name))
    WHERE t.customer <> ''
      AND (t.kam = '' OR t.rh = '' OR t.kam IS NULL OR t.rh IS NULL)
      AND (c.kam = '' OR c.rh = '' OR c.kam IS NULL OR c.rh IS NULL)
    GROUP BY c.name, c.kam, c.rh
    ORDER BY txn_count DESC
  `);

  // Count of already-fixed (has KAM/RH)
  const fixed = await query(`
    SELECT COUNT(*) as count FROM transactions
    WHERE customer <> '' AND kam <> '' AND rh <> ''
  `);

  res.json({
    notInMaster: notInMaster.rows,
    masterBlank: masterBlank.rows,
    fixedCount: parseInt(fixed.rows[0].count),
  });
});

export default router;
