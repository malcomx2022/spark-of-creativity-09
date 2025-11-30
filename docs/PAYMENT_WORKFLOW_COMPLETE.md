# Workflow Complet du Système de Paiement et Reversement

## 📋 Vue d'ensemble

Ce document décrit le flux complet du paiement patient jusqu'au reversement au praticien, avec toutes les étapes de traçabilité pour l'administration.

## 🔄 Cycle de vie d'un paiement

### 1. Création du rendez-vous et initiation du paiement

**Quand ?** Patient crée un rendez-vous ou s'inscrit à une séance de groupe

**Actions automatiques:**
```
┌─────────────────────────────────────────────────────────────┐
│ 1. Création appointment avec status: 'pending_payment'     │
│ 2. Appel edge function 'create-payment'                    │
│ 3. Création transaction FedaPay                            │
│ 4. Création payment avec status: 'initiated'               │
│ 5. Balance praticien: +montant_net en 'pending'           │
│ 6. Ouverture widget FedaPay pour paiement                 │
└─────────────────────────────────────────────────────────────┘
```

**Tables affectées:**
- `appointments`: `status = 'pending_payment'`, `payment_expires_at = now() + 15min`
- `payments`: `status = 'initiated'`, montants calculés (amount, commission, fees, net_amount)
- `practitioner_balances`: `balance_pending += net_amount`
- `payment_attempts`: enregistrement de la tentative

### 2. Paiement réussi (Webhook FedaPay)

**Quand ?** Patient complète le paiement sur FedaPay

**Actions automatiques (via webhook):**
```
┌─────────────────────────────────────────────────────────────┐
│ WEBHOOK: payment.approved                                   │
│                                                              │
│ 1. Mise à jour payment: status = 'paid'                    │
│ 2. Mise à jour appointment: status = 'confirmed'           │
│ 3. Balance praticien:                                       │
│    - balance_pending -= net_amount                         │
│    - balance_on_hold += net_amount                         │
│    - hold_until = now() + 2 jours                          │
│ 4. Création ledger entries (comptabilité)                  │
│ 5. Notifications:                                           │
│    - Patient: "Paiement confirmé, RDV validé"             │
│    - Praticien: "Nouveau RDV confirmé + montant"          │
│    - Admins: "Nouveau paiement reçu"                       │
│ 6. Audit log créé                                          │
└─────────────────────────────────────────────────────────────┘
```

**Tables affectées:**
- `payments`: `status = 'paid'`, `payout_status = 'held'`, `hold_until` défini
- `appointments`: `status = 'confirmed'`
- `practitioner_balances`: transfert pending → on_hold
- `ledger_entries`: 4 écritures créées (voir section Comptabilité)
- `payment_events`: événement `payment.intent.succeeded`
- `admin_audit_logs`: trace de l'action
- `notifications`: notifications aux parties prenantes

### 3. Libération des fonds (automatique après période de hold)

**Quand ?** Après 2 jours (configurable) ET consultation complétée

**Actions automatiques (via cron ou edge function):**
```
┌─────────────────────────────────────────────────────────────┐
│ FONCTION: release-held-funds                                │
│                                                              │
│ 1. Recherche payments où:                                   │
│    - payout_status = 'held'                                 │
│    - hold_until < now()                                     │
│    - appointment.status = 'completed'                       │
│ 2. Mise à jour payment: payout_status = 'ready'            │
│ 3. Balance praticien:                                       │
│    - balance_on_hold -= net_amount                         │
│    - balance_available += net_amount                       │
│ 4. Notification praticien: "Fonds disponibles"            │
└─────────────────────────────────────────────────────────────┘
```

**Tables affectées:**
- `payments`: `payout_status = 'ready'`
- `practitioner_balances`: transfert on_hold → available

### 4. Création batch de reversement (action admin)

**Quand ?** Admin crée un lot de reversements périodiques (hebdomadaire, mensuel)

