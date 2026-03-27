<?php
// api/livreurs.php
require_once __DIR__ . '/db.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

$user = authenticate();
$method = $_SERVER['REQUEST_METHOD'];
$requestUri = $_SERVER['REQUEST_URI'];

// Extract ID: supports both UUID (hyphens) and hex-32 IDs
$id = null;
if (preg_match('/livreurs\.php\/([a-zA-Z0-9\-]{32,36})/', $requestUri, $matches)) {
    $id = $matches[1];
} elseif (isset($_GET['id'])) {
    $id = $_GET['id'];
}

// Special: PUT /livreurs.php/{id}/position
if ($method === 'PUT' && strpos($requestUri, 'position') !== false) {
    if (!$id) send_json(['error' => 'ID manquant'], 400);
    $body = get_json_body();
    $lat = $body['latitude'] ?? null;
    $lng = $body['longitude'] ?? null;
    if (!$lat || !$lng) send_json(['error' => 'Coordonnées manquantes'], 400);
    $stmt = $pdo->prepare("UPDATE livreurs SET latitude = ?, longitude = ? WHERE id = ?");
    $stmt->execute([$lat, $lng, $id]);
    $stmtGeo = $pdo->prepare("INSERT INTO geo_positions (id, livreur_id, latitude, longitude) VALUES (?, ?, ?, ?)");
    $stmtGeo->execute([generate_uuid(), $id, $lat, $lng]);
    send_json(['message' => 'Position mise à jour']);
}

// Special: POST /livreurs.php/positions (legacy realtime)
if ($method === 'POST' && strpos($requestUri, 'positions') !== false) {
    $body = get_json_body();
    $livreur_id = $body['livreur_id'] ?? null;
    $lat = $body['latitude'] ?? null;
    $lng = $body['longitude'] ?? null;
    if (!$livreur_id || !$lat || !$lng) send_json(['error' => 'Données incomplètes'], 400);
    $stmt = $pdo->prepare("UPDATE livreurs SET latitude = ?, longitude = ? WHERE id = ?");
    $stmt->execute([$lat, $lng, $livreur_id]);
    $stmtGeo = $pdo->prepare("INSERT INTO geo_positions (id, livreur_id, latitude, longitude) VALUES (?, ?, ?, ?)");
    $stmtGeo->execute([generate_uuid(), $livreur_id, $lat, $lng]);
    send_json(['message' => 'Position mise à jour']);
}

// CRUD Livreurs
switch ($method) {
    case 'GET':
        if ($id) {
            $stmt = $pdo->prepare("SELECT * FROM livreurs WHERE id = ?");
            $stmt->execute([$id]);
            $livreur = $stmt->fetch();
            if (!$livreur) send_json(['error' => 'Non trouvé'], 404);
            send_json($livreur);
        } else {
            $stmt = $pdo->query("
                SELECT l.*,
                    (SELECT COUNT(*) FROM livraisons lv WHERE lv.livreur_id = l.id AND lv.statut NOT IN ('livree','echec')) as livraisons_en_cours,
                    (SELECT COUNT(*) FROM livraisons lv WHERE lv.livreur_id = l.id AND lv.statut = 'livree') as livraisons_terminees
                FROM livreurs l ORDER BY l.nom ASC
            ");
            send_json($stmt->fetchAll());
        }
        break;

    case 'POST':
        $body = get_json_body();
        if (empty($body['nom']) || empty($body['telephone'])) {
            send_json(['error' => 'Nom et téléphone requis'], 400);
        }
        try {
            $livId = generate_uuid();
            $stmt = $pdo->prepare("INSERT INTO livreurs (id, nom, telephone, email, vehicule, statut) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([$livId, $body['nom'], $body['telephone'], $body['email'] ?? null, $body['vehicule'] ?? null, $body['statut'] ?? 'disponible']);
            send_json(['message' => 'Livreur créé', 'id' => $livId], 201);
        } catch(PDOException $e) {
            send_json(['error' => 'Erreur: ' . $e->getMessage()], 400);
        }
        break;

    case 'PUT':
        if (!$id) send_json(['error' => 'ID manquant'], 400);
        $body = get_json_body();
        $fields = []; $values = [];
        foreach (['nom', 'telephone', 'email', 'vehicule', 'statut', 'latitude', 'longitude'] as $f) {
            if (array_key_exists($f, $body)) {
                $fields[] = "$f = ?";
                $values[] = $body[$f];
            }
        }
        if (empty($fields)) send_json(['message' => 'Rien à modifier']);
        $values[] = $id;
        $stmt = $pdo->prepare("UPDATE livreurs SET " . implode(', ', $fields) . " WHERE id = ?");
        $stmt->execute($values);
        send_json(['message' => 'Livreur mis à jour']);
        break;

    case 'DELETE':
        if (!$id) send_json(['error' => 'ID manquant'], 400);
        // Check active deliveries
        $stmtCheck = $pdo->prepare("SELECT COUNT(*) FROM livraisons WHERE livreur_id = ? AND statut NOT IN ('livree', 'echec')");
        $stmtCheck->execute([$id]);
        $activeCount = (int)$stmtCheck->fetchColumn();
        if ($activeCount > 0) {
            send_json(['error' => "Ce livreur a {$activeCount} livraison(s) active(s). Réaffectez-les d'abord."], 409);
        }
        $stmt = $pdo->prepare("DELETE FROM livreurs WHERE id = ?");
        $stmt->execute([$id]);
        send_json(['message' => 'Livreur supprimé avec succès']);
        break;
}

send_json(['error' => 'Route non gérée'], 404);
?>
