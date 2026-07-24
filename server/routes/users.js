import { Router } from 'express';
import { query, logAudit } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import bcrypt from 'bcryptjs';

const router = Router();

// GET — never returns password_hash
router.get('/', async (req, res) => {
  const result = await query(
    `SELECT id, name, email, role, kam_name, rh_name, active FROM users ORDER BY name`
  );
  res.json(result.rows);
});

// POST — admin only
router.post('/', requireRole('admin'), async (req, res) => {
  const { ok, errors } = validate(req.body, {
    name:  { required: true, type: 'string', maxLength: 100 },
    email: { required: true, type: 'string', match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    role:  { required: true, oneOf: ['admin', 'rh', 'kam'] },
  });
  if (!ok) return res.status(400).json({ error: errors.join('; ') });
  try {
    const { id, name, email, role, kam_name, rh_name, password } = req.body;
    const userId = id || `U${Date.now()}`;
    const passwordHash = password ? await bcrypt.hash(password, 10) : await bcrypt.hash('Delta@123', 10);
    const result = await query(
      `INSERT INTO users (id, name, email, role, kam_name, rh_name, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, name, email, role, kam_name, rh_name, active`,
      [userId, name, email, role, kam_name || null, rh_name || null, passwordHash]
    );
    await logAudit(req.user?.email, 'other', `User created: ${name} (${role}) by ${req.user?.email}`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT — admin only; handles password reset too
router.put('/:id', requireRole('admin'), async (req, res) => {
  const { ok, errors } = validate(req.body, {
    name:  { required: true, type: 'string', maxLength: 100 },
    email: { required: true, type: 'string', match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    role:  { required: true, oneOf: ['admin', 'rh', 'kam'] },
  });
  if (!ok) return res.status(400).json({ error: errors.join('; ') });
  try {
    const { name, email, role, kam_name, rh_name, active, password } = req.body;
    if (password) {
      const newHash = await bcrypt.hash(password, 10);
      const result = await query(
        `UPDATE users SET name=$1, email=$2, role=$3, kam_name=$4, rh_name=$5, active=$6, password_hash=$7
         WHERE id=$8 RETURNING id, name, email, role, kam_name, rh_name, active`,
        [name, email, role, kam_name || null, rh_name || null, active !== false, newHash, req.params.id]
      );
      await logAudit(req.user?.email, 'other', `User updated: ${name} by ${req.user?.email}`);
      return res.json(result.rows[0]);
    }
    const result = await query(
      `UPDATE users SET name=$1, email=$2, role=$3, kam_name=$4, rh_name=$5, active=$6
       WHERE id=$7 RETURNING id, name, email, role, kam_name, rh_name, active`,
      [name, email, role, kam_name || null, rh_name || null, active !== false, req.params.id]
    );
    await logAudit(req.user?.email, 'other', `User updated: ${name} by ${req.user?.email}`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE — admin only; cannot delete self
router.delete('/:id', requireRole('admin'), async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
  const userRow = await query('SELECT name FROM users WHERE id=$1', [req.params.id]);
  await query(`DELETE FROM users WHERE id=$1`, [req.params.id]);
  await logAudit(req.user?.email, 'other', `User deleted: ${userRow.rows[0]?.name || req.params.id} by ${req.user?.email}`);
  res.json({ success: true });
});

export default router;
