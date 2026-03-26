const express = require('express');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();

// GET /api/users
router.get('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nom, email, role, telephone, actif, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/users/:id
router.put('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { nom, email, role, telephone, actif } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users SET nom=$1, email=$2, role=$3, telephone=$4, actif=$5, updated_at=NOW()
       WHERE id=$6 RETURNING id, nom, email, role, telephone, actif`,
      [nom, email, role, telephone||null, actif !== undefined ? actif : true, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    await pool.query('UPDATE users SET actif=false WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/users/notifications
router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.*, c.numero_suivi FROM notifications n
       LEFT JOIN colis c ON n.colis_id = c.id
       ORDER BY n.created_at DESC LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
