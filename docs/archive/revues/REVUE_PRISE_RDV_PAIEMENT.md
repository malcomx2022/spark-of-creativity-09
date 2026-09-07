# Revue Fonctionnelle - Workflow Prise de Rendez-vous et Paiement

**Date:** 2026-01-27
**Version:** 1.0

---

## 1. Architecture du Workflow

### 1.1 Phases du workflow

```
PHASE 1: RECHERCHE PRATICIEN
    |
    v
[PractitionerSearch.tsx / CoachSearch.tsx]
    |
    v
[Filtres: spécialité, localisation, disponibilité]
    |
    v
PHASE 2: CREATION RENDEZ-VOUS (NewAppointmentDialog.tsx)
    |
    v
[Validation Zod] --> [Check géolocalisation] --> [Edge Function find-available-practitioner]
    |                                                    |
    v                                                    v
[Position invalide?]                          [Praticien trouvé?]
    |                                              |
    v                                    +---------+---------+
[Mode manuel ou retry]                   |                   |
                                    [OUI]               [NON: Toast + fallback]
                                        |
                                        v
                               [Création appointment]
                                        |
                                        v
                               [Statut: awaiting_practitioner]
                                        |
                                        v
                               [Praticien accepte?]
                                        |
                              +---------+---------+
                              |                   |
                         [OUI]               [NON: annulé]
                              |
                              v
PHASE 3: PAIEMENT (PaymentDialog.tsx / FedaPayWidget.tsx)
    |
    v
[Statut: pending_payment] --> [Saisie téléphone + opérateur]
    |                                    |
    v                                    v
[Check paiement existant]       [Edge Function create-payment]
    |                                    |
    v                                    v
[409 Conflit?]                  [FedaPay Transaction créée]
    |                                    |
    v                                    v
[Annuler ou reprendre]          [Widget FedaPay embedded]
                                        |
                                        v
                               [Utilisateur confirme sur téléphone]
                                        |
                                        v
PHASE 4: WEBHOOK (payment-webhook/index.ts)
    |
    v
[FedaPay POST webhook] --> [Vérification HMAC signature]
    |                              |
    v                              v
[Idempotency check]         [Signature valide?]
    |                              |
    v                         +----+----+
[Déjà traité?]               |         |
    |                     [OUI]    [NON: 401]
    |                        |
    |                        v
    |               [Mapping statut: approved → paid]
    |                        |
    |                        v
    |               [Update payments table]
    |                        |
    |                        v
    |               [RPC: update_payment_with_balance]
    |                        |
    |                        v
    |               [Créer ledger_entry]
    |                        |
    |                        v
    |               [Update appointment status → awaiting_practitioner]
    |                        |
    |                        v
    |               [Notifications patient + praticien]
    |
    v
PHASE 5: CONFIRMATION
    |
    v
[Frontend polling détecte changement] --> [Rafraîchissement UI]
    |
    v
[Rendez-vous confirmé - Affichage succès]
```

### 1.2 Statuts des rendez-vous

| Statut | Description | Transition vers |
|--------|-------------|-----------------|
| `pending_payment` | RDV créé, en attente de paiement | `awaiting_practitioner`, `canceled` |
| `awaiting_practitioner` | Paiement OK, en attente confirmation praticien | `confirmed`, `rejected` |
| `confirmed` | Praticien a accepté | `in_progress`, `canceled` |
| `in_progress` | Consultation en cours | `completed` |
| `completed` | Consultation terminée | - |
| `rejected` | Praticien a refusé | - |
| `canceled` | Annulé (patient ou système) | - |

### 1.3 Statuts des paiements

| Statut | Description | Final |
|--------|-------------|-------|
| `initiated` | Paiement créé côté serveur | Non |
| `pending` | En attente de confirmation FedaPay | Non |
| `authorized` | Autorisé mais pas capturé | Non |
| `paid` | Paiement confirmé | Oui |
| `failed` | Échec du paiement | Oui |
| `canceled` | Annulé par l'utilisateur | Oui |
| `refunded` | Remboursé | Oui |
| `chargeback` | Contesté | Oui |

