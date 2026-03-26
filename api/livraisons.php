<?php
// api/livraisons.php
require_once __DIR__ . '/db.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

$user = authenticate();
$method = $_SERVER['REQUEST_METHOD'];
$requestUri = $_SERVER['REQUEST_URI'];
$action = $_GET['action'] ?? '';

$id = null;
if (preg_match('/livraisons\.php\/([a-f0-9\-]{36})/', $requestUri, $matches)) {
    $id = $matches[1];
} elseif (isset($_GET['id'])) {
    $id = $_GET['id'];
}

switch ($method) {
    case 'GET':
        if ($id) {
            $stmt = $pdo->prepare("
                SELECT l.*, c.numero_suivi, c.destinataire_id, d.ville, d.adresse, d.nom as dest_nom, liv.nom as livreur_nom
                FROM livraisons l
                JOIN colis c ON l.colis_id = c.id
                JOIN destinataires d ON c.destinataire_id = d.id
                LEFT JOIN livreurs liv ON l.livreur_id = liv.id
                WHERE l.id = ?
            ");
            $stmt->execute([$id]);
            $livraison = $stmt->fetch();
            if (!$livraison) send_json(['error' => 'Non trouvé'], 404);
            send_json($livraison);
        } else {
            // Check if filtering by livreur
            $livreur_id = $_GET['livreur_id'] ?? null;
            $status = $_GET['statut'] ?? null;
            
            $sql = "
                SELECT l.*, c.numero_suivi, c.type_colis, c.poids, d.nom as dest_nom, d.ville as dest_ville, d.adresse as dest_adresse, liv.nom as livreur_nom
                FROM livraisons l
                JOIN colis c ON l.colis_id = c.id
                JOIN destinataires d ON c.destinataire_id = d.id
                LEFT JOIN livreurs liv ON l.livreur_id = liv.id
                WHERE 1=1
            ";
            $params = [];
            if ($livreur_id) { $sql .= " AND l.livreur_id = ?"; $params[] = $livreur_id; }
            if ($status) { $sql .= " AND l.statut = ?"; $params[] = $status; }
            $sql .= " ORDER BY l.date_planifiee DESC";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            send_json($stmt->fetchAll());
        }
        break;

    case 'POST':
        $body = get_json_body();
        $colis_id = $body['colis_id'];
        $livreur_id = $body['livreur_id'];
        
        $pdo->beginTransaction();
        try {
            $livId = generate_uuid();
            $stmt = $pdo->prepare("INSERT INTO livraisons (id, colis_id, livreur_id, statut, date_planifiee) VALUES (?, ?, ?, 'en_attente', ?)");
            $stmt->execute([$livId, $colis_id, $livreur_id, $body['date_planifiee'] ?? date('Y-m-d H:i:s')]);

            // Update colis status
            $stmtC = $pdo->prepare("UPDATE colis SET statut = 'en_livraison' WHERE id = ?");
            $stmtC->execute([$colis_id]);

            // Add history
            $stmtH = $pdo->prepare("INSERT INTO historique_tracking (id, colis_id, statut, description, created_by) VALUES (?, ?, ?, ?, ?)");
            $stmtH->execute([generate_uuid(), $colis_id, 'en_livraison', 'Assigné au livreur', $user['id']]);

            // Add notification
            $stmtN = $pdo->prepare("INSERT INTO notifications (id, colis_id, type, message) VALUES (?, ?, ?, ?)");
            $stmtN->execute([generate_uuid(), $colis_id, 'colis_en_livraison', "Votre colis est en cours de livraison."]);

            $pdo->commit();
            send_json(['message' => 'Livraison planifiée', 'id' => $livId], 201);
        } catch(Exception $e) {
            $pdo->rollBack();
            send_json(['error' => $e->getMessage()], 400);
        }
        break;

    case 'PUT':
        // status update: /api/livraisons.php/{id}/statut
        if (!$id) send_json(['error' => 'ID manquant'], 400);
        
        if (strpos($requestUri, 'statut') !== false) {
            $body = get_json_body();
            $nouveauStatut = $body['statut'];
            
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare("UPDATE livraisons SET statut = ? WHERE id = ?");
                $stmt->execute([$nouveauStatut, $id]);

                // get colis_id
                $stmtCinfo = $pdo->prepare("SELECT colis_id FROM livraisons WHERE id = ?");
                $stmtCinfo->execute([$id]);
                $cId = $stmtCinfo->fetchColumn();

                if ($nouveauStatut === 'livree') {
                    $stmtUpdateDate = $pdo->prepare("UPDATE livraisons SET date_livraison = CURRENT_TIMESTAMP WHERE id = ?");
                    $stmtUpdateDate->execute([$id]);

                    $stmtUpdateColis = $pdo->prepare("UPDATE colis SET statut = 'livre' WHERE id = ?");
                    $stmtUpdateColis->execute([$cId]);

                    $stmtH = $pdo->prepare("INSERT INTO historique_tracking (id, colis_id, statut, description, created_by) VALUES (?, ?, ?, ?, ?)");
                    $stmtH->execute([generate_uuid(), $cId, 'livre', 'Colis livré avec succès', $user['id']]);

                    $stmtN = $pdo->prepare("INSERT INTO notifications (id, colis_id, type, message) VALUES (?, ?, ?, ?)");
                    $stmtN->execute([generate_uuid(), $cId, 'colis_livre', "Votre colis a été livré."]);
                } elseif ($nouveauStatut === 'echec') {
                    $stmtUpdateColis = $pdo->prepare("UPDATE colis SET statut = 'echec' WHERE id = ?");
                    $stmtUpdateColis->execute([$cId]);

                    $stmtH = $pdo->prepare("INSERT INTO historique_tracking (id, colis_id, statut, description, created_by) VALUES (?, ?, ?, ?, ?)");
                    $stmtH->execute([generate_uuid(), $cId, 'echec', 'Échec de la livraison', $user['id']]);
                }

                $pdo->commit();
                send_json(['message' => 'Statut mis à jour']);
            } catch(Exception $e) {
                $pdo->rollBack();
                send_json(['error' => $e->getMessage()], 400);
            }
        }
        break;
}

send_json(['error' => 'Route non gérée'], 404);
?>
