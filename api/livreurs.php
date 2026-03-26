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
$action = $_GET['action'] ?? '';

$id = null;
if (preg_match('/livreurs\.php\/([a-f0-9\-]{36})/', $requestUri, $matches)) {
    $id = $matches[1];
} elseif (isset($_GET['id'])) {
    $id = $_GET['id'];
}

// Special case: update position (was handled by Socket.io, now AJAX polling)
if ($method === 'POST' && strpos($requestUri, 'positions') !== false) {
    $body = get_json_body();
    $livreur_id = $body['livreur_id'] ?? null;
    $lat = $body['latitude'] ?? null;
    $lng = $body['longitude'] ?? null;
    $livraison_id = $body['livraison_id'] ?? null;

    if (!$livreur_id || !$lat || !$lng) {
        send_json(['error' => 'Données incomplètes'], 400);
    }

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("UPDATE livreurs SET latitude = ?, longitude = ? WHERE id = ?");
        $stmt->execute([$lat, $lng, $livreur_id]);

        $stmtGeo = $pdo->prepare("INSERT INTO geo_positions (id, livreur_id, livraison_id, latitude, longitude) VALUES (?, ?, ?, ?, ?)");
        $stmtGeo->execute([generate_uuid(), $livreur_id, $livraison_id, $lat, $lng]);

        $pdo->commit();
        send_json(['message' => 'Position mise à jour']);
    } catch (Exception $e) {
        $pdo->rollBack();
        send_json(['error' => $e->getMessage()], 400);
    }
}

// Special case: GET positions for map polling (where action=positions or url has /positions)
if ($method === 'GET' && strpos($requestUri, 'positions') !== false) {
    if ($id) {
        // positions of a specific livreur
        $stmt = $pdo->prepare("SELECT latitude, longitude, created_at FROM geo_positions WHERE livreur_id = ? ORDER BY created_at DESC LIMIT 50");
        $stmt->execute([$id]);
        send_json($stmt->fetchAll());
    } else {
        // all active livreurs current position
        $stmt = $pdo->query("SELECT id, nom, latitude, longitude, statut FROM livreurs WHERE latitude IS NOT NULL");
        send_json($stmt->fetchAll());
    }
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
            $stmt = $pdo->query("SELECT * FROM livreurs ORDER BY nom ASC");
            send_json($stmt->fetchAll());
        }
        break;

    case 'POST':
        $body = get_json_body();
        try {
            $livId = generate_uuid();
            $stmt = $pdo->prepare("
                INSERT INTO livreurs (id, nom, telephone, email, vehicule, statut)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $livId, $body['nom'], $body['telephone'], $body['email'] ?? null, 
                $body['vehicule'] ?? null, $body['statut'] ?? 'disponible'
            ]);
            send_json(['message' => 'Livreur créé', 'id' => $livId], 201);
        } catch(PDOException $e) {
            if ($e->getCode() == 23000) send_json(['error' => 'Email déjà existant'], 400);
            send_json(['error' => $e->getMessage()], 400);
        }
        break;

    case 'PUT':
        if (!$id) send_json(['error' => 'ID manquant'], 400);
        $body = get_json_body();
        $fields = [];
        $values = [];
        foreach (['nom', 'telephone', 'email', 'vehicule', 'statut'] as $f) {
            if (isset($body[$f])) {
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
        $stmt = $pdo->prepare("UPDATE livreurs SET statut = 'indisponible' WHERE id = ?");
        $stmt->execute([$id]);
        send_json(['message' => 'Livreur archivé/indisponible']);
        break;
}

send_json(['error' => 'Route non gérée'], 404);
?>
