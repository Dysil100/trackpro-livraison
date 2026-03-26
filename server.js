require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { createSchema } = require('./config/schema');
const pool = require('./config/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth',       require('./routes/auth'));
app.use('/api/colis',      require('./routes/colis'));
app.use('/api/livreurs',   require('./routes/livreurs'));
app.use('/api/livraisons', require('./routes/livraisons'));
app.use('/api/validation', require('./routes/validation'));
app.use('/api/dashboard',  require('./routes/dashboard'));
app.use('/api/incidents',  require('./routes/incidents'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/reports',    require('./routes/reports'));

app.set('io', io);

// Real-time tracking via Socket.io
io.on('connection', (socket) => {
  socket.on('track_colis',    (id) => socket.join(`colis_${id}`));
  socket.on('track_livraison',(id) => socket.join(`livraison_${id}`));
  socket.on('livreur_position', async ({ livreur_id, latitude, longitude, livraison_id }) => {
    if (!livreur_id || !latitude || !longitude) return;
    try {
      await pool.query('UPDATE livreurs SET latitude=$1, longitude=$2 WHERE id=$3', [latitude, longitude, livreur_id]);
      await pool.query('INSERT INTO geo_positions (id,livreur_id,livraison_id,latitude,longitude) VALUES (?,?,?,?,?)',
        [require('crypto').randomUUID(), livreur_id, livraison_id||null, latitude, longitude]);
      if (livraison_id) io.to(`livraison_${livraison_id}`).emit('position_update', { livreur_id, latitude, longitude });
    } catch (e) { /* silent */ }
  });
});

// SPA fallback
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, 'public', 'index.html'));
  else res.status(404).json({ error: 'Route non trouvée' });
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await createSchema();

    // Auto-seed on first run (if no admin user exists)
    const check = await pool.query("SELECT COUNT(*) as n FROM users WHERE role='admin'");
    if (!check.rows[0] || parseInt(check.rows[0].n || 0) === 0) {
      console.log('First run — seeding demo data...');
      await require('./scripts/seed').run();
      console.log('Demo data loaded.');
    }

    server.listen(PORT, () => {
      console.log(`\nTrackPro ready at http://localhost:${PORT}`);
      console.log('Admin: admin@tracking.com / admin123');
    });
  } catch (err) {
    console.error('Startup error:', err.message);
    process.exit(1);
  }
}

start();
module.exports = { app, io };
