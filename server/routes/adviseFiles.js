import { Router } from 'express';
import { query, logAudit } from '../db.js';

const router = Router();

// GET /api/advise-files/:txId — fetch advise file for a transaction
router.get('/:txId', async (req, res) => {
  try {
    const result = await query(
      `SELECT tx_id, file_name, file_data, uploaded_at FROM advise_files WHERE tx_id = $1`,
      [req.params.txId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'No advise file found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch advise file' });
  }
});

// POST /api/advise-files — upload or replace advise file for a transaction
router.post('/', async (req, res) => {
  try {
    const { tx_id, file_name, file_data } = req.body;
    if (!tx_id || !file_name || !file_data) {
      return res.status(400).json({ error: 'tx_id, file_name, and file_data are required' });
    }
    const uploaded_at = new Date().toISOString();
    await query(
      `INSERT INTO advise_files (tx_id, file_name, file_data, uploaded_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tx_id) DO UPDATE SET file_name = $2, file_data = $3, uploaded_at = $4`,
      [tx_id, file_name, file_data, uploaded_at]
    );

    // Also mark the transaction advise_status as uploaded
    await query(
      `UPDATE transactions SET advise_status = 'uploaded', advise_file = $1 WHERE id = $2`,
      [file_name, tx_id]
    );

    // Fetch customer info for the audit log
    const txRow = await query(`SELECT customer, amount, date FROM transactions WHERE id = $1`, [tx_id]);
    const tx = txRow.rows[0];
    await logAudit(
      req.user?.email, 'advise_uploaded',
      `Payment advise uploaded — ${tx?.customer || tx_id} ₹${tx?.amount || ''} ${tx?.date || ''} by ${req.user?.email}`
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save advise file' });
  }
});

// POST /api/advise-files/bulk — upload same file for multiple transactions
router.post('/bulk', async (req, res) => {
  try {
    const { tx_ids, file_name, file_data } = req.body;
    if (!Array.isArray(tx_ids) || tx_ids.length === 0 || !file_name || !file_data) {
      return res.status(400).json({ error: 'tx_ids (array), file_name, and file_data are required' });
    }
    const uploaded_at = new Date().toISOString();
    for (const tx_id of tx_ids) {
      await query(
        `INSERT INTO advise_files (tx_id, file_name, file_data, uploaded_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tx_id) DO UPDATE SET file_name = $2, file_data = $3, uploaded_at = $4`,
        [tx_id, file_name, file_data, uploaded_at]
      );
      await query(
        `UPDATE transactions SET advise_status = 'uploaded', advise_file = $1 WHERE id = $2`,
        [file_name, tx_id]
      );
    }
    await logAudit(
      req.user?.email, 'advise_uploaded',
      `Bulk payment advise uploaded for ${tx_ids.length} transactions by ${req.user?.email}`
    );
    res.json({ success: true, count: tx_ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk save advise files' });
  }
});

export default router;