### 1.4 Tables de données

| Table | Champs principaux | Rôle |
|-------|-------------------|------|
| `appointments` | id, patient_id, practitioner_id, status, scheduled_date, scheduled_time, amount | Rendez-vous |
| `payments` | id, appointment_id, amount, status, fedapay_transaction_id, payment_method | Paiements |
| `practitioner_balance` | practitioner_id, available_balance, pending_balance, held_balance | Soldes |
| `ledger_entries` | practitioner_id, amount, type, description | Journal comptable |
| `webhook_events` | event_id, event_type, processed_at | Idempotency webhooks |
| `practitioner_availability` | practitioner_id, day_of_week, start_time, end_time | Disponibilités |
| `practitioner_exceptions` | practitioner_id, date, is_available, reason | Exceptions calendrier |

### 1.5 Fichiers impliqués

| Fichier | Rôle |
|---------|------|
| `src/components/NewAppointmentDialog.tsx` | Dialog création RDV |
| `src/components/PaymentDialog.tsx` | Dialog principal paiement (1747 lignes) |
| `src/components/FedaPayWidget.tsx` | Widget FedaPay embedded |
| `src/hooks/useAppointments.ts` | Hook CRUD rendez-vous |
| `src/hooks/useAvailability.ts` | Hook disponibilités praticien |
| `src/lib/payment-config.ts` | Config et labels paiement |
| `src/lib/payment-storage.ts` | Persistance localStorage |
| `supabase/functions/find-available-practitioner/index.ts` | Edge function recherche |
| `supabase/functions/create-payment/index.ts` | Edge function création paiement |
| `supabase/functions/create-payment/fee-calculator.ts` | Calcul des frais |
| `supabase/functions/payment-webhook/index.ts` | Handler webhook FedaPay |
| `supabase/functions/sync-payment-status/index.ts` | Synchronisation manuelle statut |
| `supabase/functions/cancel-pending-payment/index.ts` | Annulation paiement en cours |

---

## 2. Analyse des Bugs Identifiés

### Bug #1 - CRITIQUE: Méthode de paiement sauvegardée jamais enregistrée

**Fichier:** `src/components/FedaPayWidget.tsx:643-653`

**Problème:**
```typescript
// L'utilisateur coche "Enregistrer cette méthode"
<Checkbox
  id="save-method"
  checked={saveMethod}
  onCheckedChange={(checked) => setSaveMethod(checked as boolean)}
/>

// MAIS: Après paiement réussi, addPaymentMethod() n'est JAMAIS appelé
// Le hook useSavedPaymentMethods est importé mais non utilisé pour sauvegarder
const { paymentMethods, addPaymentMethod } = useSavedPaymentMethods();
```

**Impact:**
- La checkbox "Enregistrer cette méthode" ne fait rien
- L'utilisateur pense avoir sauvegardé mais doit tout ressaisir la prochaine fois
- Mauvaise expérience utilisateur

**Correction requise:**
Dans le callback `onComplete` du widget FedaPay, ajouter:
```typescript
if (saveMethod && sanitizedPhoneNumber) {
  await addPaymentMethod({
    type: paymentMethod,
    phone: sanitizedPhoneNumber,
    label: `${MOBILE_MONEY_PROVIDERS[paymentMethod].name} - ${sanitizedPhoneNumber}`
  });
}
```

---

### Bug #2 - CRITIQUE: Double composant de paiement avec états désynchronisés

**Fichiers:** `PaymentDialog.tsx` et `FedaPayWidget.tsx`

**Problème:**
Deux composants gèrent le paiement de manière indépendante:
- `PaymentDialog.tsx` (1747 lignes) - Version complète avec polling
- `FedaPayWidget.tsx` (717 lignes) - Version widget embedded

