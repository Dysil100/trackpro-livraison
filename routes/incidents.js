const express = require('express');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();

// GET /api/incidents
router.get('/', authMiddleware, async (req, res) => {
  const { statut, page = 1, limit = 20 } = req.query;
  let where = []; let params = []; let idx = 1;
  if (statut) { where.push(`i.statut = $${idx++}`); params.push(statut); }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  try {
    const result = await pool.query(
      `SELECT i.*, c.numero_suivi, u.nom as created_by_nom
       FROM incidents i
       JOIN colis c ON i.colis_id = c.id
       LEFT JOIN users u ON i.created_by = u.id
       ${whereClause}
       ORDER BY i.created_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, limit, (page-1)*limit]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/incidents
router.post('/', authMiddleware, async (req, res) => {
  const { colis_id, type, description } = req.body;
  if (!colis_id || !type || !description)
    return res.status(400).json({ error: 'colis_id, type et description requis' });
  try {
    const result = await pool.query(
      `INSERT INTO incidents (colis_id, type, description, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
      [colis_id, type, description, req.user.id]
    );
    // Update colis statut if perdu/retour
    if (type === 'perdu') await pool.query('UPDATE colis SET statut=\'perdu\' WHERE id=$1', [colis_id]);
    if (type === 'retour') await pool.query('UPDATE colis SET statut=\'retour\' WHERE id=$1', [colis_id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/incidents/:id
router.put('/:id', authMiddleware, async (req, res) => {
  const { statut, description } = req.body;
  try {
    const result = await pool.query(
      `UPDATE incidents SET statut=COALESCE($1,statut), description=COALESCE($2,description), updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [statut||null, description||null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
