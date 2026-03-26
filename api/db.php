<?php
// api/db.php
$dbPath = __DIR__ . '/../data/trackpro.db';
$dbDir = dirname($dbPath);
if (!is_dir($dbDir)) {
    mkdir($dbDir, 0755, true);
}
$dbExists = file_exists($dbPath);

try {
    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    // Initialisation du schéma si la base est vide
    if (!$dbExists || filesize($dbPath) === 0) {
        $schema = <<<SQL
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            nom TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin', 'agent', 'client')),
            telephone TEXT,
            actif INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS livreurs (
            id TEXT PRIMARY KEY,
            nom TEXT NOT NULL,
            telephone TEXT NOT NULL,
            email TEXT UNIQUE,
            vehicule TEXT,
            statut TEXT DEFAULT 'disponible' CHECK(statut IN ('disponible', 'en_course', 'indisponible')),
            latitude REAL,
            longitude REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS expediteurs (
            id TEXT PRIMARY KEY,
            nom TEXT NOT NULL,
            telephone TEXT NOT NULL,
            email TEXT,
            adresse TEXT NOT NULL,
            ville TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS destinataires (
            id TEXT PRIMARY KEY,
            nom TEXT NOT NULL,
            telephone TEXT NOT NULL,
            email TEXT,
            adresse TEXT NOT NULL,
            ville TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS colis (
            id TEXT PRIMARY KEY,
            numero_suivi TEXT UNIQUE NOT NULL,
            type_colis TEXT NOT NULL,
            poids REAL,
            volume REAL,
            description TEXT,
            type_livraison TEXT DEFAULT 'standard',
            statut TEXT DEFAULT 'enregistre',
            expediteur_id TEXT REFERENCES expediteurs(id),
            destinataire_id TEXT REFERENCES destinataires(id),
            created_by TEXT REFERENCES users(id),
            valeur_declaree REAL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS livraisons (
            id TEXT PRIMARY KEY,
            colis_id TEXT REFERENCES colis(id),
            livreur_id TEXT REFERENCES livreurs(id),
            statut TEXT DEFAULT 'en_attente',
            date_planifiee TIMESTAMP,
            date_livraison TIMESTAMP,
            adresse_livraison TEXT,
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS historique_tracking (
            id TEXT PRIMARY KEY,
            colis_id TEXT REFERENCES colis(id),
            statut TEXT NOT NULL,
            description TEXT,
            localisation TEXT,
            latitude REAL,
            longitude REAL,
            created_by TEXT REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS validations_livraison (
            id TEXT PRIMARY KEY,
            livraison_id TEXT REFERENCES livraisons(id),
            signature_text TEXT,
            signature_image_path TEXT,
            photo_preuve_path TEXT,
            otp_code TEXT,
            otp_verified INTEGER DEFAULT 0,
            nom_receptionnaire TEXT,
            date_validation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            latitude REAL,
            longitude REAL
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            colis_id TEXT REFERENCES colis(id),
            destinataire_email TEXT,
            destinataire_telephone TEXT,
            type TEXT NOT NULL,
            message TEXT NOT NULL,
            statut TEXT DEFAULT 'en_attente',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS incidents (
            id TEXT PRIMARY KEY,
            colis_id TEXT REFERENCES colis(id),
            type TEXT NOT NULL,
            description TEXT NOT NULL,
            statut TEXT DEFAULT 'ouvert',
            created_by TEXT REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS geo_positions (
            id TEXT PRIMARY KEY,
            livreur_id TEXT REFERENCES livreurs(id),
            livraison_id TEXT REFERENCES livraisons(id),
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
SQL;
        $pdo->exec($schema);

        // Seed data (Admin: admin@tracking.com / admin123)
        $adminId = bin2hex(random_bytes(16));
        $adminPass = password_hash('admin123', PASSWORD_BCRYPT);
        
        $stmt = $pdo->prepare("INSERT INTO users (id, nom, email, password, role, telephone) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$adminId, 'Administrateur', 'admin@tracking.com', $adminPass, 'admin', '+33600000001']);
        
        $agentId = bin2hex(random_bytes(16));
        $agentPass = password_hash('agent123', PASSWORD_BCRYPT);
        $stmt->execute([$agentId, 'Agent Dupont', 'agent@tracking.com', $agentPass, 'agent', null]);
        
        // Demo Data: Livreurs
        $l1 = bin2hex(random_bytes(16));
        $l2 = bin2hex(random_bytes(16));
        $stmt = $pdo->prepare("INSERT INTO livreurs (id, nom, telephone, vehicule, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$l1, 'Jean Dubois', '+33601020304', 'Camionnette', 48.8566, 2.3522]);
        $stmt->execute([$l2, 'Marie Leroy', '+33605060708', 'Vélo électrique', 48.8606, 2.3376]);

        // Expediteur
        $e1 = bin2hex(random_bytes(16));
        $stmt = $pdo->prepare("INSERT INTO expediteurs (id, nom, telephone, adresse, ville) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$e1, 'Amazon France', '+33800001234', '12 Rue Rivoli', 'Paris']);

        // Destinataire
        $d1 = bin2hex(random_bytes(16));
        $stmt = $pdo->prepare("INSERT INTO destinataires (id, nom, telephone, email, adresse, ville) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$d1, 'Alice Fontaine', '+33611223344', 'alice@email.com', '5 Rue de la Paix', 'Lyon']);

        // Colis Demo
        $c1 = bin2hex(random_bytes(16));
        $stmt = $pdo->prepare("INSERT INTO colis (id, numero_suivi, type_colis, poids, type_livraison, statut, expediteur_id, destinataire_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$c1, 'TRK-20240301-00001', 'paquet', 2.5, 'standard', 'en_transit', $e1, $d1, $adminId]);

        // Historique Demo
        $h1 = bin2hex(random_bytes(16));
        $h2 = bin2hex(random_bytes(16));
        $stmt = $pdo->prepare("INSERT INTO historique_tracking (id, colis_id, statut, description, localisation, created_by) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$h1, $c1, 'enregistre', 'Colis enregistré', 'Entrepôt Central Paris', $adminId]);
        $stmt->execute([$h2, $c1, 'en_transit', 'En cours de traitement', 'Centre de tri Lyon', $adminId]);
    }
} catch (PDOException $e) {
    die(json_encode(["error" => "Erreur de base de données: " . $e->getMessage()]));
}

// Utilitaires généraux de sécurité et JWT
define('JWT_SECRET', 'trackpro_prod_secret_2024');

function generate_uuid() {
    return bin2hex(random_bytes(16));
}

function jwt_encode($payload) {
    $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
    $payload = json_encode($payload);
    $bstr1 = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($header));
    $bstr2 = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($payload));
    $signature = hash_hmac('sha256', $bstr1 . "." . $bstr2, JWT_SECRET, true);
    $bstr3 = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));
    return $bstr1 . "." . $bstr2 . "." . $bstr3;
}

function jwt_decode($token) {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    list($h64, $p64, $s64) = $parts;
    
    $sig = base64_decode(str_replace(['-', '_'], ['+', '/'], $s64));
    $expected = hash_hmac('sha256', $h64 . "." . $p64, JWT_SECRET, true);
    
    if (hash_equals($sig, $expected)) {
        return json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $p64)), true);
    }
    return null;
}

function authenticate() {
    $headers = apache_request_headers();
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (preg_match('/Bearer\s(\S+)/', $auth, $matches)) {
        $token = $matches[1];
        $payload = jwt_decode($token);
        if ($payload && isset($payload['id'])) {
            return $payload;
        }
    }
    http_response_code(401);
    echo json_encode(['error' => 'Non autorisé. Token invalide ou manquant.']);
    exit;
}

function send_json($data, $status = 200) {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function get_json_body() {
    return json_decode(file_get_contents('php://input'), true);
}
?>