Les deux maintiennent leurs propres états et peuvent créer des incohérences:
```typescript
// PaymentDialog.tsx ligne ~100
const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
const [paymentId, setPaymentId] = useState<string | null>(null);

// FedaPayWidget.tsx ligne ~38
const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
const [transactionId, setTransactionId] = useState<number | null>(null);
```

**Impact:**
- Si les deux sont utilisés, l'état peut être désynchronisé
- Duplication de code considérable
- Maintenance difficile

**Correction requise:**
Consolider en un seul composant ou créer un hook partagé `usePaymentFlow`.

---

### Bug #3 - CRITIQUE: Pas de récupération automatique des paiements orphelins

**Fichier:** `src/lib/payment-storage.ts`

**Problème:**
Le localStorage persiste l'état du paiement mais aucun mécanisme ne le récupère automatiquement:
```typescript
// payment-storage.ts sauvegarde l'état
export function setPersistedPaymentState(state: PersistedPaymentState) { ... }

// MAIS: Au chargement du dashboard patient, on ne vérifie PAS s'il y a un paiement en cours
// Si l'utilisateur ferme le navigateur pendant le paiement, il devra tout recommencer
```

**Impact:**
- Paiement initié mais jamais complété si fermeture navigateur
- Argent potentiellement prélevé sans que le RDV soit confirmé
- Aucune alerte au patient

**Correction requise:**
Dans `PatientDashboard.tsx` ou `AppointmentsTab.tsx`, ajouter au mount:
```typescript
useEffect(() => {
  const persistedPayment = getPersistedPaymentState();
  if (persistedPayment && persistedPayment.paymentStatus === 'pending') {
    // Vérifier le statut réel via sync-payment-status
    // Afficher une notification pour reprendre ou annuler
  }
}, []);
```

---

### Bug #4 - MOYEN: Race condition sur création de paiement

**Fichier:** `supabase/functions/create-payment/index.ts:200-250`

**Problème:**
La protection anti-doublon vérifie les paiements des 2 dernières minutes:
```typescript
// Vérifier s'il existe un paiement en cours pour ce rendez-vous
const { data: existingPayments } = await supabase
  .from('payments')
  .select('id, status, created_at')
  .eq('appointment_id', appointmentId)
  .in('status', ['initiated', 'pending'])
  .order('created_at', { ascending: false })
  .limit(1);

if (existingPayments && existingPayments.length > 0) {
  const existingPayment = existingPayments[0];
  const createdAt = new Date(existingPayment.created_at);
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

  if (createdAt > twoMinutesAgo) {
    // Retourner 409 Conflict
  }
}
```

**Impact:**
- Double-clic très rapide peut créer 2 paiements avant que le premier soit détecté
- Le SELECT puis INSERT n'est pas atomique

**Correction requise:**
Utiliser une contrainte UNIQUE ou un verrou PostgreSQL:
```sql
-- Option 1: Contrainte partielle
CREATE UNIQUE INDEX idx_single_pending_payment
ON payments (appointment_id)
WHERE status IN ('initiated', 'pending');

-- Option 2: Advisory lock dans l'edge function
SELECT pg_advisory_xact_lock(hashtext(appointment_id));
```

---

### Bug #5 - MOYEN: Polling ne gère pas les erreurs réseau

**Fichier:** `src/components/PaymentDialog.tsx:700-800`

**Problème:**
Le polling du statut ne gère pas correctement les erreurs réseau:
```typescript
// Polling toutes les 3 secondes
const pollInterval = setInterval(async () => {
  const { data: paymentData } = await supabase
    .from('payments')
    .select('status')
    .eq('id', paymentId)
    .single();

  // Si erreur réseau, paymentData est undefined
  // Le polling continue sans indication d'erreur
  if (paymentData?.status === 'paid') { ... }
}, 3000);
```

**Impact:**
- Si le réseau est coupé, le polling échoue silencieusement
- L'utilisateur ne sait pas que la vérification a échoué
- Le webhook peut avoir réussi mais le frontend ne le voit pas

