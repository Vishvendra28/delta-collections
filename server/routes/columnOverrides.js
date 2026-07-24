import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT bank, overrides FROM column_overrides');
    const map = {};
    result.rows.forEach(r => { map[r.bank] = r.overrides; });
    res.json(map);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch column overrides' });
  }
});

router.put('/', async (req, res) => {
  try {
    const map = req.body; // { "HDFC": { date: "...", narration: "..." }, ... }
    await query('BEGIN');
    await query('DELETE FROM column_overrides');
    for (const [bank, overrides] of Object.entries(map)) {
      await query(
        'INSERT INTO column_overrides (bank, overrides) VALUES ($1, $2)',
        [bank, JSON.stringify(overrides)]
      );
    }
    await query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await query('ROLLBACK');
    res.status(500).json({ error: 'Failed to save column overrides' });
  }
});

export default router;
