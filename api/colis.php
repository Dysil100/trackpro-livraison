<?php
// api/colis.php
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$requestUri = $_SERVER['REQUEST_URI'];
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($method === 'OPTIONS') { exit(0); }

// --- PUBLIC ROUTE: Tracking ---
if ($method === 'GET' && strpos($requestUri, '/api/colis.php/track/') !== false) {
    preg_match('/\/track\/([a-zA-Z0-9\-]+)/', $requestUri, $matches);
    $numero_suivi = $matches[1] ?? '';

    $stmt = $pdo->prepare("
        SELECT c.*, 
               e.nom as expediteur_nom, e.adresse as expediteur_adresse, e.ville as expediteur_ville, e.telephone as expediteur_telephone,
               d.nom as destinataire_nom, d.adresse as destinataire_adresse, d.ville as destinataire_ville, d.telephone as destinataire_telephone
        FROM colis c 
        LEFT JOIN expediteurs e ON c.expediteur_id = e.id 
        LEFT JOIN destinataires d ON c.destinataire_id = d.id 
        WHERE c.numero_suivi = ?
    ");
    $stmt->execute([$numero_suivi]);
    $colis = $stmt->fetch();

    if (!$colis) { send_json(['error' => 'Colis introuvable'], 404); }

    // Mask destiny info for public tracking unless role is known?
    // In original code, we didn't mask specifically, but let's just return what is needed.
    $stmt = $pdo->prepare("SELECT * FROM historique_tracking WHERE colis_id = ? ORDER BY created_at DESC");
    $stmt->execute([$colis['id']]);
    $historique = $stmt->fetchAll();

    $stmt = $pdo->prepare("SELECT * FROM livraisons WHERE colis_id = ? ORDER BY date_planifiee DESC LIMIT 1");
    $stmt->execute([$colis['id']]);
    $livraison = $stmt->fetch();

    send_json([
        'colis' => $colis,
        'historique' => $historique,
        'livraison_active' => $livraison
    ]);
}

// --- SECURE ROUTES BELOW ---
$user = authenticate();

// Regex pattern to extract ID from `/api/colis.php/{id}`
$id = null;
if (preg_match('/colis\.php\/([a-f0-9\-]{36})/', $requestUri, $matches)) {
    $id = $matches[1];
} elseif (isset($_GET['id'])) {
    $id = $_GET['id'];
}

function generateTrackingNumber() {
    return 'TRK-' . date('Ymd') . '-' . strtoupper(substr(generate_uuid(), 0, 5));
}

switch ($method) {
    case 'GET':
        if ($id) {
            $stmt = $pdo->prepare("
                SELECT c.*, 
                       e.nom as exp_nom, e.ville as exp_ville, e.telephone as exp_tel,
                       d.nom as dest_nom, d.ville as dest_ville, d.telephone as dest_tel
                FROM colis c
                LEFT JOIN expediteurs e ON c.expediteur_id = e.id
                LEFT JOIN destinataires d ON c.destinataire_id = d.id
                WHERE c.id = ?
            ");
            $stmt->execute([$id]);
            $colis = $stmt->fetch();
            if (!$colis) send_json(['error' => 'Not found'], 404);
            send_json($colis);
        } else {
            $stmt = $pdo->query("
                SELECT c.*, 
                       e.nom as exp_nom, e.ville as exp_ville,
                       d.nom as dest_nom, d.ville as dest_ville
                FROM colis c
                LEFT JOIN expediteurs e ON c.expediteur_id = e.id
                LEFT JOIN destinataires d ON c.destinataire_id = d.id
                ORDER BY c.created_at DESC
            ");
            send_json($stmt->fetchAll());
        }
        break;

    case 'POST':
        $body = get_json_body();
        $pdo->beginTransaction();
        try {
            $expId = generate_uuid();
            $stmtExp = $pdo->prepare("INSERT INTO expediteurs (id, nom, telephone, ville, adresse) VALUES (?, ?, ?, ?, ?)");
            $stmtExp->execute([$expId, $body['expediteur']['nom'], $body['expediteur']['telephone'], $body['expediteur']['ville'], $body['expediteur']['adresse']]);

            $destId = generate_uuid();
            $stmtDest = $pdo->prepare("INSERT INTO destinataires (id, nom, telephone, ville, adresse) VALUES (?, ?, ?, ?, ?)");
            $stmtDest->execute([$destId, $body['destinataire']['nom'], $body['destinataire']['telephone'], $body['destinataire']['ville'], $body['destinataire']['adresse']]);

            $colisId = generate_uuid();
            $numero_suivi = generateTrackingNumber();
            $stmtColis = $pdo->prepare("
                INSERT INTO colis (id, numero_suivi, type_colis, poids, type_livraison, expediteur_id, destinataire_id, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmtColis->execute([
                $colisId, $numero_suivi, $body['type_colis'], $body['poids'], 
                $body['type_livraison'] ?? 'standard', $expId, $destId, $user['id']
            ]);

            $stmtHist = $pdo->prepare("INSERT INTO historique_tracking (id, colis_id, statut, description, created_by) VALUES (?, ?, ?, ?, ?)");
            $stmtHist->execute([generate_uuid(), $colisId, 'enregistre', 'Colis enregistré dans le système', $user['id']]);

            $pdo->commit();
            send_json(['message' => 'Colis créé', 'colis' => ['id' => $colisId, 'numero_suivi' => $numero_suivi]], 201);
        } catch (Exception $e) {
            $pdo->rollBack();
            send_json(['error' => $e->getMessage()], 400);
        }
        break;

    case 'PUT':
        if (!$id) send_json(['error' => 'ID manquant'], 400);
        
        // Is it a status update? /api/colis.php/{id}/statut
        if (strpos($requestUri, '/statut') !== false) {
            $body = get_json_body();
            $new_statut = $body['statut'];
            $desc = $body['description'] ?? "Statut mis à jour: $new_statut";
            
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare("UPDATE colis SET statut = ? WHERE id = ?");
                $stmt->execute([$new_statut, $id]);
                
                $stmtH = $pdo->prepare("INSERT INTO historique_tracking (id, colis_id, statut, description, created_by) VALUES (?, ?, ?, ?, ?)");
                $stmtH->execute([generate_uuid(), $id, $new_statut, $desc, $user['id']]);
                
                $pdo->commit();
                send_json(['message' => 'Statut mis à jour']);
            } catch (Exception $e) {
                $pdo->rollBack();
                send_json(['error' => $e->getMessage()], 400);
            }
        }
        break;

    case 'DELETE':
        if (!$id) send_json(['error' => 'ID manquant'], 400);
        // Cascade delete conceptually, though SQLite foreign keys usually handle it if enabled. 
        // Best to just update status to 'annule' or delete directly.
        $stmt = $pdo->prepare("UPDATE colis SET statut = 'annule' WHERE id = ?");
        $stmt->execute([$id]);
        send_json(['message' => 'Colis annulé']);
        break;
}

send_json(['error' => 'Route non gérée'], 404);
?>
