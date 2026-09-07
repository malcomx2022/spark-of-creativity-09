# Revue des Workflows Admin - DomiCares

**Date:** 2026-01-27
**Version:** 1.0

---

## 1. Architecture du Dashboard Admin

### 1.1 Structure Principale (`AdminDashboard.tsx`)

Le dashboard admin comprend **12 onglets** principaux avec lazy loading pour optimiser les performances.

| Tab | Composant | Accès | Description |
|-----|-----------|-------|-------------|
| dashboard | UsersManagementSection | Tous admins | Gestion patients/praticiens |
| admins | AdminManagement | super_admin | Gestion des comptes admin |
| kyc | KYCQueue | Tous admins | Validation KYC praticiens |
| operations | OperationsSection | Tous admins | RDV, avis, litiges |
| finance | FinanceSection | Tous admins | Paiements, payouts, fonds |
| support | SupportSection | Tous admins | Tickets support, FAQs |
| otp | OTPManagementSection | Tous admins | Gestion OTP/blocages |
| api | ApiManagementSection | Tous admins | Configuration APIs |
| compliance | ComplianceSection | Tous admins | CGU, config système |
| audit | AuditLogs | Tous admins | Journal d'audit |
| webhooks | WebhooksSection | Tous admins | Webhooks FedaPay |
| search-activity | SearchActivitySection | Tous admins | Activité recherche |

### 1.2 Rôles Admin

```typescript
type AdminRole = 'super_admin' | 'ops' | 'finance' | 'compliance' | 'support' | 'analyst';
```

---

## 2. Workflow: Gestion des Utilisateurs

### 2.1 UsersManagementSection

**Fonctionnalités:**
- Liste paginée des patients (50 par page)
- Liste paginée des praticiens (50 par page)
- Recherche avec debounce (300ms)
- Détails patient/praticien via dialog
- Nettoyage comptes non-test (confirmation requise)

**Tables utilisées:**
- `profiles` - Profils patients
- `practitioners` - Praticiens
- `user_roles` - Rôles admin (pour exclusion)

**Flux de données:**
```
Patient clic → PatientDetailsDialog → Affiche infos complètes
Praticien clic → PractitionerDetailsDialog → Affiche KYC, solde, etc.
```

---

## 3. Workflow: Gestion des Admins (super_admin)

### 3.1 AdminManagement

**Accès:** super_admin uniquement

**Fonctionnalités:**

| Action | Description | Validation |
|--------|-------------|------------|
| Créer admin | Nouveau compte avec rôle | Email, nom, rôle requis |
| Reset MDP | Générer nouveau mot de passe | Confirmation |
| Désactiver | Supprimer accès admin | Raison obligatoire |

**Workflow création:**
```
1. Saisie email, nom, téléphone, rôle
2. Appel edge function admin-management (action: create)
3. Génération mot de passe temporaire
4. Affichage dialog avec MDP (copie presse-papier)
5. MDP non stocké après fermeture
```

**Workflow désactivation:**
```
1. Clic "Désactiver"
2. Dialog confirmation avec raison obligatoire
3. Appel edge function admin-management (action: disable)
4. Suppression du rôle user_roles
```

---

## 4. Workflow: Validation KYC

### 4.1 KYCQueue

**Fonctionnalités principales:**

| Action | Statut résultant | can_accept_missions |
|--------|------------------|---------------------|
| Approuver | approved | true |
| Marquer incomplet | incomplete | false |
| Rejeter | rejected | false |

**Documents vérifiés:**
- Pièce d'identité (id_card)
- Licence professionnelle (license)
- Assurance (insurance)
- Certificat de spécialité (specialty_certificate)
- RIB (bank_info)
- Document complémentaire (additional_document)
- Photo (photo)

**Protection race condition:**
```typescript
// Vérifie que le statut n'a pas changé entre-temps
if (currentRow.kyc_status !== expectedCurrentStatus) {
  throw new Error('Le dossier a été modifié par un autre administrateur');
}
```

**Notifications:**
- Edge function: `send-kyc-status-notification`
- Envoyée après chaque changement de statut

**Audit:**
- Chaque action KYC est loguée dans `admin_audit_logs`
- Détails: statut précédent, nouveau statut, commentaire

---

## 5. Workflow: Opérations

### 5.1 OperationsSection

**3 sous-onglets:**

