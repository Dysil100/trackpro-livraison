const express = require('express');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// GET /api/reports/livraisons
router.get('/livraisons', authMiddleware, async (req, res) => {
  const { from, to, format } = req.query;
  const dateFrom = from || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
  const dateTo = to || new Date().toISOString().split('T')[0];
  try {
    const result = await pool.query(
      `SELECT c.numero_suivi, c.statut, c.type_colis, c.type_livraison, c.poids,
       c.created_at, c.updated_at,
       e.nom as exp_nom, e.adresse as exp_adresse,
       d.nom as dest_nom, d.adresse as dest_adresse, d.ville as dest_ville,
       l.nom as livreur_nom, lv.date_livraison, lv.statut as livraison_statut
       FROM colis c
       LEFT JOIN expediteurs e ON c.expediteur_id=e.id
       LEFT JOIN destinataires d ON c.destinataire_id=d.id
       LEFT JOIN livraisons lv ON lv.colis_id=c.id
       LEFT JOIN livreurs l ON lv.livreur_id=l.id
       WHERE date(c.created_at) BETWEEN $1 AND $2
       ORDER BY c.created_at DESC`,
      [dateFrom, dateTo]
    );

    if (format === 'csv') {
      const headers = ['Numéro Suivi','Statut','Type Colis','Type Livraison','Poids','Expéditeur','Destinataire','Ville','Livreur','Date Création','Date Livraison'];
      const rows = result.rows.map(r => [
        r.numero_suivi, r.statut, r.type_colis, r.type_livraison, r.poids||'',
        r.exp_nom||'', r.dest_nom||'', r.dest_ville||'', r.livreur_nom||'',
        r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR') : '',
        r.date_livraison ? new Date(r.date_livraison).toLocaleDateString('fr-FR') : ''
      ]);
      const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="rapport_${dateFrom}_${dateTo}.csv"`);
      return res.send('\uFEFF' + csv);
    }

    res.json({ data: result.rows, from: dateFrom, to: dateTo, total: result.rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/reports/livreurs
router.get('/livreurs', authMiddleware, async (req, res) => {
  const { from, to } = req.query;
  const dateFrom = from || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
  const dateTo = to || new Date().toISOString().split('T')[0];
  try {
    const result = await pool.query(
      `SELECT l.nom, l.telephone, l.vehicule, l.statut,
       COUNT(lv.id) as total_livraisons,
       SUM(CASE WHEN lv.statut='livree' THEN 1 ELSE 0 END) as livrees,
       SUM(CASE WHEN lv.statut='echec' THEN 1 ELSE 0 END) as echecs,
       SUM(CASE WHEN lv.statut='en_cours' THEN 1 ELSE 0 END) as en_cours,
       ROUND(SUM(CASE WHEN lv.statut='livree' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(lv.id),0), 2) as taux_reussite,
       ROUND(AVG(CASE WHEN lv.statut='livree' THEN (julianday(lv.date_livraison) - julianday(lv.created_at)) * 24 ELSE NULL END), 1) as temps_moyen_h
       FROM livreurs l
       LEFT JOIN livraisons lv ON l.id=lv.livreur_id AND date(lv.created_at) BETWEEN $1 AND $2
       GROUP BY l.id ORDER BY livrees DESC`,
      [dateFrom, dateTo]
    );
    res.json({ data: result.rows, from: dateFrom, to: dateTo });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/reports/stats (monthly)
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT strftime('%Y-%m', created_at) as mois,
        COUNT(*) as total,
        SUM(CASE WHEN statut='livre' THEN 1 ELSE 0 END) as livres,
        SUM(CASE WHEN statut='echec' THEN 1 ELSE 0 END) as echecs
      FROM colis
      WHERE created_at > datetime('now', '-6 months')
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY mois
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