**Correction requise:**
```typescript
const pollInterval = setInterval(async () => {
  try {
    const { data, error } = await supabase...
    if (error) {
      console.error('Poll error:', error);
      setNetworkError(true);
      return;
    }
    setNetworkError(false);
    // Process data...
  } catch (e) {
    setNetworkError(true);
  }
}, 3000);
```

---

### Bug #6 - MOYEN: Pas de timeout sur l'initialisation du widget FedaPay

**Fichier:** `src/components/FedaPayWidget.tsx:400-530`

**Problème:**
```typescript
// Vérifier si FedaPay est chargé
if (typeof window !== 'undefined' && (window as any).FedaPay) {
  // Initialiser le widget...
} else {
  console.error('FedaPay script not loaded');
  setPaymentStatus('error');
}
```

Le script FedaPay est chargé de manière asynchrone. Si le chargement prend trop de temps ou échoue partiellement, l'utilisateur reste bloqué.

**Impact:**
- Pas de timeout si FedaPay ne charge pas
- L'utilisateur peut attendre indéfiniment

**Correction requise:**
```typescript
const FEDAPAY_LOAD_TIMEOUT = 10000; // 10 secondes

useEffect(() => {
  const checkFedaPayLoaded = () => {
    return typeof window !== 'undefined' && (window as any).FedaPay;
  };

  const timeout = setTimeout(() => {
    if (!checkFedaPayLoaded()) {
      setPaymentStatus('error');
      toast({ title: 'Service de paiement non disponible', variant: 'destructive' });
    }
  }, FEDAPAY_LOAD_TIMEOUT);

  if (checkFedaPayLoaded()) {
    clearTimeout(timeout);
  }

  return () => clearTimeout(timeout);
}, []);
```

---

### Bug #7 - MOYEN: Webhook peut échouer sans rollback du paiement

**Fichier:** `supabase/functions/payment-webhook/index.ts:600-700`

**Problème:**
Si le webhook échoue après avoir mis à jour le paiement mais avant de mettre à jour le rendez-vous:
```typescript
// 1. Update payment status - SUCCEEDS
await supabase.from('payments').update({ status: 'paid' }).eq('id', paymentId);

// 2. Update appointment status - FAILS (e.g., network issue)
await supabase.from('appointments').update({ status: 'awaiting_practitioner' }).eq('id', appointmentId);
// Si cette ligne échoue, le paiement est marqué "paid" mais le RDV reste "pending_payment"
```

**Impact:**
- Incohérence entre statut paiement et statut rendez-vous
- Le patient a payé mais le RDV n'est pas confirmé
- Pas de réconciliation automatique

**Correction requise:**
Utiliser une transaction PostgreSQL ou implémenter un job de réconciliation périodique.

---

### Bug #8 - MINEUR: Validation téléphone légèrement différente frontend/backend

**Fichiers:**
- `src/components/FedaPayWidget.tsx:147`
- `supabase/functions/create-payment/index.ts`

**Problème:**
```typescript
// Frontend (FedaPayWidget.tsx)
const phoneRegex = /^\+229(01)?\d{8}$/;

// Backend pourrait avoir une validation légèrement différente
// Ce qui peut causer des erreurs 400 inattendues
```

**Correction requise:**
Extraire la regex dans un fichier partagé ou une constante.

---

### Bug #9 - MINEUR: Calcul des frais utilise des floats JavaScript

**Fichier:** `supabase/functions/create-payment/fee-calculator.ts`

**Problème:**
```typescript
function roundHalfUp(value: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

// Exemple problématique: 0.1 + 0.2 = 0.30000000000000004 en JavaScript
const commissionAmount = roundHalfUp(amount * config.commissionRate, config.roundingDecimals);
```

**Impact:**
- Erreurs d'arrondi possibles sur les montants
- Pourrait créer des écarts de quelques francs CFA

**Correction recommandée:**
Utiliser une bibliothèque comme `decimal.js` ou travailler en centimes (entiers).

