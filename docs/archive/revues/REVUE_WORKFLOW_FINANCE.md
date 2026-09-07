# Revue Workflow Finance - DomiCares

**Date:** 2026-01-27
**Version:** 1.0

---

## 1. Structure du Workflow Finance

### 1.1 Flux de Paiement Complet

```
Patient paie (FedaPay)
        ↓
   payment.status = 'paid'
   payout_status = 'held'
        ↓
   Fonds en balance_on_hold (48h)
        ↓
   [Cron horaire ou release manuel]
        ↓
   balance_on_hold → balance_available
   payout_status = 'ready'
        ↓
   Admin crée lot (create-payout-batch)
        ↓
   Admin exécute lot (process-payout-batch)
        ↓
   FedaPay transfert vers praticien
        ↓
   payout.status = 'completed'
```

### 1.2 Sous-onglets Finance (9)

| Onglet | Composant | Description |
|--------|-----------|-------------|
| Flux temps réel | PaymentFlowsDashboard | Graphiques et transactions live |
| Paiements | FinanceSection | Liste paginée des paiements |
| Reversements | FinanceSection | Liste paginée des payouts |
| Lots de Versement | PayoutsManagementSection | Création et exécution lots |
| Release Fonds | FundsReleaseSection | Libération fonds en rétention |
| Remboursements | RefundsSection | Traitement des refunds |
| Réconciliation | ReconciliationSection | Comparaison comptable |
| Webhooks | WebhooksSection | Événements FedaPay |
| Événements | PaymentEventsSection | Historique événements |

---

## 2. Bugs Identifiés et Corrigés

### Bug #1 - MOYEN: Paiements sans nom patient/praticien

**Problème:**
Dans l'onglet Paiements, seuls les IDs tronqués étaient affichés (patient_id, appointment_id).

**Solution:**
- Jointure avec `profiles` pour le patient (full_name, phone)
- Jointure avec `appointments` pour le praticien (practitioner_name, specialty)
- Affichage des noms complets avec téléphone/spécialité en sous-texte

**Query mise à jour:**
```typescript
.select(`
  *,
  patient:profiles!payments_patient_id_fkey(id, full_name, phone),
  appointment:appointments!payments_appointment_id_fkey(id, practitioner_name, specialty, date)
`)
```

---

### Bug #2 - MOYEN: Reversements sans nom praticien

**Problème:**
Dans l'onglet Reversements, seul l'ID praticien tronqué était affiché.

**Solution:**
- Jointure avec `practitioners` (name, phone)
- Affichage du nom complet avec téléphone en sous-texte

**Query mise à jour:**
```typescript
.select(`
  *,
  practitioner:practitioners!practitioner_payouts_practitioner_id_fkey(id, name, phone)
`)
```

---

### Bug #3 - MOYEN: Pas de filtre par statut pour paiements

**Problème:**
Impossible de filtrer les paiements (ex: voir uniquement les échoués).

**Solution:**
- Ajout d'un Select dropdown avec options:
  - Tous
  - En attente (pending)
  - Payés (paid)
  - Échoués (failed)
  - Annulés (cancelled)
  - Remboursés (refunded)
- Bouton de rafraîchissement manuel
- Reset page à 1 lors du changement de filtre

---

### Bug #4 - MOYEN: Remboursements sans nom patient

**Problème:**
Dans RefundsSection, les paiements et remboursements n'affichaient que les IDs.

**Solution:**
- Jointure pour paiements remboursables (patient + appointment)
- Jointure pour historique remboursements (payment → patient)
- Colonnes mises à jour: Patient, Praticien

---

### Bug #5 - MINEUR: Pas d'audit log pour remboursements

**Problème:**
Les remboursements n'étaient pas tracés dans l'audit admin.

**Solution:**
- Ajout d'un log dans `admin_audit_logs` après chaque remboursement
- Détails: montant, raison, patient_id

**Code ajouté:**
```typescript
await supabase.from('admin_audit_logs').insert({
  admin_id: user.id,
  action: 'Refund processed',
  entity_type: 'payment',
  entity_id: selectedPayment.id,
  details: {
    amount: parsedAmount || selectedPayment.amount,
    reason: refundReason,
    patient_id: selectedPayment.patient_id,
  },
});
```

---

### Bug #6 - MOYEN: Statuts paiements non traduits

**Problème:**
Les statuts affichaient "pending", "paid", "failed" en anglais.

