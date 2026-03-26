const pool = require('./db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, nom TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL, role TEXT DEFAULT 'agent', telephone TEXT,
  actif INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS livreurs (
  id TEXT PRIMARY KEY, nom TEXT NOT NULL, telephone TEXT NOT NULL,
  email TEXT, vehicule TEXT, statut TEXT DEFAULT 'disponible',
  latitude REAL DEFAULT 48.8566, longitude REAL DEFAULT 2.3522,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS expediteurs (
  id TEXT PRIMARY KEY, nom TEXT NOT NULL, telephone TEXT NOT NULL,
  email TEXT, adresse TEXT NOT NULL, ville TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS destinataires (
  id TEXT PRIMARY KEY, nom TEXT NOT NULL, telephone TEXT NOT NULL,
  email TEXT, adresse TEXT NOT NULL, ville TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS colis (
  id TEXT PRIMARY KEY, numero_suivi TEXT UNIQUE NOT NULL,
  type_colis TEXT DEFAULT 'paquet', poids REAL, volume REAL,
  description TEXT, type_livraison TEXT DEFAULT 'standard',
  statut TEXT DEFAULT 'enregistre', expediteur_id TEXT, destinataire_id TEXT,
  created_by TEXT, valeur_declaree REAL, notes TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS livraisons (
  id TEXT PRIMARY KEY, colis_id TEXT, livreur_id TEXT,
  statut TEXT DEFAULT 'planifiee', date_planifiee TEXT, date_livraison TEXT,
  adresse_livraison TEXT, notes TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS historique_tracking (
  id TEXT PRIMARY KEY, colis_id TEXT, statut TEXT NOT NULL,
  description TEXT, localisation TEXT, latitude REAL, longitude REAL,
  created_by TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS validations_livraison (
  id TEXT PRIMARY KEY, livraison_id TEXT, signature_text TEXT,
  signature_image_path TEXT, photo_preuve_path TEXT,
  otp_code TEXT, otp_verified INTEGER DEFAULT 0,
  nom_receptionnaire TEXT, date_validation TEXT DEFAULT (datetime('now')),
  latitude REAL, longitude REAL);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, colis_id TEXT, destinataire_email TEXT,
  destinataire_telephone TEXT, type TEXT, message TEXT,
  statut TEXT DEFAULT 'envoye', created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY, colis_id TEXT, type TEXT, description TEXT NOT NULL,
  statut TEXT DEFAULT 'ouvert', created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS geo_positions (
  id TEXT PRIMARY KEY, livreur_id TEXT, livraison_id TEXT,
  latitude REAL NOT NULL, longitude REAL NOT NULL, created_at TEXT DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_colis_num ON colis(numero_suivi);
CREATE INDEX IF NOT EXISTS idx_colis_statut ON colis(statut);
CREATE INDEX IF NOT EXISTS idx_hist_colis ON historique_tracking(colis_id);
CREATE INDEX IF NOT EXISTS idx_liv_colis ON livraisons(colis_id)
`;

async function createSchema() {
  await pool.execSchema(SCHEMA);
  console.log('✅ Database schema ready');
}

module.exports = { createSchema };
