const express = require('express');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const [stats, byStatut, byType, recent, livreurPerf, retards, daily] = await Promise.all([
      // Global stats — SQLite: SUM(CASE WHEN) instead of COUNT FILTER
      pool.query(`
        SELECT
          COUNT(*) as total_colis,
          SUM(CASE WHEN statut='enregistre' THEN 1 ELSE 0 END) as en_attente,
          SUM(CASE WHEN statut IN ('en_transit','en_livraison') THEN 1 ELSE 0 END) as en_cours,
          SUM(CASE WHEN statut='livre' THEN 1 ELSE 0 END) as livres,
          SUM(CASE WHEN statut='echec' THEN 1 ELSE 0 END) as echecs,
          SUM(CASE WHEN statut='retour' THEN 1 ELSE 0 END) as retours,
          SUM(CASE WHEN statut='perdu' THEN 1 ELSE 0 END) as perdus,
          ROUND(SUM(CASE WHEN statut='livre' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*),0), 2) as taux_livraison
        FROM colis
      `),
      // By statut last 30 days
      pool.query(`
        SELECT statut, COUNT(*) as count FROM colis
        WHERE created_at > datetime('now', '-30 days')
        GROUP BY statut ORDER BY count DESC
      `),
      // By type livraison
      pool.query(`SELECT type_livraison, COUNT(*) as count FROM colis GROUP BY type_livraison`),
      // Recent colis
      pool.query(`
        SELECT c.numero_suivi, c.statut, c.type_colis, c.created_at,
          d.nom as dest_nom, d.ville as dest_ville
        FROM colis c LEFT JOIN destinataires d ON c.destinataire_id=d.id
        ORDER BY c.created_at DESC LIMIT 10
      `),
      // Livreur performance
      pool.query(`
        SELECT l.nom, l.statut,
          COUNT(lv.id) as total_livraisons,
          SUM(CASE WHEN lv.statut='livree' THEN 1 ELSE 0 END) as livrees,
          SUM(CASE WHEN lv.statut='echec' THEN 1 ELSE 0 END) as echecs
        FROM livreurs l
        LEFT JOIN livraisons lv ON l.id = lv.livreur_id
        GROUP BY l.id, l.nom, l.statut
        ORDER BY livrees DESC LIMIT 10
      `),
      // Retards (more than 3 days, not delivered)
      pool.query(`
        SELECT c.numero_suivi, c.statut, c.created_at, d.nom as dest_nom
        FROM colis c LEFT JOIN destinataires d ON c.destinataire_id=d.id
        WHERE c.statut NOT IN ('livre','retour','perdu')
        AND c.created_at < datetime('now', '-3 days')
        ORDER BY c.created_at ASC LIMIT 10
      `),
      // Daily stats last 14 days
      pool.query(`
        SELECT date(created_at) as date,
          COUNT(*) as total,
          SUM(CASE WHEN statut='livre' THEN 1 ELSE 0 END) as livres
        FROM colis
        WHERE created_at > datetime('now', '-14 days')
        GROUP BY date(created_at) ORDER BY date
      `)
    ]);

    res.json({
      stats: stats.rows[0],
      byStatut: byStatut.rows,
      byType: byType.rows,
      recentColis: recent.rows,
      livreurPerformance: livreurPerf.rows,
      retards: retards.rows,
      dailyStats: daily.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
