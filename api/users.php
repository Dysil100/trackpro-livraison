<?php
// api/users.php
require_once __DIR__ . '/db.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

$user = authenticate();
$method = $_SERVER['REQUEST_METHOD'];
$requestUri = $_SERVER['REQUEST_URI'];
$action = $_GET['action'] ?? '';

// Regex ID
$id = preg_match('/users\.php\/([a-f0-9\-]{36})/', $requestUri, $matches) ? $matches[1] : ($_GET['id'] ?? null);

// Notifications Route: /api/users.php/notifications
if ($method === 'GET' && strpos($requestUri, 'notifications') !== false) {
    if ($user['role'] === 'admin' || $user['role'] === 'agent') {
        $stmt = $pdo->query("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50");
        send_json($stmt->fetchAll());
    } else {
        send_json([], 200);
    }
}

// User CRUD
switch ($method) {
    case 'GET':
        if ($user['role'] !== 'admin') send_json(['error' => 'Accès refusé'], 403);
        $stmt = $pdo->query("SELECT id, nom, email, role, telephone, actif, created_at FROM users ORDER BY created_at DESC");
        send_json($stmt->fetchAll());
        break;

    case 'POST':
        if ($user['role'] !== 'admin') send_json(['error' => 'Accès refusé'], 403);
        $body = get_json_body();
        $uId = generate_uuid();
        $passHash = password_hash($body['password'], PASSWORD_BCRYPT);
        try {
            $stmt = $pdo->prepare("INSERT INTO users (id, nom, email, password, role, telephone) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([$uId, $body['nom'], $body['email'], $passHash, $body['role'] ?? 'agent', $body['telephone'] ?? null]);
            send_json(['message' => 'Utilisateur créé', 'id' => $uId], 201);
        } catch (PDOException $e) {
            send_json(['error' => 'Email déjà existant ou paramètre invalide'], 400);
        }
        break;

    case 'PUT':
        if ($user['role'] !== 'admin') send_json(['error' => 'Accès refusé'], 403);
        if (!$id) send_json(['error' => 'ID manquant'], 400);

        if (strpos($requestUri, 'actif') !== false) {
            $body = get_json_body();
            $stmt = $pdo->prepare("UPDATE users SET actif = ? WHERE id = ?");
            $stmt->execute([$body['actif'] ? 1 : 0, $id]);
            send_json(['message' => 'Statut utilisateur mis à jour']);
        }
        break;
}

send_json(['error' => 'Route non gérée'], 404);
?>
