import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT key, account_no FROM bank_accounts ORDER BY key');
    const map = {};
    result.rows.forEach(r => { map[r.key] = r.account_no; });
    res.json(map);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bank accounts' });
  }
});

router.put('/', async (req, res) => {
  try {
    const map = req.body; // { "HDFC-Zast": "50200016511197", ... }
    await query('BEGIN');
    await query('DELETE FROM bank_accounts');
    for (const [key, account_no] of Object.entries(map)) {
      await query('INSERT INTO bank_accounts (key, account_no) VALUES ($1, $2)', [key, account_no]);
    }
    await query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await query('ROLLBACK');
    res.status(500).json({ error: 'Failed to save bank accounts' });
  }
});

export default router;
