# Système de Paiement - Configuration et Architecture

## EPIC 0 — Pré-requis & Configuration

### 1. Variables d'Environnement et Secrets

Les secrets suivants doivent être configurés dans Lovable Cloud (déjà configurés via le système de secrets):

| Secret | Usage | Exposition |
|--------|-------|------------|
| `FEDAPAY_PUBLIC_KEY` | Clé publique FedaPay | ✅ Client (si nécessaire) |
| `FEDAPAY_SECRET_KEY` | Clé secrète FedaPay | ❌ Serveur uniquement |
| `FEDAPAY_WEBHOOK_SECRET` | Validation signature webhooks | ❌ Serveur uniquement |
| `FEDAPAY_MODE` | Mode sandbox/live | ✅ Serveur |
| `PLATFORM_WALLET_ID` | ID compte plateforme | ❌ Serveur uniquement |

**⚠️ SÉCURITÉ CRITIQUE**: Ne jamais exposer `FEDAPAY_SECRET_KEY` ou `FEDAPAY_WEBHOOK_SECRET` côté client.

### 2. Sécurité des Webhooks

#### Vérification HMAC
Tous les webhooks FedaPay sont vérifiés via signature HMAC SHA-256:
- Header: `x-fedapay-signature`
- Secret: `FEDAPAY_WEBHOOK_SECRET`
- Algorithme: HMAC-SHA256

#### Protection Temporelle
- Les événements de plus de 5 minutes sont rejetés
- Empêche les attaques par rejeu (replay attacks)

#### Idempotence
- Table `webhook_events` pour tracking des événements traités
- Chaque `event_id` ne peut être traité qu'une seule fois
- Empêche le double traitement en cas de retry

### 3. Mapping des Statuts Normalisés

#### Statuts Internes Normalisés

| Statut | Description | Final? |
|--------|-------------|--------|
| `initiated` | Transaction créée | ❌ |
| `pending` | En attente de paiement | ❌ |
| `authorized` | Paiement autorisé | ❌ |
| `paid` | Paiement complété | ✅ |
| `failed` | Échec du paiement | ✅ |
| `canceled` | Transaction annulée | ✅ |
| `refunded` | Remboursement effectué | ✅ |
| `chargeback` | Litige client | ✅ |

#### Correspondance FedaPay → Interne

| Statut FedaPay | Statut Normalisé | Notes |
|----------------|------------------|-------|
| `pending` | `pending` | En attente |
| `approved` | `paid` | Paiement réussi |
| `declined` | `failed` | Refusé |
| `canceled` | `canceled` | Annulé |
| `refunded` | `refunded` | Remboursé |
| `transferred` | `paid` | Transféré = payé |

### 4. Frais et Commission

#### Configuration Paramétrable

Tous les paramètres sont stockés dans `system_config`:

```json
{
  "payment_commission_rate": {
    "rate": 0.05,
    "description": "Commission plateforme en pourcentage (5%)"
  },
  "payment_gateway_fees": {
    "fixed": 0,
    "percentage": 0.02,
    "paid_by": "platform",
    "description": "Frais passerelle (2% payés par la plateforme)"
  },
  "payment_rounding_mode": {
    "mode": "half_up",
    "decimals": 2,
    "description": "Arrondi à 2 décimales, mode half-up"
  }
}
```

#### Calcul des Frais

**Formule:**
```
Commission Plateforme = Montant × Taux Commission
Frais Passerelle = Fixe + (Montant × % Passerelle)

SI paid_by = "platform" ALORS:
  Frais Praticien = Commission Plateforme
  Montant Net = Montant - Commission Plateforme
SINON:
  Frais Praticien = Commission + Frais Passerelle
  Montant Net = Montant - Commission - Frais Passerelle
```

**Arrondi:**
- Mode: half-up (0.5 → 1)
- Précision: 2 décimales
- Exemple: 1234.567 → 1234.57

#### Colonnes en Base de Données

| Colonne | Description |
|---------|-------------|
| `amount` | Montant total de la transaction |
| `commission_amount` | Commission de la plateforme |
| `gateway_fees_amount` | Frais de la passerelle |
| `fees_amount` | Total des frais déduits |
| `net_amount` | Montant net pour le praticien |

### 5. Règles Business

#### Période de Rétention (Hold)

**Configuration:**
```json
{
  "payment_hold_period_days": {
    "days": 2,
    "description": "Période de rétention avant versement (T+2)"
  }
}
```

**Workflow:**
1. Paiement reçu → `payout_status = 'held'`
2. `hold_until` = date_paiement + 2 jours
3. Après la période → `payout_status = 'ready'`
4. Versement effectué → `payout_status = 'paid'`

**Objectif:** Couvrir les remboursements et litiges potentiels.

#### Seuil de Versement Praticien

