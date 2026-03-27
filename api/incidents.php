<?php
// api/incidents.php
require_once __DIR__ . '/db.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

$user = authenticate();
$method = $_SERVER['REQUEST_METHOD'];
$requestUri = $_SERVER['REQUEST_URI'];
$id = preg_match('/incidents\.php\/([a-zA-Z0-9\-]{32,36})/', $requestUri, $matches) ? $matches[1] : ($_GET['id'] ?? null);

switch ($method) {
    case 'GET':
        $stmt = $pdo->query("
            SELECT i.*, c.numero_suivi, u.nom as createur_nom 
            FROM incidents i 
            JOIN colis c ON i.colis_id = c.id 
            LEFT JOIN users u ON i.created_by = u.id 
            ORDER BY i.created_at DESC
        ");
        send_json($stmt->fetchAll());
        break;

    case 'POST':
        $body = get_json_body();
        $incId = generate_uuid();
        
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("INSERT INTO incidents (id, colis_id, type, description, statut, created_by) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([$incId, $body['colis_id'], $body['type'], $body['description'], 'ouvert', $user['id']]);

            $stmtH = $pdo->prepare("INSERT INTO historique_tracking (id, colis_id, statut, description, created_by) VALUES (?, ?, ?, ?, ?)");
            $stmtH->execute([generate_uuid(), $body['colis_id'], 'alerte', "Incident (" . $body['type'] . "): " . $body['description'], $user['id']]);

            $pdo->commit();
            send_json(['message' => 'Incident déclaré', 'id' => $incId], 201);
        } catch(Exception $e) {
            $pdo->rollBack();
            send_json(['error' => $e->getMessage()], 400);
        }
        break;

    case 'PUT':
        if (!$id) send_json(['error' => 'ID manquant'], 400);
        if (strpos($requestUri, 'statut') !== false) {
            $body = get_json_body();
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare("UPDATE incidents SET statut = ? WHERE id = ?");
                $stmt->execute([$body['statut'], $id]);

                // Auto add to tracking history log
                $stmtC = $pdo->prepare("SELECT colis_id FROM incidents WHERE id = ?");
                $stmtC->execute([$id]);
                $cid = $stmtC->fetchColumn();

                $stmtH = $pdo->prepare("INSERT INTO historique_tracking (id, colis_id, statut, description, created_by) VALUES (?, ?, ?, ?, ?)");
                $stmtH->execute([generate_uuid(), $cid, 'info', "Incident mis à jour : " . $body['statut'], $user['id']]);

                $pdo->commit();
                send_json(['message' => 'Statut incident mis à jour']);
            } catch(Exception $e) {
                $pdo->rollBack();
                send_json(['error' => $e->getMessage()], 400);
            }
        }
        break;
}

send_json(['error' => 'Route non gérée'], 404);
?>
