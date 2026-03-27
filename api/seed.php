<?php
// api/seed.php — Generates rich test data (admin only)
require_once __DIR__ . '/db.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: POST, OPTIONS");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

$user = authenticate();
if ($user['role'] !== 'admin') send_json(['error' => 'Accès administrateur requis'], 403);

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'POST') send_json(['error' => 'Méthode POST requise'], 405);

$pdo->beginTransaction();
try {
    // --- LIVREURS ---
    $livreurs = [
        ['Dylan Silatsam', '+4915219207140', 'silatsamdylan@gmail.com', 'Moto', 48.8566, 2.3522],
        ['Jean Dubois', '+33601020304', 'jean.dubois@mail.fr', 'Camionnette', 48.8606, 2.3376],
        ['Marie Leroy', '+33605060708', 'marie.leroy@mail.fr', 'Vélo électrique', 48.8496, 2.3460],
        ['Ahmed Benali', '+33612345678', 'ahmed.benali@mail.fr', 'Scooter', 48.8700, 2.3300],
        ['Sophie Martin', '+33623456789', 'sophie.martin@mail.fr', 'Camionnette', 48.8550, 2.3600],
    ];
    $livreurIds = [];
    foreach ($livreurs as $l) {
        // Check if already exists
        $stmtChk = $pdo->prepare("SELECT id FROM livreurs WHERE telephone = ?");
        $stmtChk->execute([$l[1]]);
        $existing = $stmtChk->fetchColumn();
        if ($existing) { $livreurIds[] = $existing; continue; }
        $lid = generate_uuid();
        $stmt = $pdo->prepare("INSERT INTO livreurs (id, nom, telephone, email, vehicule, latitude, longitude, statut) VALUES (?, ?, ?, ?, ?, ?, ?, 'disponible')");
        $stmt->execute([$lid, $l[0], $l[1], $l[2], $l[3], $l[4], $l[5]]);
        $livreurIds[] = $lid;
    }

    // --- USERS (agents) ---
    $agents = [
        ['Agent Julie', 'julie@tracking.com', 'julie123', 'agent', '+33611223344'],
        ['Agent Marc', 'marc@tracking.com', 'marc1234', 'agent', '+33622334455'],
    ];
    foreach ($agents as $a) {
        $stmtChk = $pdo->prepare("SELECT id FROM users WHERE email = ?");
        $stmtChk->execute([$a[1]]);
        if ($stmtChk->fetchColumn()) continue;
        $stmt = $pdo->prepare("INSERT INTO users (id, nom, email, password, role, telephone) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([generate_uuid(), $a[0], $a[1], password_hash($a[2], PASSWORD_BCRYPT), $a[3], $a[4]]);
    }

    // Get admin user
    $adminStmt = $pdo->query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    $adminId = $adminStmt->fetchColumn();

    // --- EXPEDITEURS ---
    $expediteurs = [
        ['Amazon France', '+33800001234', 'logistique@amazon.fr', '12 Rue Rivoli', 'Paris'],
        ['Cdiscount Pro', '+33800005678', 'envois@cdiscount.fr', '120 Quai de Bacalan', 'Bordeaux'],
        ['FNAC Direct', '+33800009012', 'expéditions@fnac.fr', '9 Rue des Immeubles Industriels', 'Paris'],
        ['La Redoute', '+33800003456', 'laredoute@logistique.fr', '110 Rue de Blanchemaille', 'Roubaix'],
    ];
    $expIds = [];
    foreach ($expediteurs as $e) {
        $stmtChk = $pdo->prepare("SELECT id FROM expediteurs WHERE telephone = ?");
        $stmtChk->execute([$e[1]]);
        $existing = $stmtChk->fetchColumn();
        if ($existing) { $expIds[] = $existing; continue; }
        $eid = generate_uuid();
        $stmt = $pdo->prepare("INSERT INTO expediteurs (id, nom, telephone, email, adresse, ville) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$eid, $e[0], $e[1], $e[2], $e[3], $e[4]]);
        $expIds[] = $eid;
    }

    // --- DESTINATAIRES ---
    $destinataires = [
        ['Alice Fontaine', '+33611223344', 'alice@email.com', '5 Rue de la Paix', 'Lyon'],
        ['Bob Tremblay', '+33622334455', 'bob@email.com', '22 Av. des Champs', 'Paris'],
        ['Clara Petit', '+33633445566', 'clara@email.com', '8 Bd Haussmann', 'Marseille'],
        ['David Nguyen', '+33644556677', 'david@email.com', '15 Rue Victor Hugo', 'Toulouse'],
        ['Emma Laurent', '+33655667788', 'emma@email.com', '33 Quai de la Loire', 'Nantes'],
        ['François Bernard', '+33666778899', 'francois@email.com', '7 Rue du Moulin', 'Strasbourg'],
    ];
    $destIds = [];
    foreach ($destinataires as $d) {
        $stmtChk = $pdo->prepare("SELECT id FROM destinataires WHERE telephone = ?");
        $stmtChk->execute([$d[1]]);
        $existing = $stmtChk->fetchColumn();
        if ($existing) { $destIds[] = $existing; continue; }
        $did = generate_uuid();
        $stmt = $pdo->prepare("INSERT INTO destinataires (id, nom, telephone, email, adresse, ville) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$did, $d[0], $d[1], $d[2], $d[3], $d[4]]);
        $destIds[] = $did;
    }

    // --- COLIS + LIVRAISONS + HISTORIQUE ---
    $colisData = [
        // [type, poids, livraison_type, statut, exp_idx, dest_idx, liv_statut, description, jours_ago]
        ['paquet', 2.5, 'standard', 'livre', 0, 0, 'livree', 'Casque audio Sony', 15],
        ['document', 0.3, 'express', 'livre', 1, 1, 'livree', 'Contrat signé', 12],
        ['fragile', 1.8, 'express', 'en_livraison', 2, 2, 'en_cours', 'Vase en porcelaine', 2],
        ['volumineux', 15.0, 'standard', 'en_transit', 3, 3, null, 'Vélo de route', 3],
        ['paquet', 0.8, 'standard', 'enregistre', 0, 4, null, 'Livre de cuisine', 1],
        ['paquet', 3.2, 'express', 'echec', 1, 5, 'echec', 'Téléphone portable', 8],
        ['document', 0.2, 'standard', 'retour', 2, 0, 'echec', 'Facture annulée', 10],
        ['paquet', 5.5, 'standard', 'livre', 3, 1, 'livree', 'Chaussures de sport', 20],
        ['fragile', 2.0, 'express', 'en_livraison', 0, 2, 'en_cours', 'Tablette graphique', 1],
        ['paquet', 1.2, 'standard', 'enregistre', 1, 3, null, 'Accessoires gaming', 0],
    ];

    $numBase = (int)(date('Ymd'));
    $existingCount = (int)$pdo->query("SELECT COUNT(*) FROM colis WHERE numero_suivi LIKE 'TRK-SEED%'")->fetchColumn();

    foreach ($colisData as $i => $cd) {
        $num = 'TRK-SEED-' . str_pad($i + 1 + $existingCount, 5, '0', STR_PAD_LEFT);

        // Skip if already exists
        $stmtChk = $pdo->prepare("SELECT id FROM colis WHERE numero_suivi = ?");
        $stmtChk->execute([$num]);
        if ($stmtChk->fetchColumn()) continue;

        $cId = generate_uuid();
        $joursAgo = $cd[8];
        $createdAt = date('Y-m-d H:i:s', strtotime("-{$joursAgo} days"));

        $expId = $expIds[$cd[4] % count($expIds)] ?? $expIds[0];
        $destId = $destIds[$cd[5] % count($destIds)] ?? $destIds[0];

        $stmtC = $pdo->prepare("INSERT INTO colis (id, numero_suivi, type_colis, poids, type_livraison, statut, expediteur_id, destinataire_id, created_by, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmtC->execute([$cId, $num, $cd[0], $cd[1], $cd[2], $cd[3], $expId, $destId, $adminId, $cd[7], $createdAt]);

        // Historique
        $stmtH = $pdo->prepare("INSERT INTO historique_tracking (id, colis_id, statut, description, localisation, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmtH->execute([generate_uuid(), $cId, 'enregistre', 'Colis enregistré', 'Entrepôt Central', $adminId, $createdAt]);

        if ($cd[3] !== 'enregistre') {
            $atransit = date('Y-m-d H:i:s', strtotime($createdAt) + 3600);
            $stmtH->execute([generate_uuid(), $cId, 'en_transit', 'Prise en charge par le transporteur', 'Centre de tri', $adminId, $atransit]);
        }

        // Livraison
        if ($cd[6] !== null && !empty($livreurIds)) {
            $livId = generate_uuid();
            $livreurId = $livreurIds[$i % count($livreurIds)];
            $planDate = date('Y-m-d H:i:s', strtotime($createdAt) + 86400);
            $livDate = ($cd[6] === 'livree') ? date('Y-m-d H:i:s', strtotime($planDate) + 14400) : null;

            $stmtL = $pdo->prepare("INSERT INTO livraisons (id, colis_id, livreur_id, statut, date_planifiee, date_livraison) VALUES (?, ?, ?, ?, ?, ?)");
            $stmtL->execute([$livId, $cId, $livreurId, $cd[6], $planDate, $livDate]);

            if ($cd[6] === 'livree') {
                $stmtH->execute([generate_uuid(), $cId, 'livre', 'Livré à ' . ['Alice Fontaine','Bob Tremblay','Clara Petit','David Nguyen','Emma Laurent','François Bernard'][$cd[5] % 6], 'Domicile', $adminId, $livDate]);
                $pdo->prepare("INSERT INTO notifications (id, colis_id, type, message) VALUES (?, ?, ?, ?)")->execute([generate_uuid(), $cId, 'statut_livre', 'Votre colis ' . $num . ' a été livré.']);
            } elseif ($cd[6] === 'echec') {
                $stmtH->execute([generate_uuid(), $cId, 'echec', 'Tentative de livraison échouée - Destinataire absent', 'Adresse livraison', $adminId, $planDate]);
            }
        }
    }

    // --- INCIDENTS ---
    $incidents = [
        ['Colis endommagé lors du transport', 'endommage', 'ouvert'],
        ['Destinataire introuvable à l\'adresse indiquée', 'echec_livraison', 'resolu'],
        ['Colis suspecté perdu en transit', 'perdu', 'ouvert'],
    ];
    $allColis = $pdo->query("SELECT id FROM colis LIMIT 10")->fetchAll();
    foreach ($incidents as $j => $inc) {
        if (empty($allColis)) break;
        $cId = $allColis[$j % count($allColis)]['id'];
        $stmtChk = $pdo->prepare("SELECT COUNT(*) FROM incidents WHERE description = ?");
        $stmtChk->execute([$inc[0]]);
        if ($stmtChk->fetchColumn() > 0) continue;
        $pdo->prepare("INSERT INTO incidents (id, colis_id, type, description, statut, created_by) VALUES (?, ?, ?, ?, ?, ?)")->execute([generate_uuid(), $cId, $inc[1], $inc[0], $inc[2], $adminId]);
    }

    $pdo->commit();
    send_json(['message' => 'Données de test générées avec succès', 'counts' => [
        'livreurs' => count($livreurIds),
        'colis' => count($colisData),
        'incidents' => count($incidents)
    ]]);

} catch(Exception $e) {
    $pdo->rollBack();
    send_json(['error' => 'Erreur lors de la génération: ' . $e->getMessage()], 500);
}
?>