**Actions manuelles admin:**
```
┌─────────────────────────────────────────────────────────────┐
│ ADMIN DASHBOARD: Finance → Créer batch de reversement      │
│                                                              │
│ 1. Sélectionne période et méthode paiement                 │
│ 2. Système calcule automatiquement:                         │
│    - Liste praticiens avec balance_available > 0           │
│    - Montants à reverser par praticien                     │
│    - Total du batch                                         │
│ 3. Admin valide et crée le batch                           │
│ 4. Création practitioner_payouts pour chaque praticien     │
│ 5. Création payout_batch avec status: 'queued'            │
└─────────────────────────────────────────────────────────────┘
```

**Tables affectées:**
- `payout_batches`: nouveau batch créé, `status = 'queued'`
- `practitioner_payouts`: un payout par praticien, `status = 'pending'`
- `payout_payments`: liens entre payouts et payments sources

### 5. Traitement du batch (action admin)

**Quand ?** Admin déclenche le traitement effectif des reversements

**Actions automatiques:**
```
┌─────────────────────────────────────────────────────────────┐
│ FONCTION: process-payout-batch                              │
│                                                              │
│ 1. Pour chaque payout du batch:                            │
│    - Création transfer FedaPay ou MTN/Moov                 │
│    - Mise à jour payout: status = 'processing'             │
│ 2. Mise à jour batch: status = 'processing'                │
│ 3. Webhooks FedaPay confirment les transfers              │
│ 4. Mise à jour finale:                                      │
│    - payout: status = 'completed'                          │
│    - batch: status = 'completed'                           │
│    - practitioner_balances: balance_available -= montant   │
│    - payments: payout_status = 'paid_out'                  │
└─────────────────────────────────────────────────────────────┘
```

**Tables affectées:**
- `practitioner_payouts`: `status = 'completed'`, `processed_at` défini
- `payout_batches`: `status = 'completed'`, `processed_at` défini  
- `practitioner_balances`: `balance_available -= montant`, `last_payout_at` mis à jour
- `payments`: `payout_status = 'paid_out'`

## 📊 Système de Comptabilité (Ledger)

### Structure des comptes ledger

```
COMPTES PLATEFORME:
├── platform_cash              (Actif: Argent reçu des patients)
├── platform_revenue_commission (Revenu: Commissions)
├── platform_revenue_fees      (Revenu: Frais techniques)
└── platform_payable           (Passif: Dû aux praticiens)

COMPTES PRATICIENS:
├── practitioner_{id}_receivable (Actif: À recevoir de la plateforme)
└── practitioner_{id}_revenue    (Revenu: Gains du praticien)
```

### Écritures comptables à chaque paiement

**Exemple: Paiement de 10,000 XOF**
- Commission plateforme: 15% = 1,500 XOF
- Frais techniques: 2% = 200 XOF  
- Net praticien: 8,300 XOF

**4 écritures créées:**

```sql
1. Débit: platform_cash = 10,000 XOF
   Crédit: platform_payable = 10,000 XOF
   -- "La plateforme reçoit l'argent et le doit au système"

2. Débit: platform_payable = 8,300 XOF
   Crédit: practitioner_receivable = 8,300 XOF
   -- "Montant net dû au praticien"

3. Débit: platform_payable = 1,500 XOF
   Crédit: platform_revenue_commission = 1,500 XOF
   -- "Commission de la plateforme"

4. Débit: platform_payable = 200 XOF
   Crédit: platform_revenue_fees = 200 XOF
   -- "Frais techniques de la plateforme"
```

### Consultation des écritures (Admin)

**Query SQL pour voir toutes les transactions:**

```sql
-- Transactions d'un praticien
SELECT 
  le.created_at,
  le.reference_type,
  le.reference_id,
  le.debit,
  le.credit,
  le.description,
  la.account_type,
  p.name as practitioner_name
FROM ledger_entries le
JOIN ledger_accounts la ON le.account_id = la.id
LEFT JOIN practitioners p ON la.owner_id = p.id
WHERE la.owner_id = 'practitioner_id'
ORDER BY le.created_at DESC;

-- Revenus de la plateforme
SELECT 
  SUM(credit) as total_revenue
FROM ledger_entries le
JOIN ledger_accounts la ON le.account_id = la.id
WHERE la.account_type IN ('revenue_commission', 'revenue_fees')
  AND la.owner_type = 'platform';
```