#### 5.1.1 RDV en temps réel
- Liste des RDV du jour
- Statuts: pending, confirmed, completed, cancelled
- Filtrage par statut

#### 5.1.2 Modération avis
- Liste des avis praticiens
- Actions: Afficher/Masquer
- Champs: rating, comment, is_hidden

#### 5.1.3 Litiges
- Gestion des disputes
- Statuts: open, investigating, resolved, closed
- Commentaire de résolution

---

## 6. Workflow: Finance

### 6.1 FinanceSection - 9 sous-onglets

#### 6.1.1 PaymentFlowsDashboard (realtime)
- Statistiques en temps réel
- Revenus, paiements en cours, commissions

#### 6.1.2 PayoutsManagementSection
**Workflow payout:**
```
1. Sélectionner praticiens avec solde disponible
2. Choisir méthode (Mobile Money ou Virement)
3. Créer lot (create-payout-batch)
4. Exécuter lot (process-payout-batch)
5. Suivi statuts individuels
```

**Statuts payout:**
- queued → processing → sent → completed
- Ou: failed, partially_sent, pending_manual

#### 6.1.3 FundsReleaseSection
**Workflow release fonds:**
```
1. Patient paie → Fonds en rétention (48h)
2. Après 48h → hold_until expiré
3. Cron horaire ou release manuel
4. balance_on_hold → balance_available
5. payout_status: held → ready
```

**Edge function:** `release-held-funds`

#### 6.1.4 RefundsSection
- Gestion des remboursements
- Statuts: pending, processed, refunded

#### 6.1.5 ReconciliationSection
- Réconciliation comptable
- Comparaison paiements vs virements

#### 6.1.6 WebhooksSection
- Événements webhook FedaPay
- Statuts: success, processing, pending, failed, permanently_failed
- Auto-refresh 5s optionnel
- Export CSV

#### 6.1.7 PaymentEventsSection
- Historique événements paiement

---

## 7. Workflow: Support

### 7.1 SupportSection

**Gestion tickets:**

| Statut | Badge | Description |
|--------|-------|-------------|
| ouvert | Destructive | Nouveau ticket |
| en_cours | Secondary | Pris en charge |
| resolu | Default | Problème résolu |
| ferme | Outline | Ticket fermé |

**Base de connaissances (FAQs):**
- CRUD sur FAQs
- Statuts: Publié, Brouillon
- Catégories personnalisables

---

## 8. Workflow: Gestion OTP

### 8.1 OTPManagementSection

**Numéros bloqués:**
- Affiche numéros avec 3+ tentatives/heure
- Action: Débloquer (supprime toutes tentatives)

**Historique:**
- 100 dernières tentatives
- Canaux: SMS, WhatsApp, Call
- Statuts: pending, failed, delivered
- Action: Supprimer entrée

---

## 9. Workflow: Gestion API

### 9.1 ApiManagementSection

**FedaPay:**
- Toggle mode sandbox/live
- Confirmation obligatoire pour live
- Secrets listés (non modifiables ici)

**Autres APIs:**
- Twilio (SMS/OTP) - Configuré
- Wasabi (Stockage) - Configuré
- Mapbox (Cartes) - Configuré

---

## 10. Workflow: Compliance

### 10.1 ComplianceSection

**Consentements:**

| Type | Description |
|------|-------------|
| cgu | Conditions générales d'utilisation |
| charte | Charte de la plateforme |
| partage_donnees | Politique de partage |
| marketing | Consentement marketing |

**Actions:**
- Créer nouvelle version
- Activer/Désactiver version
- Visualiser contenu

**Configuration système:**
- Table `system_config`
- Paramètres clé/valeur JSON
- Historique de modification

---

## 11. Workflow: Audit

### 11.1 AuditLogs

**Fonctionnalités:**
- Recherche (min 3 caractères - sécurité)
- Filtre par type d'entité
- Pagination 20 par page
- Obfuscation IP partielle (GDPR)

**Données enregistrées:**
- Date/Heure
- Admin (via profiles)
- Action
- Entité (type + ID)
- Détails (JSON)
- IP (partiellement masquée)

---

## 12. Workflow: Webhooks

### 12.1 WebhooksSection

**Événements FedaPay:**
- transaction.approved
- transaction.declined
- transaction.canceled
- transfer.approved
- transfer.declined

**Statuts traitement:**
- success - Traité avec succès
- processing - En cours
- pending - En attente
- failed - Échec (retry possible)
- permanently_failed - Échec définitif

