const express = require('express');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();

// Generate tracking number
function generateTrackingNumber() {
  const prefix = 'TRK';
  const date = new Date();
  const datePart = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
  const rand = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `${prefix}-${datePart}-${rand}`;
}

// Notify helper (simulation)
async function createNotification(pool, colis_id, email, telephone, type, message) {
  try {
    await pool.query(
      `INSERT INTO notifications (colis_id, destinataire_email, destinataire_telephone, type, message)
       VALUES ($1,$2,$3,$4,$5)`,
      [colis_id, email, telephone, type, message]
    );
  } catch (e) { /* silent */ }
}

// POST /api/colis - Create shipment
router.post('/', authMiddleware, async (req, res) => {
  const {
    type_colis, poids, volume, description, type_livraison, valeur_declaree, notes,
    expediteur, destinataire
  } = req.body;
  if (!expediteur || !destinataire)
    return res.status(400).json({ error: 'Expéditeur et destinataire requis' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Create expediteur
    const expResult = await client.query(
      `INSERT INTO expediteurs (nom, telephone, email, adresse, ville)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [expediteur.nom, expediteur.telephone, expediteur.email||null, expediteur.adresse, expediteur.ville||null]
    );
    // Create destinataire
    const destResult = await client.query(
      `INSERT INTO destinataires (nom, telephone, email, adresse, ville)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [destinataire.nom, destinataire.telephone, destinataire.email||null, destinataire.adresse, destinataire.ville||null]
    );
    const numero_suivi = generateTrackingNumber();
    const colisResult = await client.query(
      `INSERT INTO colis (numero_suivi, type_colis, poids, volume, description, type_livraison,
        expediteur_id, destinataire_id, created_by, valeur_declaree, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [numero_suivi, type_colis||'paquet', poids||null, volume||null, description||null,
       type_livraison||'standard', expResult.rows[0].id, destResult.rows[0].id,
       req.user.id, valeur_declaree||null, notes||null]
    );
    // First tracking entry
    await client.query(
      `INSERT INTO historique_tracking (colis_id, statut, description, created_by)
       VALUES ($1,'enregistre','Colis enregistré dans le système',$2)`,
      [colisResult.rows[0].id, req.user.id]
    );
    await client.query('COMMIT');
    // Notification simulation
    await createNotification(pool, colisResult.rows[0].id, destinataire.email, destinataire.telephone,
      'colis_expedie', `Votre colis ${numero_suivi} a été enregistré et sera expédié prochainement.`);
    res.status(201).json({ colis: colisResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la création du colis' });
  } finally {
    client.release();
  }
});

// GET /api/colis - List all (admin/agent)
router.get('/', authMiddleware, async (req, res) => {
  const { statut, page = 1, limit = 20, search } = req.query;
  const offset = (page - 1) * limit;
  let where = [];
  let params = [];
  let idx = 1;
  if (statut) { where.push(`c.statut = $${idx++}`); params.push(statut); }
  if (search) {
    where.push(`(c.numero_suivi ILIKE $${idx} OR e.nom ILIKE $${idx} OR d.nom ILIKE $${idx})`);
    params.push(`%${search}%`); idx++;
  }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  try {
    const result = await pool.query(
      `SELECT c.*, e.nom as exp_nom, e.telephone as exp_tel, e.adresse as exp_adresse,
       d.nom as dest_nom, d.telephone as dest_tel, d.adresse as dest_adresse, d.ville as dest_ville,
       u.nom as created_by_nom
       FROM colis c
       LEFT JOIN expediteurs e ON c.expediteur_id = e.id
       LEFT JOIN destinataires d ON c.destinataire_id = d.id
       LEFT JOIN users u ON c.created_by = u.id
       ${whereClause}
       ORDER BY c.created_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, limit, offset]
    );
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM colis c LEFT JOIN expediteurs e ON c.expediteur_id=e.id
       LEFT JOIN destinataires d ON c.destinataire_id=d.id ${whereClause}`,
      params
    );
    res.json({ colis: result.rows, total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/colis/track/:numero - Public tracking
router.get('/track/:numero', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.numero_suivi, c.statut, c.type_colis, c.type_livraison, c.created_at,
       e.nom as exp_nom, e.ville as exp_ville,
       d.nom as dest_nom, d.adresse as dest_adresse, d.ville as dest_ville, d.telephone as dest_tel
       FROM colis c
       LEFT JOIN expediteurs e ON c.expediteur_id = e.id
       LEFT JOIN destinataires d ON c.destinataire_id = d.id
       WHERE c.numero_suivi = $1`,
      [req.params.numero]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Colis introuvable' });
    const historique = await pool.query(
      `SELECT statut, description, localisation, latitude, longitude, created_at
       FROM historique_tracking WHERE colis_id = (
         SELECT id FROM colis WHERE numero_suivi = $1
       ) ORDER BY created_at DESC`,
      [req.params.numero]
    );
    res.json({ colis: result.rows[0], historique: historique.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/colis/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, e.nom as exp_nom, e.telephone as exp_tel, e.email as exp_email, e.adresse as exp_adresse,
       d.nom as dest_nom, d.telephone as dest_tel, d.email as dest_email, d.adresse as dest_adresse, d.ville as dest_ville
       FROM colis c
       LEFT JOIN expediteurs e ON c.expediteur_id = e.id
       LEFT JOIN destinataires d ON c.destinataire_id = d.id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Colis introuvable' });
    const historique = await pool.query(
      `SELECT ht.*, u.nom as agent_nom FROM historique_tracking ht
       LEFT JOIN users u ON ht.created_by = u.id
       WHERE ht.colis_id = $1 ORDER BY ht.created_at DESC`,
      [req.params.id]
    );
    res.json({ colis: result.rows[0], historique: historique.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/colis/:id/statut - Update status
router.put('/:id/statut', authMiddleware, async (req, res) => {
  const { statut, description, localisation, latitude, longitude } = req.body;
  const validStatuts = ['enregistre','en_transit','en_livraison','livre','echec','retour','perdu'];
  if (!validStatuts.includes(statut))
    return res.status(400).json({ error: 'Statut invalide' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE colis SET statut=$1, updated_at=NOW() WHERE id=$2', [statut, req.params.id]);
    await client.query(
      `INSERT INTO historique_tracking (colis_id, statut, description, localisation, latitude, longitude, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.params.id, statut, description||null, localisation||null, latitude||null, longitude||null, req.user.id]
    );
    await client.query('COMMIT');
    // Get colis for notification
    const colis = await pool.query(
      `SELECT c.numero_suivi, d.email, d.telephone FROM colis c
       JOIN destinataires d ON c.destinataire_id=d.id WHERE c.id=$1`, [req.params.id]);
    if (colis.rows.length > 0) {
      const msgMap = {
        'en_transit': 'Votre colis est en transit.',
        'en_livraison': 'Votre colis est en cours de livraison aujourd\'hui !',
        'livre': 'Votre colis a été livré avec succès. Merci !'
      };
      if (msgMap[statut]) {
        await createNotification(pool, req.params.id, colis.rows[0].email, colis.rows[0].telephone, `statut_${statut}`, msgMap[statut]);
      }
    }
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// PUT /api/colis/:id - Edit colis
router.put('/:id', authMiddleware, async (req, res) => {
  const { type_colis, poids, volume, description, type_livraison, notes, valeur_declaree } = req.body;
  try {
    await pool.query(
      `UPDATE colis SET type_colis=$1, poids=$2, volume=$3, description=$4, type_livraison=$5,
       notes=$6, valeur_declaree=$7, updated_at=NOW() WHERE id=$8`,
      [type_colis, poids||null, volume||null, description||null, type_livraison, notes||null, valeur_declaree||null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/colis/:id
router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM colis WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
