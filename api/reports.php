<?php
// api/reports.php
require_once __DIR__ . '/db.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

$user = authenticate();
$requestUri = $_SERVER['REQUEST_URI'];

if (strpos($requestUri, 'livraisons') !== false) {
    // Generate CSV for deliveries
    $stmt = $pdo->query("
        SELECT l.id, c.numero_suivi, c.type_colis, d.nom as dest_nom, d.ville as dest_ville, 
               liv.nom as livreur_nom, l.statut, l.date_planifiee, l.date_livraison 
        FROM livraisons l
        JOIN colis c ON l.colis_id = c.id
        JOIN destinataires d ON c.destinataire_id = d.id
        LEFT JOIN livreurs liv ON l.livreur_id = liv.id
        ORDER BY l.date_planifiee DESC
    ");
    $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Simple JSON array return (frontend generates the actual CSV file like before, or we can send text/csv)
    // In our previous node server, the frontend handled creating the blob from the JSON response
    send_json($data);
}

if (strpos($requestUri, 'stats') !== false) {
    // Monthly stats
    $stmt = $pdo->query("SELECT substr(created_at, 1, 7) as mois, COUNT(*) as total FROM colis GROUP BY mois ORDER BY mois DESC LIMIT 12");
    $evolution = $stmt->fetchAll();

    // Stats par livreur
    $stmtLiv = $pdo->query("
        SELECT liv.nom, 
               SUM(CASE WHEN l.statut='livree' THEN 1 ELSE 0 END) as livrees,
               SUM(CASE WHEN l.statut='echec' THEN 1 ELSE 0 END) as echecs
        FROM livreurs liv
        LEFT JOIN livraisons l ON liv.id = l.livreur_id
        GROUP BY liv.id
    ");
    $perf_livreurs = $stmtLiv->fetchAll();

    send_json([
        'evolution_mensuelle' => $evolution,
        'performance_livreurs' => $perf_livreurs
    ]);
}

send_json(['error' => 'Route non trouvée'], 404);
?>
