const express = require('express');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Storage for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/\s/g,'_')}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/validation/:livraison_id - Validate delivery
router.post('/:livraison_id',
  authMiddleware,
  upload.fields([
    { name: 'signature_image', maxCount: 1 },
    { name: 'photo_preuve', maxCount: 1 }
  ]),
  async (req, res) => {
    const { livraison_id } = req.params;
    const { signature_text, otp_code, nom_receptionnaire, latitude, longitude } = req.body;
    try {
      // Check if livraison exists
      const lvResult = await pool.query('SELECT * FROM livraisons WHERE id=$1', [livraison_id]);
      if (lvResult.rows.length === 0) return res.status(404).json({ error: 'Livraison introuvable' });

      const signature_img = req.files?.signature_image?.[0]?.filename || null;
      const photo_preuve = req.files?.photo_preuve?.[0]?.filename || null;

      // OTP verification (simple check - in real app generated & sent separately)
      const otp_verified = otp_code ? otp_code.length >= 4 : false;

      const result = await pool.query(
        `INSERT INTO validations_livraison
         (livraison_id, signature_text, signature_image_path, photo_preuve_path, otp_code, otp_verified, nom_receptionnaire, latitude, longitude)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [livraison_id, signature_text||null, signature_img, photo_preuve,
         otp_code||null, otp_verified, nom_receptionnaire||null, latitude||null, longitude||null]
      );

      // Mark delivery as done
      const lv = lvResult.rows[0];
      await pool.query('UPDATE livraisons SET statut=\'livree\', date_livraison=NOW(), updated_at=NOW() WHERE id=$1', [livraison_id]);
      await pool.query('UPDATE colis SET statut=\'livre\', updated_at=NOW() WHERE id=$1', [lv.colis_id]);

      // Add tracking history
      await pool.query(
        `INSERT INTO historique_tracking (colis_id, statut, description, latitude, longitude, created_by)
         VALUES ($1,'livre','Colis livré et signé par le destinataire',$2,$3,$4)`,
        [lv.colis_id, latitude||null, longitude||null, req.user.id]
      );

      // Free up livreur
      if (lv.livreur_id) {
        await pool.query('UPDATE livreurs SET statut=\'disponible\', updated_at=NOW() WHERE id=$1', [lv.livreur_id]);
      }

      res.status(201).json({ validation: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur lors de la validation' });
    }
  }
);

// GET /api/validation/:livraison_id
router.get('/:livraison_id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM validations_livraison WHERE livraison_id=$1',
      [req.params.livraison_id]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/validation/otp/generate/:colis_id
router.post('/otp/generate/:colis_id', authMiddleware, async (req, res) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  // In prod, send via SMS. Here we return it and log a notification
  await pool.query(
    `INSERT INTO notifications (colis_id, type, message, statut)
     VALUES ($1, 'otp', $2, 'envoye')`,
    [req.params.colis_id, `Code OTP de livraison: ${otp}`]
  );
  res.json({ otp, message: 'OTP généré (simulation - en production envoyé par SMS)' });
});

module.exports = router;
