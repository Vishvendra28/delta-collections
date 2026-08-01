import { Router } from 'express';
import { query } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// GET all rules — returns snake_case (API client converts to camelCase)
router.get('/', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM rules ORDER BY created_at`);
    res.json(result.rows.map(row => ({
      id: row.id,
      customer: row.customer,
      keywords: row.keywords,
      compound_rules: row.compound_rules,
      exclude_keywords: row.exclude_keywords,
      note: row.note,
      source: row.source,
      created_at: row.created_at,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

// POST create rule — accepts snake_case
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const r = req.body;
    const id = r.id;
    const customer = r.customer;
    const keywords = r.keywords;
    const compoundRules = r.compound_rules ?? r.compoundRules ?? [];
    const excludeKeywords = r.exclude_keywords ?? r.excludeKeywords ?? [];
    const note = r.note || null;
    const source = r.source;
    const createdAt = r.created_at ?? r.createdAt;
    await query(
      `INSERT INTO rules (id, customer, keywords, compound_rules, exclude_keywords, note, source, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         customer = EXCLUDED.customer,
         keywords = EXCLUDED.keywords,
         compound_rules = EXCLUDED.compound_rules,
         exclude_keywords = EXCLUDED.exclude_keywords,
         note = EXCLUDED.note,
         source = EXCLUDED.source`,
      [id, customer, JSON.stringify(keywords), JSON.stringify(compoundRules),
       JSON.stringify(excludeKeywords), note, source, createdAt]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save rule' });
  }
});

// PUT bulk replace — accepts snake_case
router.put('/bulk', requireRole('admin'), async (req, res) => {
  try {
    const rules = req.body;
    await query('BEGIN');
    await query('DELETE FROM rules');
    for (const r of rules) {
      const compoundRules = r.compound_rules ?? r.compoundRules ?? [];
      const excludeKeywords = r.exclude_keywords ?? r.excludeKeywords ?? [];
      const createdAt = r.created_at ?? r.createdAt;
      await query(
        `INSERT INTO rules (id, customer, keywords, compound_rules, exclude_keywords, note, source, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [r.id, r.customer, JSON.stringify(r.keywords), JSON.stringify(compoundRules),
         JSON.stringify(excludeKeywords), r.note || null, r.source, createdAt]
      );
    }
    await query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk save rules' });
  }
});

// PUT update single rule by ID — safe: only touches one row, never deletes others
router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const r = req.body;
    const compoundRules = r.compound_rules ?? r.compoundRules ?? [];
    const excludeKeywords = r.exclude_keywords ?? r.excludeKeywords ?? [];
    await query(
      `UPDATE rules SET
         customer = $1,
         keywords = $2,
         compound_rules = $3,
         exclude_keywords = $4,
         note = $5,
         source = $6
       WHERE id = $7`,
      [r.customer, JSON.stringify(r.keywords), JSON.stringify(compoundRules),
       JSON.stringify(excludeKeywords), r.note || null, r.source, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

// DELETE rule
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await query('DELETE FROM rules WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

export default router;
