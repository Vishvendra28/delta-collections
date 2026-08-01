import { Router } from 'express';
import { query, withTransaction, logAudit } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// Get target rows for a KAM + month
router.get('/rows', async (req, res) => {
  const { kam, month } = req.query;
  if (!kam || !month) return res.status(400).json({ error: 'kam and month required' });
  const result = await query(
    `SELECT * FROM targets WHERE kam_name=$1 AND month_year=$2 ORDER BY customer`,
    [kam, month]
  );
  res.json(result.rows);
});

// Get target meta for a KAM + month
router.get('/meta', async (req, res) => {
  const { kam, month } = req.query;
  if (!kam || !month) return res.status(400).json({ error: 'kam and month required' });
  const result = await query(
    `SELECT * FROM target_meta WHERE kam_name=$1 AND month_year=$2`,
    [kam, month]
  );
  res.json(result.rows[0] || null);
});

// Get all distinct KAM+month combos that have target data
router.get('/available', async (req, res) => {
  const result = await query(
    `SELECT kam_name, month_year, uploaded_at, uploaded_by, row_count FROM target_meta ORDER BY month_year DESC, kam_name`
  );
  res.json(result.rows);
});

// Upload / replace target for a KAM + month — admin only
router.post('/upload', requireRole('admin'), async (req, res) => {
  const { kam_name, month_year, rows, uploaded_by, file_base64 } = req.body;
  if (!kam_name || !month_year || !rows || !uploaded_by) {
    return res.status(400).json({ error: 'kam_name, month_year, rows, uploaded_by required' });
  }
  const uploaded_at = new Date().toISOString();

  await withTransaction(async (client) => {
    await client.query(`DELETE FROM targets WHERE kam_name=$1 AND month_year=$2`, [kam_name, month_year]);
    for (const row of rows) {
      await client.query(
        `INSERT INTO targets (kam_name, month_year, customer, p1, p2, p3, total_amount, uploaded_at, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [kam_name, month_year, row.customer, row.p1 || 0, row.p2 || 0, row.p3 || 0, row.total_amount || 0, uploaded_at, uploaded_by]
      );
    }
    await client.query(
      `INSERT INTO target_meta (kam_name, month_year, uploaded_at, uploaded_by, row_count, file_base64)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (kam_name, month_year) DO UPDATE
       SET uploaded_at=$3, uploaded_by=$4, row_count=$5, file_base64=$6`,
      [kam_name, month_year, uploaded_at, uploaded_by, rows.length, file_base64 || null]
    );
  });

  await logAudit(uploaded_by, 'other', `Target uploaded for ${kam_name} / ${month_year} (${rows.length} rows)`);
  res.json({ success: true, count: rows.length });
});

// Delete target for a KAM + month — admin only
router.delete('/', requireRole('admin'), async (req, res) => {
  const { kam, month } = req.query;
  if (!kam || !month) return res.status(400).json({ error: 'kam and month required' });
  await query(`DELETE FROM targets WHERE kam_name=$1 AND month_year=$2`, [kam, month]);
  await query(`DELETE FROM target_meta WHERE kam_name=$1 AND month_year=$2`, [kam, month]);
  res.json({ success: true });
});

export default router;