**Solution:**
- Mapping des statuts vers labels français:
  - pending → En attente
  - paid → Payée
  - failed → Échouée
  - cancelled → Annulée
  - refunded → Remboursée
- Application aux paiements et payouts

---

## 3. Composants Finance Analysés

### 3.1 PaymentFlowsDashboard (Temps réel)

**Fonctionnalités:**
- Graphiques BarChart et AreaChart (Recharts)
- Realtime subscriptions (3 channels)
- Stats: En attente, En hold, Disponible
- Transactions FedaPay avec résumé par statut

**Realtime:**
- `practitioner_balances` → Mise à jour soldes
- `practitioner_payouts` → Mise à jour payouts
- `payments` → Mise à jour transactions

---

### 3.2 PayoutsManagementSection (Lots de Versement)

**Workflow:**
1. Afficher praticiens avec balance_available > 0
2. Sélectionner praticiens (checkbox)
3. Choisir méthode (Mobile Money / Virement)
4. Créer lot → `create-payout-batch`
5. Voir détails lot
6. Exécuter → `process-payout-batch`

**Edge Functions:**
- `create-payout-batch`: Crée le lot et les payouts individuels
- `process-payout-batch`: Exécute les virements via FedaPay

---

### 3.3 FundsReleaseSection (Release Fonds)

**Workflow:**
1. Afficher paiements avec `payout_status = 'held'`
2. Montrer temps restant avant libération
3. Release manuel via `release-held-funds`
4. Cron automatique toutes les heures

**Statuts:**
- Prêt à libérer: hold_until < now
- En attente: hold_until > now

---

### 3.4 RefundsSection (Remboursements)

**Workflow:**
1. Afficher paiements `paid` ou `partially_refunded`
2. Cliquer Rembourser
3. Saisir montant et raison
4. Confirmer → `process-refund`
5. Audit log créé

**Validations:**
- Montant > 0
- Montant <= montant original
- Raison obligatoire

---

## 4. Tables Base de Données Finance

| Table | Description |
|-------|-------------|
| payments | Paiements patients |
| practitioner_payouts | Versements praticiens |
| payout_batches | Lots de versement |
| practitioner_balances | Soldes praticiens |
| payment_refunds | Historique remboursements |
| webhook_events | Événements FedaPay |

---

## 5. Edge Functions Finance

| Edge Function | Description |
|--------------|-------------|
| create-payment | Crée paiement FedaPay |
| payment-webhook | Reçoit webhooks FedaPay |
| sync-payment-status | Synchronise statut |
| release-held-funds | Libère fonds après 48h |
| create-payout-batch | Crée lot versement |
| process-payout-batch | Exécute virements |
| create-payout | Virement individuel |
| process-refund | Traite remboursement |

---

## 6. Tests Recommandés

### 6.1 Test Filtre Paiements

1. Créer paiements avec différents statuts
2. Appliquer filtre "Payés"
3. Vérifier que seuls les payés s'affichent
4. Changer filtre, vérifier mise à jour

### 6.2 Test Affichage Noms

1. Ouvrir onglet Paiements
2. Vérifier nom patient affiché (pas ID)
3. Vérifier nom praticien + spécialité
4. Ouvrir onglet Reversements, idem

### 6.3 Test Remboursement avec Audit

1. Sélectionner un paiement "paid"
2. Cliquer Rembourser
3. Saisir montant et raison
4. Confirmer
5. Vérifier dans Audit Logs:
   - Action "Refund processed"
   - Entity type "payment"
   - Details (montant, raison)

---

## 7. Récapitulatif des Modifications

| Fichier | Modifications |
|---------|--------------|
| FinanceSection.tsx | +60 lignes (jointures, filtre, traductions) |
| RefundsSection.tsx | +30 lignes (jointures, audit log) |

---

## 8. Statut Final

| Bug | Statut |
|-----|--------|
| #1 Paiements sans noms | ✅ CORRIGÉ |
| #2 Reversements sans noms | ✅ CORRIGÉ |
| #3 Filtre paiements | ✅ CORRIGÉ |
| #4 Remboursements sans noms | ✅ CORRIGÉ |
| #5 Audit remboursements | ✅ CORRIGÉ |
| #6 Statuts non traduits | ✅ CORRIGÉ |

**Workflow Finance: PRÊT POUR PRODUCTION**
