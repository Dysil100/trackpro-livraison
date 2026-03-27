<?php
// api/reports.php
require_once __DIR__ . '/db.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: GET, OPTIONS");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

$user = authenticate();
$requestUri = $_SERVER['REQUEST_URI'];
$method = $_SERVER['REQUEST_METHOD'];

// Route: GET /reports.php/stats  (monthly stats + livreur performance)
if ($method === 'GET' && strpos($requestUri, 'stats') !== false) {
    // Monthly evolution (6 months)
    $stmt = $pdo->query("
        SELECT substr(created_at, 1, 7) as mois, COUNT(*) as total,
               SUM(CASE WHEN statut='livre' THEN 1 ELSE 0 END) as livrees,
               SUM(CASE WHEN statut='echec' THEN 1 ELSE 0 END) as echecs
        FROM colis
        WHERE created_at >= date('now','-6 months')
        GROUP BY mois ORDER BY mois ASC
    ");
    $evolution = $stmt->fetchAll();

    // Livreur performance
    $stmtLiv = $pdo->query("
        SELECT liv.id, liv.nom, liv.vehicule, liv.statut,
               COUNT(l.id) as total_livraisons,
               SUM(CASE WHEN l.statut='livree' THEN 1 ELSE 0 END) as livrees,
               SUM(CASE WHEN l.statut='echec' THEN 1 ELSE 0 END) as echecs,
               ROUND(AVG(CASE WHEN l.statut='livree' AND l.date_livraison IS NOT NULL
                   THEN (julianday(l.date_livraison) - julianday(l.date_planifiee)) * 24
                   ELSE NULL END), 1) as temps_moyen_h
        FROM livreurs liv
        LEFT JOIN livraisons l ON liv.id = l.livreur_id
        GROUP BY liv.id ORDER BY livrees DESC
    ");
    $livreurs = $stmtLiv->fetchAll();

    // Today's summary
    $stmtToday = $pdo->query("
        SELECT COUNT(*) as total,
               SUM(CASE WHEN statut='livre' THEN 1 ELSE 0 END) as livrees,
               SUM(CASE WHEN statut='echec' THEN 1 ELSE 0 END) as echecs
        FROM livraisons WHERE date(date_planifiee) = date('now')
    ");
    $today = $stmtToday->fetch();

    send_json([
        'evolution_mensuelle' => $evolution,
        'performance_livreurs' => $livreurs,
        'today' => $today
    ]);
}

// Route: GET /reports.php/livraisons  (list for CSV/PDF export)
if ($method === 'GET' && strpos($requestUri, 'livraisons') !== false) {
    $from = $_GET['from'] ?? date('Y-m-d', strtotime('-30 days'));
    $to = $_GET['to'] ?? date('Y-m-d');

    $stmt = $pdo->prepare("
        SELECT c.numero_suivi, c.type_colis, c.type_livraison, c.statut as statut_colis,
               exp.nom as expediteur, exp.ville as ville_depart,
               dest.nom as destinataire, dest.ville as ville_arrivee, dest.telephone as tel_dest,
               l.statut as statut_livraison, l.date_planifiee, l.date_livraison,
               liv.nom as livreur, c.poids, c.valeur_declaree
        FROM livraisons l
        JOIN colis c ON l.colis_id = c.id
        LEFT JOIN expediteurs exp ON c.expediteur_id = exp.id
        LEFT JOIN destinataires dest ON c.destinataire_id = dest.id
        LEFT JOIN livreurs liv ON l.livreur_id = liv.id
        WHERE date(l.date_planifiee) BETWEEN ? AND ?
        ORDER BY l.date_planifiee DESC
    ");
    $stmt->execute([$from, $to]);
    send_json($stmt->fetchAll());
}

// Route: GET /reports.php/colis (for general colis export)
if ($method === 'GET' && strpos($requestUri, 'colis') !== false) {
    $from = $_GET['from'] ?? date('Y-m-d', strtotime('-30 days'));
    $to = $_GET['to'] ?? date('Y-m-d');

    $stmt = $pdo->prepare("
        SELECT c.numero_suivi, c.type_colis, c.type_livraison, c.statut, c.poids, c.valeur_declaree,
               exp.nom as expediteur, exp.ville as ville_exp,
               dest.nom as destinataire, dest.ville as ville_dest
        FROM colis c
        LEFT JOIN expediteurs exp ON c.expediteur_id = exp.id
        LEFT JOIN destinataires dest ON c.destinataire_id = dest.id
        WHERE date(c.created_at) BETWEEN ? AND ?
        ORDER BY c.created_at DESC
    ");
    $stmt->execute([$from, $to]);
    send_json($stmt->fetchAll());
}

send_json(['error' => 'Route non trouvée'], 404);
?>
