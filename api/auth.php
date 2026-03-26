<?php
// api/auth.php
require_once __DIR__ . '/db.php';

// Support CORS options requests if necessary
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$requestUri = $_SERVER['REQUEST_URI'];
$method = $_SERVER['REQUEST_METHOD'];

// Route: /api/auth.php/login ou /api/auth.php?action=login
$action = $_GET['action'] ?? (strpos($requestUri, 'login') !== false ? 'login' : '');

if ($method === 'POST' && $action === 'login') {
    $body = get_json_body();
    $email = $body['email'] ?? '';
    $password = $body['password'] ?? '';

    $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if ($user && password_verify($password, $user['password'])) {
        if ($user['actif'] != 1) {
            send_json(['error' => 'Compte désactivé'], 403);
        }

        // Generate token
        $token = jwt_encode([
            'id' => $user['id'],
            'email' => $user['email'],
            'role' => $user['role'],
            'exp' => time() + (7 * 24 * 60 * 60)
        ]);

        unset($user['password']); // don't send password hash
        send_json([
            'message' => 'Connexion réussie',
            'token' => $token,
            'user' => $user
        ]);
    } else {
        send_json(['error' => 'Email ou mot de passe incorrect'], 401);
    }
}

// Route: /api/auth.php/me ou /api/auth.php?action=me
if ($method === 'GET' && ($action === 'me' || strpos($requestUri, 'me') !== false)) {
    $payload = authenticate(); // Validates JWT and returns payload
    $stmt = $pdo->prepare("SELECT id, nom, email, role, telephone, actif FROM users WHERE id = ?");
    $stmt->execute([$payload['id']]);
    $user = $stmt->fetch();
    
    if (!$user) {
        send_json(['error' => 'Utilisateur introuvable'], 404);
    }
    send_json(['user' => $user]);
}

// Fallback
send_json(['error' => 'Route non trouvée'], 404);
?>
