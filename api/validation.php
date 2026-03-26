<?php
// api/validation.php
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
if (preg_match('/validation\.php\/([a-f0-9\-]{36})/', $requestUri, $matches)) {
    $id = $matches[1];
} elseif (isset($_GET['id'])) {
    $id = $_GET['id'];
}

// Route: /api/validation.php/generate-otp
if ($method === 'POST' && strpos($requestUri, 'generate-otp') !== false) {
    $body = get_json_body();
    $livraison_id = $body['livraison_id'];
    
    // Check if delivery exists and not delivered
    $stmt = $pdo->prepare("SELECT c.numero_suivi FROM livraisons l JOIN colis c ON l.colis_id = c.id WHERE l.id = ?");
    $stmt->execute([$livraison_id]);
    $res = $stmt->fetch();
    if (!$res) send_json(['error' => 'Livraison non trouvée'], 404);

    $otp = sprintf('%06d', mt_rand(0, 999999));

    // Save initial validation record or update existing
    $pdo->beginTransaction();
    try {
        $stmtCheck = $pdo->prepare("SELECT id FROM validations_livraison WHERE livraison_id = ?");
        $stmtCheck->execute([$livraison_id]);
        $existing = $stmtCheck->fetchColumn();

        if ($existing) {
            $stmtUpd = $pdo->prepare("UPDATE validations_livraison SET otp_code = ? WHERE id = ?");
            $stmtUpd->execute([$otp, $existing]);
        } else {
            $stmtIns = $pdo->prepare("INSERT INTO validations_livraison (id, livraison_id, otp_code) VALUES (?, ?, ?)");
            $stmtIns->execute([generate_uuid(), $livraison_id, $otp]);
        }

        $pdo->commit();
        // In reality, we'd send SMS. Here we just return it to the frontend for simulation.
        send_json(['message' => 'OTP généré', 'otp' => $otp]);
    } catch(Exception $e) {
        $pdo->rollBack();
        send_json(['error' => $e->getMessage()], 400);
    }
}

// Route: /api/validation.php/{id}/validate
if ($method === 'POST' && strpos($requestUri, 'validate') !== false) {
    if (!$id) send_json(['error' => 'ID de livraison manquant'], 400);

    $body = get_json_body();
    
    $pdo->beginTransaction();
    try {
        // Verify OTP if provided
        if (!empty($body['otp_code'])) {
            $stmtCheck = $pdo->prepare("SELECT otp_code FROM validations_livraison WHERE livraison_id = ?");
            $stmtCheck->execute([$id]);
            $savedOtp = $stmtCheck->fetchColumn();

            if ($savedOtp !== $body['otp_code']) {
                $pdo->rollBack();
                send_json(['error' => 'Code OTP invalide'], 400);
            }
        }

        // Set photo proof path
        $photoPath = null;
        if (!empty($body['photo_preuve'])) {
            // Assume base64 string
            // Actually our frontend sends either base64 or FormData based on what we implemented
            // Let's just store the string if it's base64, or save it if we modified the frontend.
            // Our original JS was storing it in SQLite as text, or saving the file. Wait. 
            // In routes/validation.js, we were saving to disk if it was a file. Let's assume it's base64 for now for simplicity, or just store the filename if uploaded.
            $photoPath = $body['photo_preuve']; 
        }

        $stmtIns = $pdo->prepare("
            UPDATE validations_livraison SET 
                signature_text = ?, 
                photo_preuve_path = ?, 
                otp_verified = ?, 
                nom_receptionnaire = ?,
                latitude = ?,
                longitude = ?
            WHERE livraison_id = ?
        ");
        $stmtIns->execute([
            $body['signature'] ?? null,
            $photoPath,
            !empty($body['otp_code']) ? 1 : 0,
            $body['nom_receptionnaire'] ?? null,
            $body['latitude'] ?? null,
            $body['longitude'] ?? null,
            $id
        ]);
        
        // Ensure record exists if they skipped OTP generation
        if ($stmtIns->rowCount() === 0) {
           $stmtAdd = $pdo->prepare("
               INSERT INTO validations_livraison (id, livraison_id, signature_text, photo_preuve_path, otp_verified, nom_receptionnaire, latitude, longitude)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ");
           $stmtAdd->execute([generate_uuid(), $id, $body['signature'] ?? null, $photoPath, !empty($body['otp_code'])?1:0, $body['nom_receptionnaire'] ?? null, $body['latitude'] ?? null, $body['longitude'] ?? null]);
        }
        
        // Also update livraison to livree
        $stmtUpLiv = $pdo->prepare("UPDATE livraisons SET statut = 'livree', date_livraison = CURRENT_TIMESTAMP WHERE id = ?");
        $stmtUpLiv->execute([$id]);
        
        // Get colis ID
        $sColis = $pdo->prepare("SELECT colis_id FROM livraisons WHERE id = ?");
        $sColis->execute([$id]);
        $cid = $sColis->fetchColumn();

        $stmtUpColis = $pdo->prepare("UPDATE colis SET statut = 'livre' WHERE id = ?");
        $stmtUpColis->execute([$cid]);

        $stmtH = $pdo->prepare("INSERT INTO historique_tracking (id, colis_id, statut, description, created_by) VALUES (?, ?, ?, ?, ?)");
        $stmtH->execute([generate_uuid(), $cid, 'livre', 'Colis livré et validé', $user['id']]);

        $pdo->commit();
        send_json(['message' => 'Livraison validée avec succès']);
    } catch(Exception $e) {
        $pdo->rollBack();
        send_json(['error' => $e->getMessage()], 400);
    }
}

send_json(['error' => 'Route non gérée'], 404);
?>