---

### Bug #10 - MINEUR: Pas de limite sur le nombre de tentatives de paiement

**Fichier:** `supabase/functions/create-payment/index.ts`

**Problème:**
Un utilisateur peut créer un nombre illimité de tentatives de paiement pour le même rendez-vous (après le timeout de 2 minutes).

**Impact:**
- Potentiel abus ou DoS
- Historique de paiements pollué

**Correction requise:**
Ajouter une limite (ex: max 5 tentatives par rendez-vous).

---

## 3. Points Positifs du Workflow Actuel

1. **Protection double-clic** - Ref + timestamp dans NewAppointmentDialog et PaymentDialog
2. **Retry avec exponential backoff** - `invokeEdgeFunctionWithRetry` gère les erreurs réseau
3. **Vérification HMAC webhook** - Timing-safe comparison pour la signature FedaPay
4. **Idempotency webhook** - Table `webhook_events` évite le double traitement
5. **Persistance localStorage** - L'état du paiement est sauvegardé localement
6. **Validation Zod complète** - Frontend et backend avec messages d'erreur clairs
7. **Gestion des disponibilités** - Intégration calendrier praticien dans NewAppointmentDialog
8. **Calcul des frais configurable** - Via `system_config` et `fee-calculator.ts`
9. **Mode sandbox FedaPay** - Numéros de test documentés dans l'interface
10. **Annulation paiement en cours** - Edge function `cancel-pending-payment`

---

## 4. Plan de Correction

### Priorité 1 - Critiques

| Bug | Fichier | Action | Statut |
|-----|---------|--------|--------|
| #1 | FedaPayWidget.tsx | Appeler addPaymentMethod après succès si saveMethod=true | ✅ CORRIGÉ |
| #2 | PaymentDialog/FedaPayWidget | Créer hook usePaymentFlow partagé ou consolider | À faire (refactoring) |
| #3 | AppointmentsTab.tsx | Vérifier localStorage au mount et alerter si paiement orphelin | ✅ CORRIGÉ |

### Priorité 2 - Moyens

| Bug | Fichier | Action | Statut |
|-----|---------|--------|--------|
| #4 | create-payment + migrations | Ajouter contrainte UNIQUE partielle ou advisory lock | À faire (migration DB) |
| #5 | PaymentDialog.tsx | Ajouter gestion erreurs réseau dans polling | ✅ CORRIGÉ |
| #6 | FedaPayWidget.tsx | Ajouter timeout chargement script FedaPay | ✅ CORRIGÉ |
| #7 | payment-webhook | Utiliser transaction ou job de réconciliation | À faire (complexe) |

### Priorité 3 - Mineurs

| Bug | Fichier | Action | Statut |
|-----|---------|--------|--------|
| #8 | Shared constants | Extraire regex validation téléphone | Non critique |
| #9 | fee-calculator.ts | Utiliser decimal.js ou calcul en centimes | Non critique |
| #10 | create-payment | Ajouter compteur de tentatives par RDV | Non critique |

---

## 5. Tests Recommandés

### Scénario 1: Paiement normal MTN
1. Créer un rendez-vous
2. Initier le paiement avec MTN
3. Valider sur le téléphone (sandbox: +229 66 00 00 01)
4. Vérifier que le statut passe à "paid"
5. Vérifier que le RDV passe à "awaiting_practitioner"

### Scénario 2: Paiement échoué
1. Créer un rendez-vous
2. Initier le paiement
3. Utiliser numéro d'échec (sandbox: +229 66 00 00 00)
4. Vérifier que le statut passe à "failed"
5. Vérifier qu'on peut réessayer

### Scénario 3: Double-clic rapide
1. Créer un rendez-vous
2. Cliquer très rapidement 2 fois sur "Payer"
3. Vérifier qu'un seul paiement est créé
4. Vérifier le message de protection