**Configuration:**
```json
{
  "payout_minimum_threshold": {
    "amount": 5000,
    "currency": "XOF",
    "description": "Seuil minimum de versement"
  }
}
```

**Règle:** Les versements ne sont déclenchés que si le solde du praticien atteint 5 000 XOF minimum.

#### Fréquence de Versement

**Configuration:**
```json
{
  "payout_frequency": {
    "frequency": "weekly",
    "day": "monday",
    "description": "Versements hebdomadaires le lundi"
  }
}
```

**Options:**
- `weekly`: Hebdomadaire (jour spécifié)
- `biweekly`: Bi-hebdomadaire
- `monthly`: Mensuel

## Architecture Technique

### Edge Functions

#### `create-payment`
- **Rôle:** Créer une transaction FedaPay
- **Auth:** JWT requis
- **Inputs:** `appointmentId`, `amount`, `paymentMethod`, `phoneNumber`
- **Outputs:** `paymentId`, `transactionId`, `paymentUrl`, `status`
- **Logique:**
  1. Valider la requête
  2. Récupérer config frais depuis `system_config`
  3. Calculer commission/frais/montant net
  4. Créer transaction FedaPay
  5. Stocker paiement avec détails complets
  6. Retourner URL de paiement

#### `payment-webhook`
- **Rôle:** Traiter les notifications FedaPay
- **Auth:** Signature HMAC uniquement
- **Sécurité:**
  - Vérification signature HMAC
  - Vérification horodatage (< 5 min)
  - Idempotence via `webhook_events`
- **Logique:**
  1. Vérifier signature
  2. Vérifier timestamp
  3. Vérifier idempotence
  4. Mapper statut FedaPay → normalisé
  5. Mettre à jour paiement
  6. Mettre à jour `hold_until` et `payout_status`

### Tables Database

#### `payments`
```sql
- id (uuid)
- appointment_id (text)
- patient_id (uuid)
- amount (integer)              -- Montant total
- commission_amount (integer)   -- Commission plateforme
- gateway_fees_amount (integer) -- Frais passerelle
- fees_amount (integer)         -- Total frais
- net_amount (integer)          -- Montant net praticien
- currency (text)
- payment_method (text)
- status (text)                 -- Statut normalisé
- payout_status (text)          -- pending|held|ready|paid|failed
- hold_until (timestamp)        -- Date fin rétention
- fedapay_transaction_id (text)
- fedapay_payment_url (text)
- created_at, updated_at
```

#### `webhook_events`
```sql
- id (uuid)
- event_id (text, unique)       -- Pour idempotence
- event_type (text)
- payload (jsonb)
- processed_at (timestamp)
- created_at (timestamp)
```

#### `system_config`
```sql
- id (uuid)
- key (text, unique)
- value (jsonb)
- description (text)
- updated_by (uuid)
- updated_at (timestamp)
```

### Utilitaires

#### `payment-status.ts`
- Mapping statuts FedaPay → normalisés
- Vérification statut final
- Vérification éligibilité remboursement

#### `fee-calculator.ts`
- Calcul commission plateforme
- Calcul frais passerelle
- Arrondi half-up
- Calcul montant net praticien
- Calcul date hold

#### `payment-config.ts` (Client)
- Labels statuts en français
- Variantes badges UI
- Formatage montants
- Configuration opérateurs mobile money

## Modification de Configuration

Pour modifier les paramètres:

```sql
UPDATE system_config 
SET value = '{"rate": 0.10}'::jsonb,
    updated_at = now()
WHERE key = 'payment_commission_rate';
```

**⚠️ Important:** Redémarrer les edge functions après modification pour prise en compte.

## Monitoring & Logs

- **Edge Function Logs:** Consultables via Lovable Cloud
- **Webhook Events:** Table `webhook_events` pour audit
- **Admin Audit Logs:** Table `admin_audit_logs` pour changements config

## Sécurité - Checklist

- ✅ Secrets sensibles protégés (jamais exposés au client)
- ✅ Webhooks vérifiés par signature HMAC
- ✅ Protection contre replay attacks (timestamp)
- ✅ Idempotence des webhooks (event_id unique)
- ✅ RLS activé sur toutes les tables sensibles
- ✅ Validation des inputs (zod)
- ✅ Logs détaillés pour audit

## Diagramme de Flux

```
Client → create-payment → FedaPay API
                ↓
         DB: payments (pending, held)
                ↓
         Return payment_url
                ↓
       Client → FedaPay Page
                ↓
         Payment completed
                ↓
    FedaPay → payment-webhook
                ↓
      Verify HMAC signature
                ↓
      Check idempotence
                ↓
      Update payment status
                ↓
      Set hold_until (T+2)
                ↓
      payout_status = held
                ↓
    (Après période hold)
                ↓
      payout_status = ready
                ↓
    (Versement praticien)
                ↓
      payout_status = paid
```
