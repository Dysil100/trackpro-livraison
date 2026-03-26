const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1 AND actif = 1', [email]);
    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, nom: user.nom },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    res.json({
      token,
      user: { id: user.id, nom: user.nom, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/register (admin only in prod)
router.post('/register', async (req, res) => {
  const { nom, email, password, role, telephone } = req.body;
  if (!nom || !email || !password)
    return res.status(400).json({ error: 'Nom, email et mot de passe requis' });
  try {
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0)
      return res.status(409).json({ error: 'Email déjà utilisé' });
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (nom, email, password, role, telephone) VALUES ($1,$2,$3,$4,$5) RETURNING id, nom, email, role',
      [nom, email, hash, role || 'agent', telephone || null]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth').authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nom, email, role, telephone, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
