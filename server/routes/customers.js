import { Router } from 'express';
import { query } from '../db.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM customers ORDER BY name`);
    res.json(result.rows.map(r => ({
      id: r.id,
      name: r.name,
      kam: r.kam,
      rh: r.rh,
      to_pay_flag: r.to_pay_flag,
      active: r.active,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

router.put('/bulk', async (req, res) => {
  try {
    const customers = req.body;
    await query('BEGIN');
    await query('DELETE FROM customers');
    for (const c of customers) {
      await query(
        `INSERT INTO customers (id, name, kam, rh, to_pay_flag, active) VALUES ($1, $2, $3, $4, $5, $6)`,
        [c.id, c.name, c.kam, c.rh, c.to_pay_flag ?? c.toPayFlag ?? false, c.active ?? true]
      );
    }
    await query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await query('ROLLBACK');
    res.status(500).json({ error: 'Failed to save customers' });
  }
});

router.post('/', async (req, res) => {
  const { ok, errors } = validate(req.body, {
    name: { required: true, type: 'string', maxLength: 200 },
  });
  if (!ok) return res.status(400).json({ error: errors.join('; ') });
  try {
    const { id, name, kam, rh, to_pay_flag, toPayFlag, active } = req.body;
    await query(
      `INSERT INTO customers (id, name, kam, rh, to_pay_flag, active) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, kam = EXCLUDED.kam, rh = EXCLUDED.rh,
       to_pay_flag = EXCLUDED.to_pay_flag, active = EXCLUDED.active`,
      [id, name, kam, rh, to_pay_flag ?? toPayFlag ?? false, active ?? true]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save customer' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM customers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

export default router;
