# Tests du Workflow de Paiement

## Vue d'ensemble

Ce dossier contient les tests automatisés pour valider le workflow complet de paiement:

1. **Création du paiement** (`create-payment`) - Status: `initiated`, Balance: `pending`
2. **Webhook FedaPay** (`payment-webhook`) - Status: `paid`, Balance: `on_hold`
3. **Release des fonds** (`release-held-funds`) - Status: `ready`, Balance: `available`
4. **Création du payout** (`create-payout`) - Déduction du `balance_available`

## Fichiers de test

### `create-payment/index.test.ts`
Tests unitaires pour les fonctions utilitaires de `create-payment`:
- Normalisation des numéros de téléphone
- Normalisation des montants
- Validation des requêtes de paiement
- Parsing des réponses FedaPay

### `payment-workflow.e2e.test.ts` 🔥 **NOUVEAU**
Tests End-to-End complets du workflow de paiement:

#### Test 1: Workflow complet (Happy Path)
✅ Création du paiement avec `balance_pending`  
✅ Webhook FedaPay confirmant le paiement (`pending` → `on_hold`)  
✅ Release automatique des fonds (`on_hold` → `available`)  
✅ Création du payout avec déduction du `balance_available`  
✅ Vérification des événements de paiement

#### Test 2: Gestion des échecs
✅ Création du paiement  
✅ Webhook FedaPay avec statut `failed`  
✅ Vérification que `balance_pending` est remis à 0  
✅ Vérification que `payout_status` est `failed`

#### Test 3: Paiements multiples
✅ Création de 3 paiements successifs  
✅ Cumul des montants dans `balance_pending`  
✅ Confirmation via webhook pour tous les paiements  
✅ Vérification du cumul dans `balance_on_hold`

## Prérequis

### Variables d'environnement
Les tests utilisent les variables suivantes (configurées automatiquement dans Lovable Cloud):
```bash
SUPABASE_URL=<votre-url-supabase>
SUPABASE_SERVICE_ROLE_KEY=<votre-service-role-key>
```

### Données de test
Les tests utilisent des UUIDs de test fixes:
- **Patient ID**: `00000000-0000-0000-0000-000000000001`
- **Practitioner ID**: `00000000-0000-0000-0000-000000000002`
- **Appointment ID**: `00000000-0000-0000-0000-000000000003`

Ces données sont automatiquement créées et nettoyées par les tests.

## Exécution des tests

### Tests unitaires (create-payment)
```bash
cd supabase/functions/create-payment
deno test --allow-env index.test.ts
```

### Tests E2E (workflow complet) 🎯
```bash
cd supabase/functions
deno test --allow-net --allow-env payment-workflow.e2e.test.ts
```

### Tous les tests
```bash
cd supabase/functions
deno test --allow-net --allow-env
```

### Mode verbose
```bash
deno test --allow-net --allow-env --reporter=verbose payment-workflow.e2e.test.ts
```

## Structure des tests E2E

```typescript
Deno.test('Payment Workflow E2E - Workflow complet', async (t) => {
  // Setup
  await cleanupTestData();
  await createTestAppointment();
  await createPractitionerPaymentInfo();

  // ÉTAPE 1: Création paiement
  await t.step('1. Création du paiement', async () => {
    // Créer paiement + initialize_payment_balance
    // ✅ Vérifier balance_pending = 4400
  });

  // ÉTAPE 2: Webhook FedaPay
  await t.step('2. Webhook FedaPay', async () => {
    // update_payment_with_balance (paid, held)
    // ✅ Vérifier balance_on_hold = 4400, balance_pending = 0
  });

  // ÉTAPE 3: Release fonds
  await t.step('3. Release des fonds', async () => {
    // update_payment_with_balance (ready)
    // ✅ Vérifier balance_available = 4400, balance_on_hold = 0
  });

  // ÉTAPE 4: Payout
  await t.step('4. Création du payout', async () => {
    // Créer payout + déduire balance_available
    // ✅ Vérifier balance_available = 0
  });

  // Cleanup
  await cleanupTestData();
});
```

## Assertions clés

### Balance Transitions
```typescript
// Après création
balance_pending = 4400, balance_on_hold = 0, balance_available = 0

// Après webhook (paid)
balance_pending = 0, balance_on_hold = 4400, balance_available = 0

// Après release
balance_pending = 0, balance_on_hold = 0, balance_available = 4400

// Après payout
balance_pending = 0, balance_on_hold = 0, balance_available = 0
```

### Status Transitions
```typescript
// Paiement
initiated → paid → ready

// Payout Status
pending → held → ready → paid (via payout)
```

## Résolution des problèmes

### Erreur: "Supabase URL not configured"
```bash
export SUPABASE_URL="https://kskkufjliwdfqqyemcpf.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<your-service-role-key>"
```

### Erreur: "Permission denied"
Vérifiez que les RLS policies permettent l'accès avec le service role key.

### Erreur: "Function update_payment_with_balance does not exist"
Exécutez la migration Supabase qui crée les fonctions RPC:
```sql
-- Vérifier que les fonctions existent
SELECT proname FROM pg_proc WHERE proname LIKE '%payment%balance%';
```

### Tests qui échouent sur balance_pending
Vérifiez que `initialize_payment_balance` est bien appelé après la création du paiement.

## CI/CD Integration

### GitHub Actions
```yaml
name: Test Payment Workflow

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: denoland/setup-deno@v1
        with:
          deno-version: v1.x
      
      - name: Run E2E tests
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: |
          cd supabase/functions
          deno test --allow-net --allow-env payment-workflow.e2e.test.ts
```

## Maintenance

### Ajouter un nouveau test
1. Créer un nouveau `Deno.test()` dans `payment-workflow.e2e.test.ts`
2. Utiliser les helpers: `cleanupTestData()`, `createTestAppointment()`
3. Suivre le pattern: Setup → Steps → Assertions → Cleanup

### Mettre à jour les montants de test
Modifier `TEST_CONFIG.testAmount` et ajuster les assertions:
```typescript
const TEST_CONFIG = {
  testAmount: 5000, // Montant brut
  // net_amount = 5000 - 500 (commission) - 100 (gateway) = 4400
};
```

## Ressources

- [Deno Testing Documentation](https://deno.land/manual/testing)
- [Supabase JS Client](https://supabase.com/docs/reference/javascript/introduction)
- Documentation workflow: `docs/PAYMENT_SYSTEM.md`
- Analyse des erreurs: `docs/PAYMENT_ERRORS_ANALYSIS.md`
