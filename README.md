# TrackPro - Système de Suivi des Livraisons

Application complète de gestion et de suivi de colis en temps réel, conçue pour être **100% "Zero-Config"**. 

Le projet utilise **PHP et SQLite (PDO)** pour fonctionner instantanément sur n'importe quel hébergement mutualisé classique (cPanel, Plesk) sans aucune installation ou configuration serveur (pas de Node.js, pas de npm, pas de commande à taper en production).

## Fonctionnalités Principales

- 📦 **Recherche Publique** : Suivi de colis sans authentification pour les clients finaux.
- 🔐 **Authentification** : Système de tokens JWT natifs simple avec rôles (Admin/Agent).
- 🚚 **Gestion Livreurs & Livraisons** : Assignation, suivi GPS (via polling), statuts.
- ✍️ **Validation de Livraison** : Signature numérique, géolocalisation, et simulation OTP.
- 📊 **Dashboard & Rapports** : Statistiques complètes et export de données.

## 🚀 Déploiement "Zero-Config" en Production

Le déploiement est **totalement automatisé** via GitHub Actions vers votre hébergement FTP.
Il n'y a **strictement aucune commande à taper**. 
La base de données (`data/trackpro.db`) contenant les tables et l'utilisateur Admin par défaut se créera **automatiquement** à la première visite.

### Identifiants par défaut générés :
| Rôle | Email | Mot de passe |
|------|-------|-------------|
| 👑 Administrateur | `admin@tracking.com` | `admin123` |
| 🧑‍💼 Agent | `agent@tracking.com` | `agent123` |

## 💻 Installation Rapide en Local (Développement)

Si vous souhaitez tester l'application sur votre ordinateur (Localhost) :

### Prérequis :
- **PHP 8.0+** installé sur votre machine.

### Étapes :
1. Clonez le dépôt et naviguez dedans :
   ```bash
   git clone https://github.com/Dysil100/trackpro-livraison
   cd trackpro-livraison
   ```
2. Lancez le serveur de développement PHP intégré (depuis la racine du projet) :
   ```bash
   php -S localhost:3000
   ```
3. Ouvrez votre navigateur sur [http://localhost:3000](http://localhost:3000).

## 🗂 Architecture du Projet

```text
trackpro-livraison/
│
├── api/                  # ⚙️ Scripts Backend (PHP PDO)
│   ├── db.php            # Connexion SQLite, JWT & Création auto du schéma
│   ├── auth.php          # Authentification
│   ├── colis.php         # CRUD Colis & Tracking
│   ├── livraisons.php    # Planification des livraisons
│   ├── livreurs.php      # Gestion livreurs & Geolocation
│   └── validation.php    # OTP et Signature
│
├── data/                 # 🗄️ Dossier de base de données (auto-créé)
│
├── index.html        # 🌐 Point d'entrée Frontend
├── app.js            # Logique SPA (JavaScript Vanilla)
├── style.css         # Thème Premium
└── .github/workflows/    # 🤖 Pipeline CI/CD FTP
```
