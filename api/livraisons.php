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

// Extract ID
$id = null;
if (preg_match('/livraisons\.php\/([a-zA-Z0-9\-]{32,36})/', $requestUri, $matches)) {
    $id = $matches[1];
} elseif (isset($_GET['id'])) {
    $id = $_GET['id'];
}

// Route: PUT /livraisons.php/{id}/statut
if ($method === 'PUT' && strpos($requestUri, 'statut') !== false) {
    if (!$id) send_json(['error' => 'ID manquant'], 400);
    $body = get_json_body();
    $nouveauStatut = $body['statut'] ?? null;
    if (!$nouveauStatut) send_json(['error' => 'Statut requis'], 400);

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("UPDATE livraisons SET statut = ? WHERE id = ?");
        $stmt->execute([$nouveauStatut, $id]);

        // Get colis_id
        $stmtCinfo = $pdo->prepare("SELECT colis_id, livreur_id FROM livraisons WHERE id = ?");
        $stmtCinfo->execute([$id]);
        $lInfo = $stmtCinfo->fetch();
        $cId = $lInfo['colis_id'];
        $livreurId = $lInfo['livreur_id'];

        if ($nouveauStatut === 'livree') {
            $pdo->prepare("UPDATE livraisons SET date_livraison = CURRENT_TIMESTAMP WHERE id = ?")->execute([$id]);
            $pdo->prepare("UPDATE colis SET statut = 'livre' WHERE id = ?")->execute([$cId]);
            if ($livreurId) $pdo->prepare("UPDATE livreurs SET statut = 'disponible' WHERE id = ?")->execute([$livreurId]);

            $stmtH = $pdo->prepare("INSERT INTO historique_tracking (id, colis_id, statut, description, created_by) VALUES (?, ?, ?, ?, ?)");
            $stmtH->execute([generate_uuid(), $cId, 'livre', 'Colis livré avec succès', $user['id']]);

            $stmtN = $pdo->prepare("INSERT INTO notifications (id, colis_id, type, message) VALUES (?, ?, ?, ?)");
            $stmtN->execute([generate_uuid(), $cId, 'statut_livre', 'Votre colis a été livré avec succès.']);

        } elseif ($nouveauStatut === 'echec') {
            $pdo->prepare("UPDATE colis SET statut = 'echec' WHERE id = ?")->execute([$cId]);
            if ($livreurId) $pdo->prepare("UPDATE livreurs SET statut = 'disponible' WHERE id = ?")->execute([$livreurId]);

            $stmtH = $pdo->prepare("INSERT INTO historique_tracking (id, colis_id, statut, description, created_by) VALUES (?, ?, ?, ?, ?)");
            $stmtH->execute([generate_uuid(), $cId, 'echec', 'Échec de la livraison', $user['id']]);

        } elseif ($nouveauStatut === 'en_cours') {
            $pdo->prepare("UPDATE colis SET statut = 'en_livraison' WHERE id = ?")->execute([$cId]);
            if ($livreurId) $pdo->prepare("UPDATE livreurs SET statut = 'en_livraison' WHERE id = ?")->execute([$livreurId]);

            $stmtH = $pdo->prepare("INSERT INTO historique_tracking (id, colis_id, statut, description, created_by) VALUES (?, ?, ?, ?, ?)");
            $stmtH->execute([generate_uuid(), $cId, 'en_livraison', 'Livraison démarrée', $user['id']]);
        }

        $pdo->commit();
        send_json(['message' => 'Statut mis à jour']);
    } catch(Exception $e) {
        $pdo->rollBack();
        send_json(['error' => $e->getMessage()], 400);
    }
}