**Features:**
- Auto-refresh 5s
- Export CSV
- Compteurs par statut

---

## 13. Workflow: Activité Recherche

### 13.1 SearchActivitySection

**Types d'actions trackées:**

| Action | Description |
|--------|-------------|
| view_search_page | Vue page recherche |
| filter_specialty | Filtre spécialité |
| filter_zone | Filtre zone géographique |
| view_practitioner_details | Vue détails praticien |
| click_contact | Clic contact |
| click_appointment | Clic prise RDV |
| click_itinerary | Clic itinéraire |
| search_text | Recherche textuelle |

**Filtres:**
- Période (24h, 7j, 30j, 90j)
- Type d'action
- Type utilisateur (connecté/anonyme)
- Session ID

**Stats:**
- Actions totales
- Utilisateurs connectés vs anonymes
- Clics RDV
- Clics contact

---

## 14. Synthèse des Edge Functions Admin

| Edge Function | Workflow | Description |
|--------------|----------|-------------|
| admin-management | Admins | CRUD comptes admin |
| send-kyc-status-notification | KYC | Notifie praticien |
| release-held-funds | Finance | Libère fonds retenus |
| create-payout-batch | Finance | Crée lot versement |
| process-payout-batch | Finance | Exécute versements |
| cleanup-non-test-accounts | Users | Supprime comptes non-test |

---

## 15. Tables Base de Données Admin

| Table | Description |
|-------|-------------|
| user_roles | Rôles admin (user_id, role) |
| admin_audit_logs | Journal actions admin |
| support_tickets | Tickets support |
| faqs | Base de connaissances |
| consent_versions | Versions consentements |
| system_config | Configuration système |
| webhook_events | Événements webhook |
| otp_attempts | Tentatives OTP |
| search_activity_logs | Activité recherche |
| payout_batches | Lots de versement |
| practitioner_payouts | Versements individuels |
| practitioner_balances | Soldes praticiens |

---

## 16. Sécurité Admin

### 16.1 Contrôles d'accès

```typescript
// Vérification rôle super_admin
const canManageAdmins = role === "super_admin";

// Protection route
if (!isAdmin) {
  return <Navigate to="/" />;
}
```

### 16.2 Audit Trail

Toutes les actions sensibles sont loguées:
- KYC approvals/rejections
- Admin creation/deletion
- Configuration changes
- Payout processing

### 16.3 Protections GDPR

- Obfuscation IP dans logs: `ip.replace(/\.\d+\.\d+$/, '.***.**')`
- Recherche min 3 caractères (anti-enumération)
- Confirmation pour actions destructives

---

## 17. Points d'Amélioration Identifiés

### 17.1 Priorité 1 - Critiques

| # | Composant | Problème | Recommandation |
|---|-----------|----------|----------------|
| 1 | AdminManagement | Pas de confirmation email nouveau admin | Ajouter email de bienvenue |
| 2 | KYCQueue | Pas de preview documents PDF inline | Ajouter viewer PDF |

### 17.2 Priorité 2 - Moyens

| # | Composant | Problème | Recommandation |
|---|-----------|----------|----------------|
| 3 | OperationsSection | Litiges sans système de remboursement | Lier aux remboursements |
| 4 | SupportSection | FAQs sans éditeur riche | Ajouter éditeur Markdown |
| 5 | AuditLogs | Pas d'export logs | Ajouter export CSV |

### 17.3 Priorité 3 - Mineurs

| # | Composant | Problème | Recommandation |
|---|-----------|----------|----------------|
| 6 | UsersManagementSection | Cleanup sans backup | Ajouter backup avant suppression |
| 7 | PayoutsManagementSection | Pas de planification | Ajouter payouts planifiés |

---

## 18. Conclusion

Le dashboard admin de DomiCares est **complet et fonctionnel** avec:

- ✅ 12 modules distincts couvrant tous les besoins opérationnels
- ✅ Système de rôles granulaire
- ✅ Audit trail complet
- ✅ Lazy loading pour performances
- ✅ Real-time updates sur sections critiques
- ✅ Protections GDPR intégrées

### Prochaines étapes recommandées:
1. Ajouter tests E2E pour workflows critiques (KYC, Payouts)
2. Implémenter dashboard analytics avec graphiques
3. Ajouter système de notifications admin (alertes)
