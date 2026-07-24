import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM company_scoped_excludes ORDER BY id`);
    res.json(result.rows.map(r => ({ id: r.id, pattern: r.pattern, company: r.company, reason: r.reason })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch company scoped excludes' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { id, pattern, company, reason } = req.body;
    await query(
      `INSERT INTO company_scoped_excludes (id, pattern, company, reason) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET pattern = EXCLUDED.pattern, company = EXCLUDED.company, reason = EXCLUDED.reason`,
      [id, pattern, company, reason]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save company scoped exclude' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { pattern, company, reason } = req.body;
    await query(
      `UPDATE company_scoped_excludes SET pattern = $1, company = $2, reason = $3 WHERE id = $4`,
      [pattern, company, reason, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update company scoped exclude' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM company_scoped_excludes WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete company scoped exclude' });
  }
});

export default router;
