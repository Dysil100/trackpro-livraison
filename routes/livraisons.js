const express = require('express');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();

// GET /api/livraisons
router.get('/', authMiddleware, async (req, res) => {
  const { statut, livreur_id, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = []; let params = []; let idx = 1;
  if (statut) { where.push(`lv.statut = $${idx++}`); params.push(statut); }
  if (livreur_id) { where.push(`lv.livreur_id = $${idx++}`); params.push(livreur_id); }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  try {
    const result = await pool.query(
      `SELECT lv.*, c.numero_suivi, c.statut as colis_statut, c.type_livraison,
       l.nom as livreur_nom, l.telephone as livreur_tel,
       d.nom as dest_nom, d.adresse as dest_adresse, d.ville as dest_ville, d.telephone as dest_tel
       FROM livraisons lv
       JOIN colis c ON lv.colis_id = c.id
       LEFT JOIN livreurs l ON lv.livreur_id = l.id
       LEFT JOIN destinataires d ON c.destinataire_id = d.id
       ${whereClause}
       ORDER BY lv.created_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/livraisons - Assign delivery
router.post('/', authMiddleware, requireRole('admin', 'agent'), async (req, res) => {
  const { colis_id, livreur_id, date_planifiee, adresse_livraison, notes } = req.body;
  if (!colis_id) return res.status(400).json({ error: 'colis_id requis' });
  try {
    const result = await pool.query(
      `INSERT INTO livraisons (colis_id, livreur_id, date_planifiee, adresse_livraison, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [colis_id, livreur_id||null, date_planifiee||null, adresse_livraison||null, notes||null]
    );
    // Update colis status to en_transit
    await pool.query('UPDATE colis SET statut=\'en_transit\', updated_at=NOW() WHERE id=$1', [colis_id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/livraisons/:id - Update
router.put('/:id', authMiddleware, async (req, res) => {
  const { statut, livreur_id, date_planifiee, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE livraisons SET statut=COALESCE($1,statut), livreur_id=COALESCE($2,livreur_id),
       date_planifiee=COALESCE($3,date_planifiee), notes=COALESCE($4,notes), updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [statut||null, livreur_id||null, date_planifiee||null, notes||null, req.params.id]
    );
    if (statut === 'en_cours') {
      const lv = result.rows[0];
      await pool.query('UPDATE colis SET statut=\'en_livraison\', updated_at=NOW() WHERE id=$1', [lv.colis_id]);
      // Update livreur status
      if (lv.livreur_id) {
        await pool.query('UPDATE livreurs SET statut=\'en_livraison\', updated_at=NOW() WHERE id=$1', [lv.livreur_id]);
      }
    }
    if (statut === 'livree') {
      const lv = result.rows[0];
      await pool.query(
        'UPDATE livraisons SET date_livraison=NOW() WHERE id=$1', [req.params.id]
      );
      await pool.query('UPDATE colis SET statut=\'livre\', updated_at=NOW() WHERE id=$1', [lv.colis_id]);
      if (lv.livreur_id) {
        await pool.query('UPDATE livreurs SET statut=\'disponible\', updated_at=NOW() WHERE id=$1', [lv.livreur_id]);
      }
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/livraisons/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT lv.*, c.numero_suivi, c.statut as colis_statut,
       l.nom as livreur_nom, l.telephone as livreur_tel, l.latitude, l.longitude,
       d.nom as dest_nom, d.adresse as dest_adresse, d.telephone as dest_tel, d.email as dest_email,
       e.nom as exp_nom
       FROM livraisons lv
       JOIN colis c ON lv.colis_id = c.id
       LEFT JOIN livreurs l ON lv.livreur_id = l.id
       LEFT JOIN destinataires d ON c.destinataire_id = d.id
       LEFT JOIN expediteurs e ON c.expediteur_id = e.id
       WHERE lv.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Livraison introuvable' });
    const validation = await pool.query('SELECT * FROM validations_livraison WHERE livraison_id=$1', [req.params.id]);
    const positions = await pool.query(
      `SELECT * FROM geo_positions WHERE livraison_id=$1 ORDER BY created_at ASC`, [req.params.id]
    );
    res.json({ livraison: result.rows[0], validation: validation.rows[0]||null, positions: positions.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