### Scénario 4: Fermeture navigateur pendant paiement
1. Créer un rendez-vous
2. Initier le paiement
3. Fermer l'onglet avant confirmation
4. Rouvrir l'application
5. Vérifier si le paiement orphelin est détecté

### Scénario 5: Paiement existant (409)
1. Créer un paiement et le laisser en "pending"
2. Essayer de créer un nouveau paiement
3. Vérifier le message d'erreur 409
4. Vérifier le bouton "Annuler et réessayer"

### Scénario 6: Webhook en double
1. Simuler 2 webhooks identiques pour le même paiement
2. Vérifier que seul le premier est traité
3. Vérifier l'idempotency dans webhook_events

### Scénario 7: Sauvegarde méthode de paiement
1. Payer en cochant "Enregistrer cette méthode"
2. Initier un nouveau paiement
3. Vérifier que la méthode est pré-sélectionnée

---

## 6. Diagramme de séquence - Paiement complet

```
Patient          Frontend            create-payment      FedaPay         payment-webhook      DB
   |                |                      |               |                   |               |
   |--Click Payer-->|                      |               |                   |               |
   |                |---POST /create------>|               |                   |               |
   |                |                      |--Check RDV--->|                   |               |
   |                |                      |<--RDV OK------|                   |               |
   |                |                      |--Check dupes->|                   |               |
   |                |                      |<--No dupes----|                   |               |
   |                |                      |               |                   |               |
   |                |                      |---Create Tx-->|                   |               |
   |                |                      |<--Tx ID-------|                   |               |
   |                |                      |               |                   |               |
   |                |                      |--Insert pay-->|                   |               |
   |                |                      |<--payment_id--|                   |               |
   |                |<--{txId, payId}------|               |                   |               |
   |                |                      |               |                   |               |
   |                |---Init Widget------->|               |                   |               |
   |<--Widget UI----|                      |               |                   |               |
   |                |                      |               |                   |               |
   |--Confirm Phone |                      |               |                   |               |
   |                |                      |               |--USSD prompt---->Patient Phone
   |                |                      |               |<--PIN OK---------|
   |                |                      |               |                   |               |
   |                |                      |               |---POST webhook--->|               |
   |                |                      |               |                   |--Verify sig-->|
   |                |                      |               |                   |<--Sig OK------|
   |                |                      |               |                   |               |
   |                |                      |               |                   |--Update pay-->|
   |                |                      |               |                   |--Update RDV-->|
   |                |                      |               |                   |--Add balance->|
   |                |                      |               |                   |--Ledger entry>|
   |                |                      |               |                   |--Notify----->|
   |                |                      |               |<--200 OK----------|               |
   |                |                      |               |                   |               |
   |                |<--Poll status=paid---|               |                   |               |
   |<--Success UI---|                      |               |                   |               |
```

---

## 7. Conclusion

Le workflow de prise de rendez-vous et paiement est globalement bien structuré avec de bonnes pratiques de sécurité (HMAC, idempotency, protection double-clic).

### Bugs corrigés (2026-01-27)

- ✅ **Bug #1** : Sauvegarde méthode de paiement maintenant fonctionnelle dans FedaPayWidget
- ✅ **Bug #3** : Récupération des paiements orphelins ajoutée dans AppointmentsTab
- ✅ **Bug #5** : Gestion des erreurs réseau dans le polling avec avertissement utilisateur
- ✅ **Bug #6** : Timeout de 15s ajouté pour le chargement du script FedaPay

### Bugs restants à traiter

- **Bug #2** (Critique - Refactoring) : Consolider PaymentDialog et FedaPayWidget
- **Bug #4** (Moyen - Migration DB) : Ajouter contrainte UNIQUE pour éviter les doublons
- **Bug #7** (Moyen - Complexe) : Transaction dans webhook ou job de réconciliation
- **Bugs #8-10** (Mineurs) : Améliorations non critiques pour le fonctionnement

Le workflow est maintenant plus robuste avec la détection des paiements orphelins et une meilleure gestion des erreurs réseau.
