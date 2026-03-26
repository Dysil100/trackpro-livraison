const express = require('express');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();

// GET /api/livreurs
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*,
       COUNT(lv.id) FILTER (WHERE lv.statut = 'en_cours') as livraisons_en_cours,
       COUNT(lv.id) FILTER (WHERE lv.statut = 'livree') as livraisons_terminees
       FROM livreurs l
       LEFT JOIN livraisons lv ON l.id = lv.livreur_id
       GROUP BY l.id ORDER BY l.nom`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/livreurs/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const lResult = await pool.query('SELECT * FROM livreurs WHERE id=$1', [req.params.id]);
    if (lResult.rows.length === 0) return res.status(404).json({ error: 'Livreur introuvable' });
    const livraisons = await pool.query(
      `SELECT lv.*, c.numero_suivi, c.statut as colis_statut,
       d.nom as dest_nom, d.adresse as dest_adresse
       FROM livraisons lv
       JOIN colis c ON lv.colis_id=c.id
       JOIN destinataires d ON c.destinataire_id=d.id
       WHERE lv.livreur_id=$1 ORDER BY lv.created_at DESC LIMIT 20`,
      [req.params.id]
    );
    const positions = await pool.query(
      'SELECT * FROM geo_positions WHERE livreur_id=$1 ORDER BY created_at DESC LIMIT 50',
      [req.params.id]
    );
    res.json({ livreur: lResult.rows[0], livraisons: livraisons.rows, positions: positions.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/livreurs
router.post('/', authMiddleware, requireRole('admin', 'agent'), async (req, res) => {
  const { nom, telephone, email, vehicule } = req.body;
  if (!nom || !telephone) return res.status(400).json({ error: 'Nom et téléphone requis' });
  try {
    const result = await pool.query(
      'INSERT INTO livreurs (nom, telephone, email, vehicule) VALUES ($1,$2,$3,$4) RETURNING *',
      [nom, telephone, email||null, vehicule||null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/livreurs/:id
router.put('/:id', authMiddleware, requireRole('admin', 'agent'), async (req, res) => {
  const { nom, telephone, email, vehicule, statut } = req.body;
  try {
    const result = await pool.query(
      `UPDATE livreurs SET nom=$1, telephone=$2, email=$3, vehicule=$4, statut=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [nom, telephone, email||null, vehicule||null, statut||'disponible', req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/livreurs/:id/position - Update GPS
router.put('/:id/position', authMiddleware, async (req, res) => {
  const { latitude, longitude, livraison_id } = req.body;
  if (!latitude || !longitude) return res.status(400).json({ error: 'Coordonnées requises' });
  try {
    await pool.query(
      'UPDATE livreurs SET latitude=$1, longitude=$2, updated_at=NOW() WHERE id=$3',
      [latitude, longitude, req.params.id]
    );
    await pool.query(
      'INSERT INTO geo_positions (livreur_id, livraison_id, latitude, longitude) VALUES ($1,$2,$3,$4)',
      [req.params.id, livraison_id||null, latitude, longitude]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/livreurs/:id
router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM livreurs WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
