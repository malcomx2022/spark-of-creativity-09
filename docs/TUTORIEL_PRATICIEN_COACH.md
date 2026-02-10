# 📖 Tutoriel Complet – Praticien & Coach Sportif

## De l'inscription à la gestion du dashboard

---

## Table des matières

1. [Inscription](#1-inscription)
2. [Confirmation email](#2-confirmation-email)
3. [Validation KYC par l'administrateur](#3-validation-kyc)
4. [Connexion au compte](#4-connexion)
5. [Dashboard Praticien](#5-dashboard-praticien)
6. [Dashboard Coach Sportif](#6-dashboard-coach-sportif)
7. [Workflows avec les patients](#7-workflows-patients)

---

## 1. Inscription

### 1.1 Accéder au formulaire

1. Depuis la page d'accueil (`/`), cliquez sur **"S'inscrire"**
2. Choisissez **"Je suis un professionnel de santé"**
3. Vous arrivez sur le formulaire d'inscription praticien (`/signup/practitioner`)

### 1.2 Remplir les informations personnelles

| Champ | Détail | Obligatoire |
|-------|--------|:-----------:|
| Prénom | Min. 2 caractères, lettres uniquement | ✅ |
| Nom | Min. 2 caractères, lettres uniquement | ✅ |
| Date de naissance | Âge entre 18 et 100 ans | ✅ |
| Sexe | Homme / Femme | ✅ |
| Adresse | Min. 5 caractères, autocomplétion Mapbox | ✅ |
| Téléphone | Format international (ex: +22996123456) | ✅ |
| Email | Format email valide | ✅ |
| Mot de passe | Min. 8 caractères | ✅ |
| Confirmation mot de passe | Doit correspondre au mot de passe | ✅ |

### 1.3 Choisir sa profession

Les professions disponibles sont :

- **Médecin généraliste**
- **Infirmier(ère)**
- **Kinésithérapeute**
- **Nutritionniste**
- **Sage-femme**
- **Psychologue**
- **Coach sportif** ← affiche des champs supplémentaires
- **Autre**

### 1.4 Informations professionnelles

| Champ | Praticien médical | Coach sportif |
|-------|:-----------------:|:-------------:|
| Spécialité | ✅ Obligatoire | ✅ (spécialité sportive) |
| N° d'enregistrement | Optionnel | Optionnel |
| Années d'expérience (0-70) | ✅ | ✅ |
| Structure actuelle | Optionnel | Optionnel |
| Types de séances | ❌ | ✅ (individuelle, duo, groupe) – min. 1 |
| Zone d'intervention | ❌ | ✅ (min. 3 caractères) |
| Rayon d'intervention | ❌ | ✅ (1 à 100 km) |
| Certifications | ❌ | Optionnel (séparées par virgules) |

### 1.5 Documents à fournir

| Document | Praticien médical | Coach sportif | Format |
|----------|:-----------------:|:-------------:|--------|
| Photo de profil | Optionnel | Optionnel | JPG, PNG < 5 Mo |
| Pièce d'identité | **Obligatoire** | **Obligatoire** | PDF, JPG, PNG < 5 Mo |
| Diplôme/Certificat | Optionnel | Optionnel | PDF, JPG, PNG < 5 Mo |
| Autorisation d'exercice | Optionnel | ❌ Non affiché | PDF, JPG, PNG < 5 Mo |

### 1.6 Accepter les conditions

- ☑ Cochez **"J'accepte les conditions d'utilisation"** et **"J'accepte la politique de confidentialité"**
- Cliquez sur **"Créer mon compte professionnel"**

### 1.7 Ce qui se passe à la soumission

```
1. Création du compte authentification (email + mot de passe)
2. Upload des documents sur le stockage sécurisé (Wasabi S3)
3. Création du profil utilisateur
4. Création de la fiche praticien (statut KYC : "pending")
5. Notification envoyée aux administrateurs pour la validation KYC
6. Redirection vers la page de succès
```

> ⚠️ **Important** : Ne fermez pas la page pendant la soumission. L'upload des documents peut prendre quelques secondes.

---

## 2. Confirmation email

### 2.1 Page de succès d'inscription

Après l'inscription, vous êtes redirigé vers `/registration-success` qui affiche :

- ✅ **"Inscription réussie !"**
- Un message indiquant que votre email doit être confirmé
- Un bouton pour renvoyer l'email de confirmation si nécessaire

### 2.2 Confirmer votre email

1. Ouvrez votre boîte email
2. Cherchez l'email de **Domicares** (vérifiez les spams)
3. Cliquez sur le **lien de confirmation**
4. Vous serez redirigé vers l'application

### 2.3 Après confirmation

- La page de succès détecte automatiquement la confirmation (vérification toutes les 5 secondes)
- Un **compte à rebours de 10 secondes** démarre avant la redirection automatique
- Vous pouvez aussi cliquer sur **"Accéder à mon espace"** pour aller directement au dashboard

> **Redirection automatique :**
> - Praticien médical → `/dashboard/practitioner`
> - Coach sportif → `/dashboard/coach`

---

## 3. Validation KYC

### 3.1 Statut initial

Après l'inscription, votre compte est en statut **"En attente de validation"** (`kyc_status: pending`).

**Ce que cela signifie :**
- ✅ Vous pouvez accéder à votre dashboard
- ✅ Vous pouvez compléter votre profil
- ✅ Vous pouvez configurer vos disponibilités
- ❌ Vous **ne pouvez pas** accepter ou refuser de rendez-vous
- ❌ Vous **n'apparaissez pas** dans les recherches patients

### 3.2 Processus de validation par l'admin

1. L'administrateur voit votre dossier dans la **file KYC** (`/admin?tab=kyc`)
2. Il examine vos documents (pièce d'identité, diplôme, etc.)
3. Il peut :
   - ✅ **Approuver** → `kyc_status: approved` + `can_accept_missions: true`
   - ❌ **Rejeter** → `kyc_status: rejected` (avec motif)

### 3.3 Notification de validation

- Vous recevez une **notification in-app** dans l'onglet Notifications
- Un **email/SMS** vous informe du changement de statut

### 3.4 Après approbation

- ✅ Vous apparaissez dans les résultats de recherche des patients
- ✅ Vous pouvez accepter/refuser des demandes de rendez-vous
- ✅ Toutes les fonctionnalités du dashboard sont débloquées

---

## 4. Connexion

### 4.1 Se connecter

1. Allez sur la page de connexion (`/login`)
2. Entrez votre **email** et **mot de passe**
3. Cliquez sur **"Se connecter"**

### 4.2 Connexion par OTP (alternative)

1. Allez sur `/login` puis cliquez sur **"Se connecter avec OTP"**
2. Entrez votre **numéro de téléphone**
3. Recevez un code par SMS
4. Entrez le code de vérification à 6 chiffres

### 4.3 Redirection après connexion

Le système détecte automatiquement votre rôle et redirige :

| Rôle | Dashboard |
|------|-----------|
| Praticien médical | `/dashboard/practitioner` |
| Coach sportif | `/dashboard/coach` |
| Patient | `/dashboard/patient` |
| Admin | `/admin` |

### 4.4 Mot de passe oublié

1. Sur la page de connexion, cliquez sur **"Mot de passe oublié ?"**
2. Entrez votre email
3. Recevez un lien de réinitialisation par email
4. Créez un nouveau mot de passe (min. 8 caractères)

---

## 5. Dashboard Praticien

**Route :** `/dashboard/practitioner`

### 5.1 Vue d'ensemble (Statistiques)

En haut du dashboard, 4 cartes de statistiques :

| Carte | Description |
|-------|-------------|
| **À traiter** | Nombre de demandes de RDV en attente |
| **Confirmés** | Rendez-vous à venir confirmés |
| **Terminés** | Consultations terminées ce mois |
| **Temps total** | Minutes de consultation ce mois |

### 5.2 Onglets disponibles

#### 📅 RDV (Rendez-vous)
Gérez vos consultations avec 4 sous-onglets :

| Sous-onglet | Actions possibles |
|-------------|-------------------|
| **À traiter** | Accepter ✅ ou Refuser ❌ les demandes |
| **Paiement** | Voir les RDV acceptés en attente de paiement patient |
| **Confirmés** | Marquer comme terminé ✅ ou Annuler ❌ |
| **Terminés** | Historique des consultations passées |

**Workflow d'un rendez-vous :**
```
Patient demande RDV → [À traiter]
    ↓ Accepter
RDV en attente de paiement → [Paiement]
    ↓ Patient paie
RDV confirmé → [Confirmés]
    ↓ Consultation terminée
RDV terminé → [Terminés]
```

#### 👤 Profil
- **Profil professionnel** : Photo, bio, spécialité, expérience
- **Modifier la photo de profil** : Cliquez sur l'icône caméra sur l'avatar
- **Localisation** : Adresse du cabinet, zone d'intervention
- **Documents** : Visualiser vos documents KYC uploadés

#### ⏰ Disponibilités
- Configurez vos **créneaux hebdomadaires** (lundi à dimanche)
- Ajoutez des **exceptions** (congés, absences ponctuelles)
- Les patients ne pourront réserver que sur vos créneaux disponibles

#### 💳 Coordonnées bancaires
- Renseignez vos informations de paiement pour recevoir vos revenus
- Ajoutez votre **numéro MoMo** (Mobile Money) ou compte bancaire

#### 💰 Revenus
- Consultez l'historique de vos paiements reçus
- Suivez vos revenus mensuels
- Statut des versements (en attente, traité, etc.)

#### 📋 Rapports
- Créez des **rapports de consultation** après chaque rendez-vous
- Renseignez : diagnostic, prescriptions, recommandations de suivi
- Option de partage avec le médecin traitant du patient

#### 💬 Messages
- Messagerie intégrée avec vos patients
- Liée aux rendez-vous (un fil de discussion par RDV)
- Pièces jointes supportées

#### ⭐ Avis
- Consultez les avis laissés par vos patients
- Note moyenne et commentaires détaillés

#### ❓ Support
- Créez des **tickets de support** en cas de problème
- Suivez le statut de vos demandes d'assistance

---

## 6. Dashboard Coach Sportif

**Route :** `/dashboard/coach`

### 6.1 Vue d'ensemble (Statistiques)

3 cartes de statistiques :

| Carte | Description |
|-------|-------------|
| **Activités à venir** | Séances de groupe + RDV individuels planifiés |
| **Participants totaux** | Nombre total de participants inscrits |
| **Revenus** | Revenus nets (95% après commission plateforme de 5%) |

### 6.2 Onglets disponibles

#### 👥 Séances (de groupe)
**Fonctionnalité exclusive au coach sportif**

- **Créer une séance** : Nom, type, date, horaire, lieu, prix, capacité min/max
- **Gérer les séances** :
  - Confirmer une séance planifiée
  - Annuler une séance (les participants sont notifiés)
  - Voir les participants inscrits
- **Types de séances** : Individuelle, duo, groupe

| Statut séance | Description |
|---------------|-------------|
| `planifiee` | Séance créée, en attente de participants |
| `confirmee` | Séance confirmée par le coach |
| `terminee` | Séance terminée |
| `annulee` | Séance annulée |

#### 📋 Rendez-vous (individuels)
Même fonctionnement que pour le praticien :
- Voir les demandes en attente
- Accepter / Refuser
- Suivi des RDV confirmés et terminés

#### 💰 Revenus
- **Coordonnées bancaires** : Configurer vos informations de paiement
- **Historique des revenus** : Séances + consultations individuelles
- Commission plateforme : **5%** (le coach reçoit **95%**)

#### 📅 Disponibilité
- Configurer vos créneaux hebdomadaires
- Ajouter des exceptions (congés, indisponibilités)

#### 👤 Profil
- Modifier votre **photo de profil**
- Mettre à jour votre **bio** et **spécialité sportive**
- Voir vos **documents KYC**
- Modifier vos informations de localisation

#### 🔔 Notifications
- Notifications en temps réel
- Nouvelles demandes de RDV
- Inscriptions aux séances de groupe
- Changements de statut KYC

#### ❓ Support
- Créer des tickets de support
- Suivre l'avancement de vos demandes

---

## 7. Workflows avec les patients

### 7.1 Le patient vous trouve

**Pour un praticien médical :**
1. Le patient va sur **"Rechercher un praticien"** (`/search-practitioners`)
2. Il filtre par spécialité, localisation, disponibilité
3. Il consulte votre profil (photo, bio, avis, tarifs)

**Pour un coach sportif :**
1. Le patient va sur **"Rechercher un coach"** (`/search-coaches`)
2. Il peut aussi s'inscrire directement à une **séance de groupe** publique

### 7.2 Demande de rendez-vous individuel

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   PATIENT    │     │  PRATICIEN   │     │   SYSTÈME    │
│              │     │  / COACH     │     │              │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │ Demande RDV        │                    │
       │ (date, heure,      │                    │
       │  motif, adresse)   │                    │
       │───────────────────>│                    │
       │                    │                    │
       │                    │ Notification       │
       │                    │<───────────────────│
       │                    │                    │
       │                    │ Accepte ✅          │
       │                    │───────────────────>│
       │                    │                    │
       │ Notification       │                    │
       │ "Payez pour        │                    │
       │  confirmer"        │                    │
       │<───────────────────│                    │
       │                    │                    │
       │ Paiement           │                    │
       │ (FedaPay/MoMo)     │                    │
       │───────────────────────────────────────>│
       │                    │                    │
       │                    │ RDV confirmé       │
       │                    │<───────────────────│
       │ RDV confirmé       │                    │
       │<───────────────────│                    │
       │                    │                    │
       │      CONSULTATION EN COURS              │
       │                    │                    │
       │                    │ Marque "Terminé"   │
       │                    │───────────────────>│
       │                    │                    │
       │                    │ Rédige rapport     │
       │                    │───────────────────>│
       │                    │                    │
       │ Peut laisser       │                    │
       │ un avis ⭐          │                    │
       │───────────────────>│                    │
       │                    │                    │
```

### 7.3 Séance de groupe (Coach uniquement)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    COACH     │     │   PATIENTS   │     │   SYSTÈME    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │ Crée une séance    │                    │
       │ (nom, date, prix,  │                    │
       │  capacité, lieu)   │                    │
       │───────────────────────────────────────>│
       │                    │                    │
       │                    │ Voit la séance     │
       │                    │ dans la recherche  │
       │                    │<───────────────────│
       │                    │                    │
       │                    │ S'inscrit + paie   │
       │                    │───────────────────>│
       │                    │                    │
       │ Notification       │                    │
       │ "Nouveau           │                    │
       │  participant"      │                    │
       │<───────────────────│                    │
       │                    │                    │
       │ Confirme la séance │                    │
       │ (si min atteint)   │                    │
       │───────────────────────────────────────>│
       │                    │                    │
       │                    │ Notification       │
       │                    │ "Séance confirmée" │
       │                    │<───────────────────│
       │                    │                    │
       │    SÉANCE SE DÉROULE                    │
       │                    │                    │
       │ Marque "Terminée"  │                    │
       │───────────────────────────────────────>│
       │                    │                    │
```

### 7.4 Cycle de paiement

| Étape | Statut paiement | Action |
|-------|-----------------|--------|
| 1. Patient paie | `approved` | Fonds retenus sur la plateforme |
| 2. Consultation terminée | `held` | Période de rétention (protection) |
| 3. Période écoulée | `released` | Fonds versés au praticien/coach |
| 4. Versement effectué | `paid` | Visible dans l'onglet Revenus |

### 7.5 Messagerie

- Chaque rendez-vous dispose d'un **fil de discussion dédié**
- Le praticien et le patient peuvent échanger avant, pendant et après la consultation
- **Pièces jointes** supportées (images, PDF)
- Messages non lus signalés par un badge

### 7.6 Rapports de consultation (Praticien uniquement)

Après avoir marqué un rendez-vous comme "terminé" :

1. Allez dans l'onglet **Rapports**
2. Cliquez sur **"Nouveau rapport"**
3. Remplissez :
   - Type de consultation
   - Motif de consultation
   - Observations cliniques
   - Diagnostic principal
   - Prescription/traitement
   - Recommandation de suivi
   - Niveau de sévérité
4. Option : **Partager avec le médecin traitant** du patient

### 7.7 Avis patients

- Après une consultation terminée, le patient peut laisser un **avis**
- L'avis comprend une **note** (étoiles) et un **commentaire**
- Les avis sont visibles sur votre profil public et dans l'onglet Avis du dashboard

---

## Récapitulatif des différences Praticien vs Coach

| Fonctionnalité | Praticien médical | Coach sportif |
|----------------|:-----------------:|:-------------:|
| **Route dashboard** | `/dashboard/practitioner` | `/dashboard/coach` |
| **Séances de groupe** | ❌ | ✅ |
| **Rapports de consultation** | ✅ | ❌ |
| **Messages patients** | ✅ | ❌ (via RDV) |
| **Disponibilités** | ✅ | ✅ |
| **Photo de profil modifiable** | ✅ | ✅ |
| **Revenus & paiements** | ✅ | ✅ |
| **Avis patients** | ✅ | ❌ |
| **Support** | ✅ | ✅ |
| **Commission plateforme** | Variable | 5% |
| **Documents KYC** | ID + Diplôme + Licence | ID + Diplôme |
| **Autorisation d'exercice** | Optionnelle | Non requise |

---

## FAQ

### ❓ Mon compte est en attente de validation, que faire ?
Patientez que l'administrateur examine vos documents. Vous recevrez une notification dès la validation. En attendant, complétez votre profil et configurez vos disponibilités.

### ❓ Mon KYC a été rejeté, que faire ?
Contactez le support via l'onglet **Support** de votre dashboard. Vérifiez que vos documents sont lisibles, non expirés et au bon format.

### ❓ Comment modifier ma photo de profil ?
Dans l'onglet **Profil**, cliquez sur l'icône 📷 sur votre avatar. Sélectionnez une image (JPG, PNG ou WebP, max 5 Mo).

### ❓ Comment configurer mes disponibilités ?
Dans l'onglet **Disponibilités**, ajoutez vos créneaux pour chaque jour de la semaine. Vous pouvez aussi ajouter des exceptions pour les jours fériés ou congés.

### ❓ Quand recevrai-je mes paiements ?
Les fonds sont retenus pendant une période de protection après la consultation, puis automatiquement versés sur votre compte bancaire ou MoMo configuré.

### ❓ Un patient ne s'est pas présenté, que faire ?
Vous pouvez marquer le rendez-vous comme **annulé** depuis l'onglet RDV. Contactez le support si un remboursement est nécessaire.
