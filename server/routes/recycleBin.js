import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  const result = await query(`SELECT * FROM recycle_bin ORDER BY deleted_at DESC`);
  res.json(result.rows);
});

router.post('/', async (req, res) => {
  const { bin_id, type, payload, deleted_at, deleted_by, reason } = req.body;
  await query(
    `INSERT INTO recycle_bin (bin_id, type, payload, deleted_at, deleted_by, reason) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (bin_id) DO NOTHING`,
    [bin_id, type, payload, deleted_at, deleted_by, reason || null]
  );
  res.json({ success: true });
});

router.delete('/clear', async (req, res) => {
  await query(`DELETE FROM recycle_bin`);
  res.json({ success: true });
});

router.delete('/:binId', async (req, res) => {
  await query(`DELETE FROM recycle_bin WHERE bin_id=$1`, [req.params.binId]);
  res.json({ success: true });
});

export default router;