switch ($method) {
    case 'GET':
        if ($id) {
            // Check if it's looking for livraison detail (with colis info)
            $stmt = $pdo->prepare("
                SELECT l.*, c.numero_suivi, c.colis_id, c.destinataire_id,
                       d.nom as dest_nom, d.ville as dest_ville, d.adresse as dest_adresse,
                       d.telephone as dest_tel,
                       liv.nom as livreur_nom, liv.telephone as livreur_tel
                FROM livraisons l
                JOIN colis c ON l.colis_id = c.id
                LEFT JOIN destinataires d ON c.destinataire_id = d.id
                LEFT JOIN livreurs liv ON l.livreur_id = liv.id
                WHERE l.id = ?
            ");
            $stmt->execute([$id]);
            $livraison = $stmt->fetch();
            if (!$livraison) send_json(['error' => 'Non trouvé'], 404);
            // Wrap in object so JS can access livraison.colis_id
            send_json(['livraison' => $livraison]);
        } else {
            $livreur_id = $_GET['livreur_id'] ?? null;
            $statut = $_GET['statut'] ?? null;
            $limit = (int)($_GET['limit'] ?? 100);

            $sql = "
                SELECT l.*, c.numero_suivi, c.type_colis,
                       d.nom as dest_nom, d.ville as dest_ville, d.telephone as dest_tel,
                       liv.nom as livreur_nom, liv.telephone as livreur_tel
                FROM livraisons l
                JOIN colis c ON l.colis_id = c.id
                LEFT JOIN destinataires d ON c.destinataire_id = d.id
                LEFT JOIN livreurs liv ON l.livreur_id = liv.id
                WHERE 1=1
            ";
            $params = [];
            if ($livreur_id) { $sql .= " AND l.livreur_id = ?"; $params[] = $livreur_id; }
            if ($statut) { $sql .= " AND l.statut = ?"; $params[] = $statut; }
            $sql .= " ORDER BY l.date_planifiee DESC LIMIT ?";
            $params[] = $limit;

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            send_json($stmt->fetchAll());
        }
        break;

    case 'POST':
        $body = get_json_body();
        $colis_id = $body['colis_id'] ?? null;
        $livreur_id = $body['livreur_id'] ?? null;
        if (!$colis_id) send_json(['error' => 'Colis requis'], 400);

        // Check colis is not already in an active livraison
        $stmtChk = $pdo->prepare("SELECT COUNT(*) FROM livraisons WHERE colis_id = ? AND statut NOT IN ('livree','echec')");
        $stmtChk->execute([$colis_id]);
        if ((int)$stmtChk->fetchColumn() > 0) {
            send_json(['error' => 'Ce colis a déjà une livraison active'], 409);
        }

        $pdo->beginTransaction();
        try {
            $livId = generate_uuid();
            $stmt = $pdo->prepare("INSERT INTO livraisons (id, colis_id, livreur_id, statut, date_planifiee, adresse_livraison, notes) VALUES (?, ?, ?, 'planifiee', ?, ?, ?)");
            $stmt->execute([$livId, $colis_id, $livreur_id ?: null, $body['date_planifiee'] ?? date('Y-m-d H:i:s'), $body['adresse_livraison'] ?? null, $body['notes'] ?? null]);

            // Update colis status
            $pdo->prepare("UPDATE colis SET statut = 'en_livraison' WHERE id = ?")->execute([$colis_id]);

            // Update livreur status if assigned
            if ($livreur_id) {
                $pdo->prepare("UPDATE livreurs SET statut = 'en_livraison' WHERE id = ?")->execute([$livreur_id]);
            }

            // Add history
            $stmtH = $pdo->prepare("INSERT INTO historique_tracking (id, colis_id, statut, description, created_by) VALUES (?, ?, ?, ?, ?)");
            $stmtH->execute([generate_uuid(), $colis_id, 'en_livraison', 'Livraison planifiée' . ($livreur_id ? '' : ' (sans livreur assigné)'), $user['id']]);

            // Add notification
            $stmtN = $pdo->prepare("INSERT INTO notifications (id, colis_id, type, message) VALUES (?, ?, ?, ?)");
            $stmtN->execute([generate_uuid(), $colis_id, 'statut_en_livraison', 'Votre colis est en cours de livraison.']);

            $pdo->commit();
            send_json(['message' => 'Livraison planifiée avec succès', 'id' => $livId], 201);
        } catch(Exception $e) {
            $pdo->rollBack();
            send_json(['error' => $e->getMessage()], 400);
        }
        break;

    case 'DELETE':
        if (!$id) send_json(['error' => 'ID manquant'], 400);
        $stmt = $pdo->prepare("SELECT statut FROM livraisons WHERE id = ?");
        $stmt->execute([$id]);
        $liv = $stmt->fetch();
        if (!$liv) send_json(['error' => 'Non trouvé'], 404);
        if ($liv['statut'] === 'en_cours') send_json(['error' => 'Impossible de supprimer une livraison en cours'], 409);
        $pdo->prepare("DELETE FROM livraisons WHERE id = ?")->execute([$id]);
        send_json(['message' => 'Livraison supprimée']);
        break;
}

send_json(['error' => 'Route non gérée'], 404);
?>