## 👨‍💼 Interfaces Admin

### 1. Dashboard Finance

**Indicateurs clés:**
- Revenus totaux (commission + fees)
- Paiements en attente
- Fonds en hold
- Fonds disponibles pour reversement
- Derniers paiements

**Accès:** `/admin?tab=finance`

### 2. Gestion des Reversements

**Fonctionnalités:**
- Voir balance de chaque praticien
- Créer un batch de reversement
- Suivre l'état des reversements
- Voir l'historique des payouts
- Télécharger relevés

**Accès:** `/admin?tab=payouts`

### 3. Transactions et Réconciliation

**Fonctionnalités:**
- Liste complète des paiements
- Filtres par statut, date, praticien, patient
- Détails de chaque transaction
- Tentatives de paiement
- Événements webhook
- Réconciliation avec FedaPay

**Accès:** `/admin?tab=payments`

### 4. Audit et Logs

**Fonctionnalités:**
- Historique de toutes les actions
- Logs système
- Webhooks reçus
- Erreurs et anomalies

**Accès:** `/admin?tab=audit`

## 🔒 Sécurité et Traçabilité

### 1. Vérification des webhooks
- Signature HMAC-SHA256
- Validation de l'origine FedaPay
- Protection contre replay attacks

### 2. Audit complet
- Toutes les actions enregistrées dans `admin_audit_logs`
- Qui, quoi, quand pour chaque opération
- Détails JSON des changements

### 3. Notifications multi-canal
- Patient: confirmation paiement, rendez-vous validé
- Praticien: nouveau rendez-vous confirmé, montant reçu
- Admin: nouveaux paiements, anomalies

### 4. États transitoires
- Verrouillages optimistes pour éviter race conditions
- Fonction atomique `update_payment_with_balance`
- Transactions SQL pour cohérence

## 📈 Statistiques et Reporting

### Requêtes utiles pour l'admin

```sql
-- Revenus par période
SELECT 
  DATE_TRUNC('day', created_at) as date,
  SUM(amount) as total_payments,
  SUM(commission_amount) as total_commission,
  SUM(fees_amount) as total_fees,
  COUNT(*) as nb_payments
FROM payments
WHERE status = 'paid'
  AND created_at >= '2024-01-01'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;

-- Balance des praticiens
SELECT 
  p.name,
  p.specialty,
  pb.balance_available,
  pb.balance_on_hold,
  pb.balance_pending,
  pb.last_payout_at
FROM practitioner_balances pb
JOIN practitioners p ON pb.practitioner_id = p.id
WHERE pb.balance_available > 0
ORDER BY pb.balance_available DESC;

-- Historique des reversements
SELECT 
  pp.created_at,
  p.name as practitioner_name,
  pp.amount,
  pp.status,
  pp.processed_at,
  pb.batch_date
FROM practitioner_payouts pp
JOIN practitioners p ON pp.practitioner_id = p.id
LEFT JOIN payout_batches pb ON pp.batch_id = pb.id
ORDER BY pp.created_at DESC
LIMIT 100;
```

## 🚨 Gestion des Incidents

### Paiement bloqué en 'initiated'
**Symptômes:** Payment reste en 'initiated' sans webhook reçu

**Actions:**
1. Vérifier logs webhook FedaPay
2. Réconcilier manuellement via `/admin?tab=reconciliation`
3. Forcer mise à jour du statut si nécessaire
4. Notifier le patient

### Fonds non libérés
**Symptômes:** Payment en 'held' au-delà de la période

**Actions:**
1. Vérifier statut appointment (doit être 'completed')
2. Exécuter manuellement `release-held-funds`
3. Vérifier logs de la fonction

