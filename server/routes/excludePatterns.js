import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await query(`SELECT pattern, reason FROM exclude_patterns ORDER BY id`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch exclude patterns' });
  }
});

router.put('/bulk', async (req, res) => {
  try {
    const patterns = req.body;
    await query('BEGIN');
    await query('DELETE FROM exclude_patterns');
    for (const p of patterns) {
      await query(
        `INSERT INTO exclude_patterns (pattern, reason) VALUES ($1, $2)`,
        [p.pattern, p.reason]
      );
    }
    await query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await query('ROLLBACK');
    res.status(500).json({ error: 'Failed to save exclude patterns' });
  }
});

export default router;
