# TrackPro — Diagramme des Classes

```mermaid
classDiagram
    class User {
        +String id
        +String nom
        +String email
        +String password
        +String role
        +String telephone
        +int actif
        +DateTime created_at
        +login()
        +logout()
    }

    class Livreur {
        +String id
        +String nom
        +String telephone
        +String email
        +String vehicule
        +String statut
        +float latitude
        +float longitude
        +DateTime created_at
        +updatePosition(lat, lng)
        +getActiveDeliveries()
    }

    class Colis {
        +String id
        +String numero_suivi
        +String type_colis
        +float poids
        +float volume
        +String description
        +String type_livraison
        +String statut
        +float valeur_declaree
        +String notes
        +DateTime created_at
        +generateNumeroSuivi()
        +getHistorique()
    }

    class Expediteur {
        +String id
        +String nom
        +String telephone
        +String email
        +String adresse
        +String ville
    }

    class Destinataire {
        +String id
        +String nom
        +String telephone
        +String email
        +String adresse
        +String ville
    }

    class Livraison {
        +String id
        +String statut
        +DateTime date_planifiee
        +DateTime date_livraison
        +String adresse_livraison
        +String notes
        +demarrer()
        +completer()
        +signalerEchec()
        +getStatutHistory()
    }

    class HistoriqueTracking {
        +String id
        +String statut
        +String description
        +String localisation
        +float latitude
        +float longitude
        +DateTime created_at
    }

    class Incident {
        +String id
        +String type
        +String description
        +String statut
        +DateTime created_at
        +resoudre()
    }

    class GeoPosition {
        +String id
        +float latitude
        +float longitude
        +DateTime created_at
    }

    class Notification {
        +String id
        +String type
        +String message
        +String statut
        +DateTime created_at
        +envoyer()
    }

    class ValidationLivraison {
        +String id
        +String signature_text
        +String signature_image_path
        +String photo_preuve_path
        +String otp_code
        +int otp_verified
        +String nom_receptionnaire
        +DateTime date_validation
        +verifierOTP()
    }

    %% Relations
    User "1" --> "0..*" Colis : crée
    User "1" --> "0..*" HistoriqueTracking : génère
    User "1" --> "0..*" Incident : signale

    Colis "1" --> "1" Expediteur : vient de
    Colis "1" --> "1" Destinataire : destiné à
    Colis "1" --> "0..*" HistoriqueTracking : possède
    Colis "1" --> "0..1" Livraison : assigné à
    Colis "1" --> "0..*" Notification : génère
    Colis "1" --> "0..*" Incident : sujet de

    Livraison "1" --> "1" Livreur : assigné à
    Livraison "1" --> "0..1" ValidationLivraison : validé par
    Livreur "1" --> "0..*" GeoPosition : trace

    GeoPosition "0..*" --> "0..1" Livraison : associé à
```

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
