import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT key, value FROM settings');
    const map = {};
    result.rows.forEach(r => { map[r.key] = r.value; });
    res.json(map);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.put('/', async (req, res) => {
  try {
    const map = req.body;
    await query('BEGIN');
    for (const [key, value] of Object.entries(map)) {
      await query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        [key, String(value)]
      );
    }
    await query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await query('ROLLBACK');
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

export default router;
