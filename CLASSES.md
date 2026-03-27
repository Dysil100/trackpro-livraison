# TrackPro — Diagramme des Classes

Voici la représentation visuelle interactive du diagramme de classes pour TrackPro, illustrant les 10 entités de base (User, Livreur, Colis, Livraison, etc.) et leurs relations relationnelles.

![Diagramme des Classes TrackPro](file:///Users/admin/Desktop/Tracking%20srvices/docs/class_diagram.png)

## Rôles et Accès

| Classe | Admin | Agent | Client |
|--------|-------|-------|--------|
| User (CRUD) | ✅ | ❌ | ❌ |
| Colis (CRUD) | ✅ | ✅ | 🔍 Ses colis |
| Livraison | ✅ | ✅ | ❌ |
| Livreur | ✅ | ✅ | ❌ |
| Incident | ✅ | ✅ | ❌ |
| Rapport | ✅ | ✅ | ❌ |
| Tracking public | ✅ | ✅ | ✅ |