### Reversement échoué
**Symptômes:** Payout en 'failed'

**Actions:**
1. Vérifier coordonnées bancaires praticien
2. Consulter logs FedaPay
3. Créer nouveau payout manuel
4. Notifier le praticien

## 📝 Configuration

### Variables d'environnement

```env
FEDAPAY_SECRET_KEY=sk_sandbox_xxx
FEDAPAY_PUBLIC_KEY=pk_sandbox_xxx
FEDAPAY_MODE=sandbox # ou 'live'
FEDAPAY_WEBHOOK_SECRET=whsec_xxx
```

### Paramètres système (table `system_config`)

```sql
-- Période de hold des fonds (en jours)
INSERT INTO system_config (key, value) VALUES 
  ('payment_hold_period_days', '{"days": 2}');

-- Commission plateforme (en pourcentage)
INSERT INTO system_config (key, value) VALUES 
  ('commission_percentage', '{"rate": 15}');

-- Frais techniques (en pourcentage)
INSERT INTO system_config (key, value) VALUES 
  ('technical_fees_percentage', '{"rate": 2}');
```

## 🔄 Workflow Résumé

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   PATIENT   │────▶│  RENDEZ-VOUS│────▶│  PAIEMENT   │────▶│  PRATICIEN  │
│  Demande RDV│     │   created   │     │  initiated  │     │  notifié    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                              │
                                              ▼
                                        ┌─────────────┐
                                        │   FEDAPAY   │
                                        │   Widget    │
                                        └─────────────┘
                                              │
                                              ▼
                                        ┌─────────────┐
                                        │   WEBHOOK   │
                                        │  approved   │
                                        └─────────────┘
                                              │
                     ┌────────────────────────┼────────────────────────┐
                     ▼                        ▼                        ▼
              ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
              │  PAYMENT    │         │ APPOINTMENT │         │   BALANCE   │
              │status='paid'│         │status=      │         │pending→hold │
              │             │         │'confirmed'  │         │             │
              └─────────────┘         └─────────────┘         └─────────────┘
                     │                        │                        │
                     └────────────────────────┴────────────────────────┘
                                              │
                                              ▼
                                        ┌─────────────┐
                                        │   LEDGER    │
                                        │   Entries   │
                                        └─────────────┘
                                              │
                                              ▼
                                    [2 jours + completed]
                                              │
                                              ▼
                                        ┌─────────────┐
                                        │  RELEASE    │
                                        │hold→availbl │
                                        └─────────────┘
                                              │
                                              ▼
                                        ┌─────────────┐
                                        │ADMIN crée   │
                                        │payout batch │
                                        └─────────────┘
                                              │
                                              ▼
                                        ┌─────────────┐
                                        │  PAYOUT     │
                                        │ processing  │
                                        └─────────────┘
                                              │
                                              ▼
                                        ┌─────────────┐
                                        │  PRATICIEN  │
                                        │reçoit argent│
                                        └─────────────┘
```

## 📚 Ressources

- **Dashboard Admin**: `/admin`
- **Documentation FedaPay**: https://docs.fedapay.com
- **Edge Functions**: `supabase/functions/`
  - `create-payment`: Création paiement
  - `payment-webhook`: Traitement webhooks
  - `apply-ledger-entries`: Comptabilité
  - `release-held-funds`: Libération fonds
  - `create-payout-batch`: Création lots reversement
  - `process-payout-batch`: Traitement reversements

## ✅ Checklist mise en production

- [ ] Variables d'environnement configurées (mode 'live')
- [ ] Webhook URL configurée dans FedaPay
- [ ] Comptes ledger plateforme créés
- [ ] Paramètres système définis
- [ ] Tests de bout en bout réussis
- [ ] Monitoring et alertes configurés
- [ ] Documentation admin accessible
- [ ] Support prêt pour assistance

---

**Version:** 1.0  
**Dernière mise à jour:** 2024-01-30  
**Maintenu par:** Équipe technique
