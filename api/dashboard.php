<?php
// api/dashboard.php
require_once __DIR__ . '/db.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

$user = authenticate();

// Only GET is supported
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    send_json(['error' => 'Method Not Allowed'], 405);
}

try {
    // Stats
    $stmtColis = $pdo->query("SELECT COUNT(*) FROM colis");
    $total_colis = $stmtColis->fetchColumn();

    $stmtEnTrans = $pdo->query("SELECT COUNT(*) FROM colis WHERE statut IN ('en_transit', 'enregistre')");
    $en_transit = $stmtEnTrans->fetchColumn();

    $stmtLivrees = $pdo->query("SELECT COUNT(*) FROM colis WHERE statut = 'livre'");
    $livrees = $stmtLivrees->fetchColumn();

    $stmtAlertes = $pdo->query("SELECT COUNT(*) FROM colis WHERE statut = 'echec'");
    $alertes = $stmtAlertes->fetchColumn();

    // Stats par mois (simplified grouping by substr of created_at)
    $stmtEvol = $pdo->query("
        SELECT substr(created_at, 1, 7) as month, COUNT(*) as total 
        FROM colis 
        GROUP BY month 
        ORDER BY month ASC 
        LIMIT 6
    ");
    $evolution = [];
    foreach ($stmtEvol->fetchAll() as $row) {
        $evolution[] = ['date' => $row['month'], 'count' => $row['total']];
    }

    // Retards (simplified: livraisons past due and not livrée)
    $stmtRetards = $pdo->query("
        SELECT l.id, c.numero_suivi, l.date_planifiee, d.ville as destination 
        FROM livraisons l 
        JOIN colis c ON l.colis_id = c.id 
        JOIN destinataires d ON c.destinataire_id = d.id 
        WHERE l.statut != 'livree' AND l.date_planifiee < CURRENT_TIMESTAMP
        LIMIT 5
    ");
    $retards = $stmtRetards->fetchAll();

    // Activities (last 5 history items)
    $stmtActivites = $pdo->query("
        SELECT h.statut, c.numero_suivi, h.created_at as time, h.description 
        FROM historique_tracking h 
        JOIN colis c ON h.colis_id = c.id 
        ORDER BY h.created_at DESC 
        LIMIT 5
    ");
    $activites = [];
    foreach ($stmtActivites->fetchAll() as $a) {
        $activites[] = [
            'action' => 'Statut: ' . $a['statut'],
            'colis' => $a['numero_suivi'],
            'time' => $a['time']
        ];
    }

    send_json([
        'stats' => [
            'total_colis' => $total_colis,
            'en_transit' => $en_transit,
            'livrees' => $livrees,
            'alertes' => $alertes
        ],
        'charts' => [
            'evolution' => $evolution,
            'repartition' => [
                'Livrés' => (int)$livrees, 
                'En transit' => (int)$en_transit, 
                'Échecs' => (int)$alertes
            ]
        ],
        'retards' => $retards,
        'activites' => $activites
    ]);

} catch (Exception $e) {
    send_json(['error' => $e->getMessage()], 400);
}
?>
