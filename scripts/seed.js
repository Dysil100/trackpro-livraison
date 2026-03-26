require('dotenv').config();
const pool = require('../config/db');
const { createSchema } = require('../config/schema');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const insert = (sql, params) => pool.query(sql, params);

async function run() {
  console.log('Seeding demo data...');
  await createSchema();

  const adminPass = await bcrypt.hash('admin123', 10);
  const agentPass = await bcrypt.hash('agent123', 10);
  const adminId = uuidv4(), agentId = uuidv4();

  // Users
  await insert(`INSERT INTO users (id,nom,email,password,role,telephone) VALUES (?,?,?,?,?,?)`,
    [adminId,'Administrateur','admin@tracking.com',adminPass,'admin','+33600000001']);
  await insert(`INSERT OR IGNORE INTO users (id,nom,email,password,role) VALUES (?,?,?,?,?)`,
    [agentId,'Agent Dupont','agent@tracking.com',agentPass,'agent']);

  // Livreurs
  const l = [uuidv4(),uuidv4(),uuidv4(),uuidv4()];
  await insert(`INSERT INTO livreurs (id,nom,telephone,vehicule,latitude,longitude) VALUES (?,?,?,?,?,?)`,
    [l[0],'Jean Dubois','+33601020304','Camionnette',48.8566,2.3522]);
  await insert(`INSERT INTO livreurs (id,nom,telephone,vehicule,latitude,longitude) VALUES (?,?,?,?,?,?)`,
    [l[1],'Marie Leroy','+33605060708','Vélo électrique',48.8606,2.3376]);
  await insert(`INSERT INTO livreurs (id,nom,telephone,vehicule,latitude,longitude) VALUES (?,?,?,?,?,?)`,
    [l[2],'Paul Moreau','+33609101112','Moto',48.8490,2.3700]);
  await insert(`INSERT INTO livreurs (id,nom,telephone,vehicule,latitude,longitude) VALUES (?,?,?,?,?,?)`,
    [l[3],'Sophie Petit','+33613141516','Camionnette',48.8700,2.3100]);

  // Expediteurs + Destinataires
  const e = [uuidv4(),uuidv4(),uuidv4()];
  await insert(`INSERT INTO expediteurs (id,nom,telephone,adresse,ville) VALUES (?,?,?,?,?)`,
    [e[0],'Amazon France','+33800001234','12 Rue Rivoli','Paris']);
  await insert(`INSERT INTO expediteurs (id,nom,telephone,adresse,ville) VALUES (?,?,?,?,?)`,
    [e[1],'Fnac Darty','+33800005678','45 Av Champs-Elysées','Paris']);
  await insert(`INSERT INTO expediteurs (id,nom,telephone,adresse,ville) VALUES (?,?,?,?,?)`,
    [e[2],'Cdiscount','+33800009012','120 Bd Haussmann','Bordeaux']);

  const d = [uuidv4(),uuidv4(),uuidv4(),uuidv4(),uuidv4(),uuidv4()];
  const dests = [
    [d[0],'Alice Fontaine','+33611223344','alice@email.com','5 Rue de la Paix','Lyon'],
    [d[1],'Bob Renard','+33622334455','bob@email.com','23 Av Victor Hugo','Marseille'],
    [d[2],'Caroline Blanc','+33633445566','carol@email.com','8 Pl Bellecour','Lyon'],
    [d[3],'David Noir','+33644556677','david@email.com','90 Rue Mouffetard','Paris'],
    [d[4],'Emma Vert','+33655667788','emma@email.com','15 Bd Gambetta','Toulouse'],
    [d[5],'François Gris','+33666778899','francois@email.com','3 Rue République','Nice'],
  ];
  for (const dest of dests) {
    await insert(`INSERT INTO destinataires (id,nom,telephone,email,adresse,ville) VALUES (?,?,?,?,?,?)`, dest);
  }

  // Colis
  const colisData = [
    ['TRK-20240301-00001','paquet',2.5,'standard','livre',e[0],d[0]],
    ['TRK-20240302-00002','document',0.1,'express','livre',e[1],d[1]],
    ['TRK-20240303-00003','fragile',5.0,'standard','en_livraison',e[0],d[2]],
    ['TRK-20240303-00004','paquet',1.2,'express','en_transit',e[2],d[3]],
    ['TRK-20240304-00005','volumineux',15.0,'standard','enregistre',e[1],d[4]],
    ['TRK-20240305-00006','document',0.2,'express','livre',e[2],d[5]],
    ['TRK-20240305-00007','paquet',3.8,'standard','echec',e[0],d[0]],
    ['TRK-20240306-00008','paquet',2.1,'standard','enregistre',e[1],d[1]],
    ['TRK-20240306-00009','fragile',4.5,'express','en_transit',e[0],d[2]],
    ['TRK-20240306-00010','document',0.15,'standard','livre',e[2],d[3]],
  ];

  for (const [num,type,poids,typeLiv,statut,expId,destId] of colisData) {
    const cId = uuidv4();
    await insert(`INSERT OR IGNORE INTO colis (id,numero_suivi,type_colis,poids,type_livraison,statut,expediteur_id,destinataire_id,created_by) VALUES (?,?,?,?,?,?,?,?,?)`,
      [cId,num,type,poids,typeLiv,statut,expId,destId,adminId]);
    await insert(`INSERT INTO historique_tracking (id,colis_id,statut,description,localisation,created_by) VALUES (?,?,?,?,?,?)`,
      [uuidv4(),cId,'enregistre','Colis enregistré','Entrepôt Central Paris',adminId]);
    if (['en_transit','en_livraison','livre','echec'].includes(statut)) {
      await insert(`INSERT INTO historique_tracking (id,colis_id,statut,description,localisation,created_by) VALUES (?,?,?,?,?,?)`,
        [uuidv4(),cId,'en_transit','En cours de traitement','Centre de tri Lyon',adminId]);
    }
    if (['en_livraison','livre'].includes(statut)) {
      await insert(`INSERT INTO historique_tracking (id,colis_id,statut,description,localisation,created_by) VALUES (?,?,?,?,?,?)`,
        [uuidv4(),cId,'en_livraison','Pris en charge par livreur','Agence locale',adminId]);
      const lvId = uuidv4();
      await insert(`INSERT INTO livraisons (id,colis_id,livreur_id,statut) VALUES (?,?,?,?)`,
        [lvId,cId,l[0],'en_cours']);
      if (statut === 'livre') {
        await insert(`INSERT INTO historique_tracking (id,colis_id,statut,description,created_by) VALUES (?,?,?,?,?)`,
          [uuidv4(),cId,'livre','Livré avec succès',adminId]);
        await insert(`UPDATE livraisons SET statut='livree', date_livraison=datetime('now') WHERE id=?`,[lvId]);
        await insert(`INSERT INTO validations_livraison (id,livraison_id,signature_text,nom_receptionnaire,otp_verified) VALUES (?,?,?,?,?)`,
          [uuidv4(),lvId,'Signature reçue','Destinataire',1]);
      }
    }
    await insert(`INSERT INTO notifications (id,colis_id,type,message) VALUES (?,?,?,?)`,
      [uuidv4(),cId,'colis_expedie',`Colis ${num} enregistré et expédié`]);
  }

  console.log('Seed complete — Admin: admin@tracking.com / admin123');
}

module.exports = { run };

// Run directly via: node scripts/seed.js
if (require.main === module) {
  run().then(() => process.exit(0)).catch(err => { console.error(err.message); process.exit(1); });
}
