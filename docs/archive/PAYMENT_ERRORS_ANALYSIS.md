# 🚨 Analyse des Erreurs - Workflow de Paiement

## Résumé Exécutif

Le workflow de paiement présente **7 erreurs critiques** qui empêchent le bon fonctionnement du système de gestion financière des praticiens.

---

## 🔴 ERREURS CRITIQUES

### 1. ❌ Solde Praticien Non Créé/Mis à Jour Lors du Paiement

**Localisation:** `supabase/functions/create-payment/index.ts`

**Problème:**
- Lors de la création d'un paiement, les frais sont calculés (`net_amount`, `commission_amount`, etc.)
- Mais **AUCUNE mise à jour** de `practitioner_balances` n'est effectuée
- Le solde praticien reste à zéro même après un paiement réussi

**Impact:** 
- Les praticiens ne voient jamais leurs gains s'accumuler
- Impossible de créer des payouts car `balance_available` = 0

**Solution Requise:**
```typescript
// Dans create-payment après l'insertion du paiement
// Créer ou mettre à jour practitioner_balances
const { data: balance } = await supabase
  .from('practitioner_balances')
  .select('*')
  .eq('practitioner_id', practitionerId)
  .single();

if (balance) {
  // Mettre à jour: ajouter à pending
  await supabase
    .from('practitioner_balances')
    .update({
      balance_pending: balance.balance_pending + netAmount
    })
    .eq('practitioner_id', practitionerId);
} else {
  // Créer le solde initial
  await supabase
    .from('practitioner_balances')
    .insert({
      practitioner_id: practitionerId,
      balance_pending: netAmount,
      balance_available: 0,
      balance_on_hold: 0
    });
}
```

---

### 2. ❌ Webhook Ne Met Pas à Jour le Solde Praticien

**Localisation:** `supabase/functions/payment-webhook/index.ts`

**Problème:**
- Quand un paiement passe à `status='paid'`, le webhook met à jour:
  - `payments.status = 'paid'`
  - `payments.payout_status = 'held'`
  - `payments.hold_until = T+2`
- Mais **NE met PAS à jour** `practitioner_balances`
- Le montant reste en `balance_pending` au lieu de passer en `balance_on_hold`

**Impact:**
- Incohérence entre le statut du paiement et le solde praticien
- `release-held-funds` ne peut pas libérer les fonds car ils ne sont pas en `balance_on_hold`

**Solution Requise:**
```typescript
// Dans payment-webhook après mise à jour du paiement à 'paid'
if (paymentStatus === 'paid' && payment) {
  const practitionerId = payment.appointments?.practitioner_id;
  const netAmount = payment.net_amount;
  
  // Transférer de pending vers on_hold
  const { data: balance } = await supabase
    .from('practitioner_balances')
    .select('*')
    .eq('practitioner_id', practitionerId)
    .single();
    
  if (balance) {
    await supabase
      .from('practitioner_balances')
      .update({
        balance_pending: balance.balance_pending - netAmount,
        balance_on_hold: balance.balance_on_hold + netAmount
      })
      .eq('practitioner_id', practitionerId);
  }
}
```

---

### 3. ❌ apply-ledger-entries Jamais Appelé Automatiquement

**Localisation:** Toutes les edge functions de paiement

**Problème:**
- La fonction `apply-ledger-entries` existe mais **n'est jamais appelée**
- Ni dans `create-payment`
- Ni dans `payment-webhook`
- Les écritures comptables ne sont donc jamais enregistrées

**Impact:**
- Aucune traçabilité comptable
- Impossible de faire la réconciliation
- La table `ledger_entries` reste vide

**Solution Requise:**
```typescript
// Dans payment-webhook après mise à jour du statut
if (paymentStatus === 'paid') {
  await supabase.functions.invoke('apply-ledger-entries', {
    body: {
      paymentId: payment.id,
      status: 'paid'
    }
  });
}
```

---

### 4. ❌ apply-ledger-entries Ne Met Pas à Jour practitioner_balances

**Localisation:** `supabase/functions/apply-ledger-entries/index.ts`

**Problème:**
- La fonction crée les écritures comptables dans `ledger_entries`
- Mais **ne synchronise pas** avec `practitioner_balances`
- Deux sources de vérité divergent

**Impact:**
- Incohérence comptable
- Les balances ne reflètent pas les écritures du ledger

**Solution Requise:**
- Cette fonction devrait soit:
  1. Être fusionnée avec la logique de mise à jour des balances
  2. Ou appeler une fonction dédiée pour synchroniser les balances

---

### 5. ❌ Pas de Transaction Atomique payments ↔ practitioner_balances

**Localisation:** Toutes les fonctions de paiement

**Problème:**
- Les mises à jour de `payments` et `practitioner_balances` sont faites séparément
- Si une échoue, l'autre peut réussir → incohérence
- Pas de rollback automatique

**Impact:**
- Risque de perte de données
- Soldes incorrects
- Impossible de garantir la cohérence

