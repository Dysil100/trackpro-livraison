<?php
/**
 * TrackPro — Unit Tests
 * Run: php tests/test_api.php
 * Requires a running PHP server at http://localhost:8000
 */

define('BASE_URL', 'http://localhost:8000/api');
define('ADMIN_EMAIL', 'admin@tracking.com');
define('ADMIN_PASS', 'admin123');
define('AGENT_EMAIL', 'agent@tracking.com');
define('AGENT_PASS', 'agent123');

$passed = 0; $failed = 0; $token = null;

function request(string $method, string $url, array $body = [], ?string $token = null): array {
    $ch = curl_init(BASE_URL . $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    $headers = ['Content-Type: application/json'];
    if ($token) $headers[] = 'Authorization: Bearer ' . $token;
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    if (!empty($body)) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $httpCode, 'body' => json_decode($response, true), 'raw' => $response];
}

function assert_eq(string $name, $expected, $actual): void {
    global $passed, $failed;
    if ($expected === $actual) {
        echo "  ✅ PASS: {$name}\n";
        $passed++;
    } else {
        echo "  ❌ FAIL: {$name} — expected " . json_encode($expected) . ", got " . json_encode($actual) . "\n";
        $failed++;
    }
}

function assert_key(string $name, array $res, string $key): void {
    global $passed, $failed;
    if (array_key_exists($key, $res['body'] ?? [])) {
        echo "  ✅ PASS: {$name} (has '{$key}')\n";
        $passed++;
    } else {
        echo "  ❌ FAIL: {$name} — key '{$key}' not found. Body: " . json_encode($res['body']) . "\n";
        $failed++;
    }
}

function section(string $name): void { echo "\n── {$name} ──\n"; }

// ============================================================
// 1. AUTH TESTS
// ============================================================
section('Auth');

$res = request('POST', '/auth.php?action=login', ['email' => ADMIN_EMAIL, 'password' => ADMIN_PASS]);
assert_eq('Admin login returns 200', 200, $res['code']);
assert_key('Admin login returns token', $res, 'token');
$token = $res['body']['token'] ?? null;

$res = request('POST', '/auth.php?action=login', ['email' => 'bad@bad.com', 'password' => 'wrong']);
assert_eq('Invalid login returns 401', 401, $res['code']);

$res = request('GET', '/auth.php?action=me', [], $token);
assert_eq('GET /me returns 200', 200, $res['code']);
assert_key('GET /me returns user', $res, 'user');

$res = request('GET', '/auth.php?action=me');
assert_eq('GET /me without token returns 401', 401, $res['code']);

// ============================================================
// 2. LIVREURS TESTS
// ============================================================
section('Livreurs');

$res = request('GET', '/livreurs.php', [], $token);
assert_eq('GET /livreurs returns 200', 200, $res['code']);
assert_eq('GET /livreurs returns array', true, is_array($res['body']));

$newLiv = ['nom' => 'Test Livreur ' . time(), 'telephone' => '+336' . rand(10000000, 99999999), 'vehicule' => 'Moto', 'email' => 'test' . time() . '@mail.fr'];
$res = request('POST', '/livreurs.php', $newLiv, $token);
assert_eq('POST /livreurs returns 201', 201, $res['code']);
$livId = $res['body']['id'] ?? null;

if ($livId) {
    $res = request('GET', "/livreurs.php/{$livId}", [], $token);
    assert_eq('GET /livreurs/{id} returns 200', 200, $res['code']);
    assert_eq('GET /livreurs/{id} returns correct nom', $newLiv['nom'], $res['body']['nom'] ?? null);

    $res = request('PUT', "/livreurs.php/{$livId}", ['statut' => 'disponible'], $token);
    assert_eq('PUT /livreurs/{id} returns 200', 200, $res['code']);

    $res = request('DELETE', "/livreurs.php/{$livId}", [], $token);
    assert_eq('DELETE /livreurs/{id} returns 200', 200, $res['code']);
}

$res = request('POST', '/livreurs.php', ['nom' => 'Missing Phone'], $token);
assert_eq('POST /livreurs without telephone returns 400', 400, $res['code']);

// ============================================================
// 3. USERS TESTS
// ============================================================
section('Users');

$res = request('GET', '/users.php', [], $token);
assert_eq('GET /users (admin) returns 200', 200, $res['code']);

// Agent should be forbidden
$agentRes = request('POST', '/auth.php?action=login', ['email' => AGENT_EMAIL, 'password' => AGENT_PASS]);
$agentToken = $agentRes['body']['token'] ?? null;
if ($agentToken) {
    $res = request('GET', '/users.php', [], $agentToken);
    assert_eq('GET /users as agent returns 403', 403, $res['code']);
}

$newUser = ['nom' => 'Test User ' . time(), 'email' => 'u' . time() . '@test.com', 'password' => 'pass1234', 'role' => 'agent'];
$res = request('POST', '/users.php', $newUser, $token);
assert_eq('POST /users (admin) returns 201', 201, $res['code']);
$userId = $res['body']['id'] ?? null;

if ($userId) {
    $res = request('PUT', "/users.php/{$userId}/actif", ['actif' => 0], $token);
    assert_eq('PUT /users/{id}/actif returns 200', 200, $res['code']);
}

// Short password
$res = request('POST', '/users.php', ['nom' => 'X', 'email' => 'x@x.com', 'password' => '123'], $token);
assert_eq('POST /users with short password returns 400', 400, $res['code']);

// ============================================================
// 4. COLIS TESTS
// ============================================================
section('Colis');

$res = request('GET', '/colis.php', [], $token);
assert_eq('GET /colis returns 200', 200, $res['code']);
assert_eq('GET /colis returns object with colis key', true, isset($res['body']['colis']));

// ============================================================
// 5. LIVRAISONS TESTS
// ============================================================
section('Livraisons');

$res = request('GET', '/livraisons.php', [], $token);
assert_eq('GET /livraisons returns 200', 200, $res['code']);
assert_eq('GET /livraisons returns array', true, is_array($res['body']));

// ============================================================
// 6. REPORTS TESTS
// ============================================================
section('Reports');

$res = request('GET', '/reports.php/stats', [], $token);
assert_eq('GET /reports/stats returns 200', 200, $res['code']);
assert_key('GET /reports/stats has evolution_mensuelle', $res, 'evolution_mensuelle');
assert_key('GET /reports/stats has performance_livreurs', $res, 'performance_livreurs');

$res = request('GET', '/reports.php/livraisons?from=2024-01-01&to=2025-12-31', [], $token);
assert_eq('GET /reports/livraisons returns 200', 200, $res['code']);
assert_eq('GET /reports/livraisons returns array', true, is_array($res['body']));

// ============================================================
// 7. INCIDENTS TESTS
// ============================================================
section('Incidents');

$res = request('GET', '/incidents.php', [], $token);
assert_eq('GET /incidents returns 200', 200, $res['code']);

// ============================================================
// SUMMARY
// ============================================================
echo "\n════════════════════════════════════\n";
echo "RÉSULTATS: {$passed} réussis, {$failed} échoués\n";
echo "════════════════════════════════════\n";
exit($failed > 0 ? 1 : 0);
?>
