# TrackPro — Diagramme des Fonctionnalités

## Vue d'ensemble des flux

```mermaid
flowchart TD
    A([Utilisateur]) --> LOGIN[Page de connexion]
    LOGIN --> QI[Boutons Quick Login\nAdmin / Agent / Client]
    LOGIN --> FORM[Formulaire email / mot de passe]
    QI & FORM --> AUTH{Auth JWT valide?}
    AUTH -- Non --> LOGIN
    AUTH -- Oui --> ROLE{Rôle?}

    ROLE -- admin --> ADMIN_DASH[Dashboard complet]
    ROLE -- agent --> AGENT_DASH[Dashboard opérationnel]
    ROLE -- client --> TRACKING[Tracking Public]

    %% ADMIN Flows
    ADMIN_DASH --> A1[Gestion Utilisateurs\nCréer · Modifier · Désactiver]
    ADMIN_DASH --> A2[Rapports\nCSV · PDF · Stats]
    ADMIN_DASH --> A3[Données test\nSeed idempotent]
    ADMIN_DASH --> SHARED

    %% AGENT Flows
    AGENT_DASH --> SHARED

    %% SHARED Flows (admin + agent)
    subgraph SHARED[Fonctionnalités partagées Agent/Admin]
        B1[Gestion Colis\nCréer · Suivre · Modifier statut]
        B2[Gestion Livraisons\nPlanifier · Démarrer · Valider · Échec]
        B3[Gestion Livreurs\nCréer · Modifier · Supprimer · Géoloc]
        B4[Incidents\nSignaler · Résoudre]
        B5[Notifications]
        B6[Carte temps réel]
    end

    %% LIVRAISON Flow
    B1 -->|Assigner| B2
    B2 --> LIV_FLOW{Statut livraison}
    LIV_FLOW -- planifiee --> LIV1[Démarrer → en_cours]
    LIV_FLOW -- en_cours --> LIV2[Valider signature/OTP → livree]
    LIV_FLOW -- en_cours --> LIV3[Signaler échec → echec]
    LIV1 & LIV2 & LIV3 --> HIST[Historique tracking mis à jour]
    HIST --> NOTIF[Notification envoyée]

    %% COLIS Statuts
    B1 --> COLIS_FLOW{Statut colis}
    COLIS_FLOW -- enregistre --> C1[en_transit]
    C1 --> C2[en_livraison]
    C2 --> C3[livre / echec / retour]

    %% TRACKING PUBLIC
    TRACKING --> T1[Recherche numéro de suivi]
    T1 --> T2[Affichage statut + historique]
    T2 --> T3[Timeline visuelle]

    %% REPORTS Flow
    A2 --> R1[Filtrer par période]
    R1 --> R2[Stats mensuelles + perf livreurs]
    R2 --> R3[Export CSV]
    R2 --> R4[Export PDF jsPDF]

    %% GEO Flow
    B6 --> G1[Polling AJAX 5s]
    G1 --> G2[Markers Leaflet mis à jour]
    B3 --> G3[Mise à jour position manuelle]
```

## Fonctionnalités par module

| Module | Fonctionnalités |
|--------|----------------|
| **Auth** | Login JWT, Quick Login x3 rôles, Token expiry check |
| **Colis** | CRUD complet, numéro suivi auto, types multiples, historique timeline |
| **Livraisons** | Planification, démarrage, validation OTP/signature, gestion échecs |
| **Livreurs** | CRUD, vérification livraisons actives avant suppression, géolocalisation |
| **Incidents** | Signalement par type, résolution avec statut, liaison colis |
| **Rapports** | Stats mensuelles 6 mois, perf livreurs, export CSV + PDF |
| **Tracking** | Public (sans auth), recherche par numéro, historique complet |
| **Géoloc** | Carte Leaflet, polling AJAX 5s, markers colorés par statut |
| **Notifications** | Automatiques sur changement statut, badge compteur |
| **Utilisateurs** | CRUD admin uniquement, désactivation (pas suppression), 3 rôles |
| **Données test** | Bouton "🧪 Test" dans chaque formulaire, seed API admin |

## Architecture technique

```mermaid
graph LR
    FE[Frontend\nHTML + CSS + JS] -->|AJAX Fetch\n+ JWT Bearer| API[API PHP]
    API --> DB[(SQLite\ntrackpro.db)]
    API --> AUTH[auth.php\nJWT HS256]
    API --> LIVREURS[livreurs.php]
    API --> LIVRAISONS[livraisons.php]
    API --> COLIS[colis.php]
    API --> INCIDENTS[incidents.php]
    API --> REPORTS[reports.php]
    API --> SEED[seed.php]
    API --> USERS[users.php]
    FE --> LEAFLET[Leaflet.js\nOpenStreetMap]
    FE --> CHARTJS[Chart.js]
    FE --> JSPDF[jsPDF]
```