**Solution Requise:**
```typescript
// Utiliser une transaction Postgres ou une RPC function
await supabase.rpc('update_payment_and_balance', {
  p_payment_id: paymentId,
  p_practitioner_id: practitionerId,
  p_net_amount: netAmount,
  p_new_status: 'paid',
  p_payout_status: 'held'
});
```

---

### 6. ❌ create-appointment-with-payment: Variable Undefined

**Localisation:** `supabase/functions/create-appointment-with-payment/index.ts` ligne 146

**Problème:**
```typescript
if (appointmentId!) {  // ❌ appointmentId peut être undefined ici
  try {
    await supabase
      .from('appointments')
      .delete()
      .eq('id', appointmentId);
```

**Impact:**
- Erreur TypeScript
- Rollback peut échouer silencieusement

**Solution:**
```typescript
if (appointmentId) {  // ✅ Sans le !
```

---

### 7. ❌ create-payout Ne Vérifie Pas le Compte FedaPay du Praticien

**Localisation:** `supabase/functions/create-payout/index.ts`

**Problème:**
- Vérifie le KYC
- Mais **ne vérifie pas** si le praticien a configuré son compte FedaPay/Mobile Money
- Tente de créer un payout sans destination

**Impact:**
- Échec du payout côté FedaPay
- Fonds bloqués
- Mauvaise expérience utilisateur

**Solution Requise:**
```typescript
// Vérifier qu'il y a un moyen de paiement configuré
const { data: paymentInfo } = await supabase
  .from('practitioner_payment_info')
  .select('*')
  .eq('practitioner_id', practitionerId)
  .single();

if (!paymentInfo) {
  return new Response(
    JSON.stringify({ 
      error: 'Payment information not configured',
      message: 'Practitioner must configure payment details before receiving payouts'
    }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

---

## ⚠️ ERREURS MINEURES

### 8. ⚠️ create-payout-batch Ne Déduit Pas les Soldes

**Localisation:** `supabase/functions/create-payout-batch/index.ts`

**Problème:**
- Crée les payouts en status 'planned'
- Mais **ne déduit pas** `balance_available` tout de suite
- Les praticiens voient toujours le montant disponible

**Solution:**
```typescript
// Après création des payouts
await supabase
  .from('practitioner_balances')
  .update({
    balance_available: 0,
    updated_at: new Date().toISOString()
  })
  .in('practitioner_id', practitionerIds);
```

---

## 📊 Workflow Actuel (CASSÉ)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Patient crée RDV + Paiement                              │
│    ✅ create-appointment-with-payment                        │
│    ├─ Crée appointment                                       │
│    └─ Appelle create-payment                                 │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Création du Paiement                                      │
│    ✅ create-payment                                         │
│    ├─ Calcule les frais (net_amount)                        │
│    ├─ Crée transaction FedaPay                              │
│    ├─ Insère dans payments (status='initiated')             │
│    └─ ❌ NE met PAS à jour practitioner_balances           │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Patient paie via FedaPay                                  │
│    (Externe - FedaPay Mobile Money)                          │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Webhook FedaPay                                           │
│    ✅ payment-webhook                                        │
│    ├─ Vérifie HMAC signature                                │
│    ├─ Vérifie idempotence                                   │
│    ├─ Map status: approved → paid                           │
│    ├─ Update payments:                                       │
│    │   • status = 'paid'                                     │
│    │   • payout_status = 'held'                              │
│    │   • hold_until = T+2                                    │
│    ├─ ❌ NE met PAS à jour practitioner_balances           │
│    └─ ❌ N'appelle PAS apply-ledger-entries                │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Attente période de rétention (T+2)                       │
│    (Aucune action)                                           │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Libération automatique des fonds                         │
│    ✅ release-held-funds (cron daily)                       │
│    ├─ Trouve payments avec hold_until < now                 │
│    ├─ Update payments: payout_status = 'ready'              │
│    ├─ ❌ Essaie de mettre à jour practitioner_balances     │
│    │   • balance_on_hold → balance_available                │
│    │   • ❌ MAIS balance_on_hold = 0 !                      │
│    └─ ❌ ÉCHEC: aucun fonds à libérer                       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Admin crée un Batch Payout                               │
│    ⚠️ create-payout-batch                                   │
│    ├─ Cherche practitioner_balances.balance_available > 0   │
│    └─ ❌ TROUVE 0 praticiens éligibles !                    │
└─────────────────────────────────────────────────────────────┘

❌ WORKFLOW CASSÉ: Les fonds ne transitent jamais vers les praticiens
```

---

