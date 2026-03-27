<?php
// api/users.php
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
if (preg_match('/users\.php\/([a-zA-Z0-9\-]{32,36})/', $requestUri, $matches)) {
    $id = $matches[1];
} elseif (isset($_GET['id'])) {
    $id = $_GET['id'];
}

// GET /users.php/notifications
if ($method === 'GET' && strpos($requestUri, 'notifications') !== false) {
    $stmt = $pdo->query("
        SELECT n.*, c.numero_suivi
        FROM notifications n
        LEFT JOIN colis c ON n.colis_id = c.id
        ORDER BY n.created_at DESC LIMIT 50
    ");
    send_json($stmt->fetchAll());
}

// Route: /users.php/{id}/actif  (activate/deactivate)
if ($method === 'PUT' && strpos($requestUri, 'actif') !== false) {
    if ($user['role'] !== 'admin') send_json(['error' => 'Accès refusé'], 403);
    if (!$id) send_json(['error' => 'ID manquant'], 400);
    $body = get_json_body();
    $actif = isset($body['actif']) ? (int)$body['actif'] : 0;
    $stmt = $pdo->prepare("UPDATE users SET actif = ? WHERE id = ?");
    $stmt->execute([$actif, $id]);
    send_json(['message' => $actif ? 'Utilisateur activé' : 'Utilisateur désactivé']);
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
        if (empty($body['nom']) || empty($body['email']) || empty($body['password'])) {
            send_json(['error' => 'Nom, email et mot de passe requis'], 400);
        }
        if (strlen($body['password']) < 6) {
            send_json(['error' => 'Le mot de passe doit contenir au moins 6 caractères'], 400);
        }
        $uId = generate_uuid();
        $passHash = password_hash($body['password'], PASSWORD_BCRYPT);
        try {
            $stmt = $pdo->prepare("INSERT INTO users (id, nom, email, password, role, telephone) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([$uId, $body['nom'], $body['email'], $passHash, $body['role'] ?? 'agent', $body['telephone'] ?? null]);
            send_json(['message' => 'Utilisateur créé avec succès', 'id' => $uId], 201);
        } catch (PDOException $e) {
            if ($e->getCode() == 23000 || strpos($e->getMessage(), 'UNIQUE') !== false) {
                send_json(['error' => 'Cet email est déjà utilisé'], 409);
            }
            send_json(['error' => 'Erreur: ' . $e->getMessage()], 400);
        }
        break;

    case 'PUT':
        if ($user['role'] !== 'admin') send_json(['error' => 'Accès refusé'], 403);
        if (!$id) send_json(['error' => 'ID manquant'], 400);
        $body = get_json_body();
        $fields = []; $values = [];
        foreach (['nom', 'email', 'role', 'telephone'] as $f) {
            if (isset($body[$f])) { $fields[] = "$f = ?"; $values[] = $body[$f]; }
        }
        if (isset($body['password']) && strlen($body['password']) >= 6) {
            $fields[] = "password = ?";
            $values[] = password_hash($body['password'], PASSWORD_BCRYPT);
        }
        if (empty($fields)) send_json(['message' => 'Rien à modifier']);
        $values[] = $id;
        $stmt = $pdo->prepare("UPDATE users SET " . implode(', ', $fields) . " WHERE id = ?");
        $stmt->execute($values);
        send_json(['message' => 'Utilisateur mis à jour']);
        break;

    case 'DELETE':
        if ($user['role'] !== 'admin') send_json(['error' => 'Accès refusé'], 403);
        if (!$id) send_json(['error' => 'ID manquant'], 400);
        if ($id === $user['id']) send_json(['error' => 'Vous ne pouvez pas supprimer votre propre compte'], 400);
        $stmt = $pdo->prepare("UPDATE users SET actif = 0 WHERE id = ?");
        $stmt->execute([$id]);
        send_json(['message' => 'Utilisateur désactivé']);
        break;
}

send_json(['error' => 'Route non gérée'], 404);
?>
