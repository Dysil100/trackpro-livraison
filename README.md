# TrackPro — Suivi des Livraisons

Application web complète de gestion et tracking de livraisons. Stack : **Node.js + SQLite** (zéro dépendance externe, base de données embarquée).

## Démarrage en une commande

```bash
npm install && npm start
```

Ouvrir **http://localhost:3000**

**Comptes de démonstration :**
| Rôle | Email | Mot de passe |
|------|-------|-------------|
| Admin | admin@tracking.com | admin123 |
| Agent | agent@tracking.com | agent123 |

> La base de données SQLite et les données de démonstration sont créées automatiquement au premier lancement.

---

## Fonctionnalités

- **Tableau de bord** — statistiques, graphiques, retards détectés
- **Gestion des colis** — création, suivi, mise à jour de statut
- **Gestion des livraisons** — affectation livreurs, démarrage, validation
- **Livreurs** — profils, disponibilité, performance
- **Géolocalisation** — carte Leaflet avec simulation de déplacement
- **Tracking public** — suivi par numéro de colis (sans login)
- **Validation de livraison** — signature, code OTP, photo preuve
- **Incidents** — signalement et résolution
- **Rapports** — statistiques mensuelles, export CSV
- **Utilisateurs** — RBAC (admin / agent / client)

---

## Structure du projet

```
├── server.js          # Point d'entrée (auto-init DB au premier lancement)
├── config/
│   ├── db.js          # Adaptateur SQLite (compatible API pg)
│   └── schema.js      # Schéma base de données
├── routes/            # Endpoints API REST
├── middleware/auth.js # JWT + RBAC
├── scripts/seed.js    # Données de démonstration
├── public/            # Frontend SPA (HTML/CSS/JS)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── data/              # Base SQLite (auto-créé)
├── uploads/           # Fichiers uploadés (auto-créé)
└── .env               # Configuration
```

## Variables d'environnement (`.env`)

```ini
PORT=3000
DB_PATH=./data/trackpro.db
JWT_SECRET=change_me_in_production
JWT_EXPIRES_IN=7d
```

## Réinitialiser les données de démonstration

```bash
rm -f data/trackpro.db && npm start
```