## 📊 Workflow Corrigé (ATTENDU)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Patient crée RDV + Paiement                              │
│    ✅ create-appointment-with-payment                        │
│    ├─ Crée appointment                                       │
│    └─ Appelle create-payment                                 │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Création du Paiement                                      │
│    ✅ create-payment (CORRIGÉ)                              │
│    ├─ Calcule les frais (net_amount)                        │
│    ├─ Crée transaction FedaPay                              │
│    ├─ Insère dans payments (status='initiated')             │
│    └─ ✅ Crée/Met à jour practitioner_balances:            │
│        • balance_pending += net_amount                       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Patient paie via FedaPay                                  │
│    (Externe - FedaPay Mobile Money)                          │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Webhook FedaPay                                           │
│    ✅ payment-webhook (CORRIGÉ)                             │
│    ├─ Vérifie HMAC signature                                │
│    ├─ Vérifie idempotence                                   │
│    ├─ Map status: approved → paid                           │
│    ├─ Update payments (transaction):                        │
│    │   • status = 'paid'                                     │
│    │   • payout_status = 'held'                              │
│    │   • hold_until = T+2                                    │
│    ├─ ✅ Met à jour practitioner_balances:                  │
│    │   • balance_pending -= net_amount                       │
│    │   • balance_on_hold += net_amount                       │
│    └─ ✅ Appelle apply-ledger-entries                       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Écritures Comptables                                      │
│    ✅ apply-ledger-entries (CORRIGÉ)                        │
│    ├─ Dr Platform:Cash = amount                             │
│    ├─ Cr Patient:Obligation = amount                        │
│    ├─ Dr Platform:Fees = gateway_fees                       │
│    ├─ Dr Platform:Commission = commission                   │
│    └─ Cr Practitioner:Payable = net_amount                  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Attente période de rétention (T+2)                       │
│    (Aucune action)                                           │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Libération automatique des fonds                         │
│    ✅ release-held-funds                                     │
│    ├─ Trouve payments avec hold_until < now                 │
│    ├─ Update payments: payout_status = 'ready'              │
│    └─ ✅ Met à jour practitioner_balances:                  │
│        • balance_on_hold -= net_amount                       │
│        • balance_available += net_amount                     │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. Admin crée un Batch Payout                               │
│    ✅ create-payout-batch (CORRIGÉ)                         │
│    ├─ Cherche practitioner_balances.balance_available > 0   │
│    ├─ ✅ Trouve tous les praticiens éligibles               │
│    ├─ Crée batch + payouts individuels                      │
│    └─ ✅ Déduit balance_available immédiatement             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. Exécution du Payout                                       │
│    ✅ create-payout (CORRIGÉ)                               │
│    ├─ ✅ Vérifie KYC + compte FedaPay configuré             │
│    ├─ Crée transaction FedaPay (transfer)                   │
│    └─ Update practitioner_payouts: status = 'paid'          │
└─────────────────────────────────────────────────────────────┘

✅ WORKFLOW FONCTIONNEL
```

---

## 🎯 Plan de Correction Prioritaire

### Phase 1: Fixes Critiques (Urgent)
1. ✅ Créer/mettre à jour `practitioner_balances` dans `create-payment`
2. ✅ Mettre à jour `practitioner_balances` dans `payment-webhook` (pending → on_hold)
3. ✅ Appeler `apply-ledger-entries` depuis `payment-webhook`

### Phase 2: Cohérence Comptable
4. ✅ Créer une RPC function pour transaction atomique `payments` ↔ `balances`
5. ✅ Synchroniser `apply-ledger-entries` avec `practitioner_balances`

### Phase 3: Validations
6. ✅ Vérifier compte FedaPay dans `create-payout`
7. ✅ Corriger variable undefined dans `create-appointment-with-payment`
8. ✅ Déduire les soldes dans `create-payout-batch`

---

## 🧪 Tests de Validation

```bash
# Test 1: Création de paiement
curl -X POST /functions/v1/create-payment \
  -d '{"appointmentId":"...","amount":10000,"paymentMethod":"mtn","phoneNumber":"+22912345678"}'

# Vérifier:
# - payments.net_amount calculé
# - practitioner_balances.balance_pending augmenté

# Test 2: Webhook paid
curl -X POST /functions/v1/payment-webhook \
  -H "x-fedapay-signature: ..." \
  -d '{"entity":"transaction","status":"approved","id":"123"}'

# Vérifier:
# - payments.status = 'paid'
# - practitioner_balances.balance_on_hold augmenté
# - practitioner_balances.balance_pending diminué
# - ledger_entries créés

# Test 3: Release funds
curl -X POST /functions/v1/release-held-funds

# Vérifier:
# - payments.payout_status = 'ready'
# - practitioner_balances.balance_available augmenté
# - practitioner_balances.balance_on_hold diminué

# Test 4: Create payout batch
curl -X POST /functions/v1/create-payout-batch \
  -d '{"practitionerIds":["..."],"paymentMethod":"mtn"}'

# Vérifier:
# - payout_batches créé
# - practitioner_payouts créés
# - practitioner_balances.balance_available = 0
```

---

## 📝 Conclusion

Le workflow de paiement est **fonctionnellement cassé** car:
- Les soldes praticiens ne sont jamais créés/mis à jour
- Les fonds ne transitent jamais de pending → on_hold → available
- Les payouts ne peuvent pas être créés (balance = 0)

**Action immédiate requise**: Corriger les 3 erreurs critiques de Phase 1.
