import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { JWT_SECRET } from '../middleware/auth.js';

const router = Router();
const JWT_EXPIRES = '24h';

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const result = await query('SELECT id, name, email, role, kam_name, rh_name, password_hash FROM users WHERE LOWER(email) = LOWER($1) AND active = true', [email]);
    const user = result.rows[0];

    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const passwordMatch = user.password_hash
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!passwordMatch) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        kam_name: user.kam_name,
        rh_name: user.rh_name,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Public — returns non-admin users for the name picker (no JWT required)
router.get('/users', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, role, kam_name, rh_name FROM users WHERE role != 'admin' AND active = true ORDER BY name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// Public — issues a JWT for a non-admin user without requiring a password
router.post('/select-user', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const result = await query(
      `SELECT id, name, email, role, kam_name, rh_name FROM users WHERE id = $1 AND active = true`,
      [userId]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Admin must use password login' });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, kam_name: user.kam_name, rh_name: user.rh_name },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to select user' });
  }
});

router.post('/change-password', async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;
    const result = await query('SELECT id, password_hash FROM users WHERE id = $1', [userId]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });
    const newHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
