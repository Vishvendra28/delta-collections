import { Router } from 'express';
import { query } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 500, 2000);
  const result = await query(`SELECT * FROM history ORDER BY timestamp DESC LIMIT $1`, [limit]);
  res.json(result.rows);
});

// POST intentionally removed — history entries are written server-side only to prevent fake audit records.

// DELETE — admin only
router.delete('/', requireRole('admin'), async (req, res) => {
  await query(`DELETE FROM history`);
  res.json({ success: true });
});

export default router;
