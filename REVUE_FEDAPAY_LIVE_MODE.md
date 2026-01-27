# Revue FedaPay - Passage en Mode LIVE

**Date:** 2026-01-27
**Version:** 1.0

---

## 1. Checklist Configuration LIVE

### 1.1 Variables d'environnement requises (Supabase Edge Functions)

| Variable | Description | Obligatoire | Format attendu |
|----------|-------------|-------------|----------------|
| `FEDAPAY_MODE` | Mode d'exécution | OUI | `live` |
| `FEDAPAY_PUBLIC_KEY` | Clé publique FedaPay | OUI | `pk_live_XXXXXXXX` |
| `FEDAPAY_SECRET_KEY` | Clé secrète FedaPay | OUI | `sk_live_XXXXXXXX` |
| `FEDAPAY_WEBHOOK_SECRET` | Secret pour signatures webhook | **OUI (LIVE)** | Chaîne secrète |
| `APP_BASE_URL` | URL de l'application | OUI | `https://domicares.life` |
| `PLATFORM_WALLET_ID` | ID compte plateforme (payouts) | Optionnel | UUID |

### 1.2 Configuration Dashboard FedaPay (https://live.fedapay.com)

1. **Webhook URL**: `https://jucqnqatncjcjlnhprsq.supabase.co/functions/v1/payment-webhook`
2. **Événements à activer**:
   - `transaction.approved`
   - `transaction.declined`
   - `transaction.canceled`
   - `transfer.approved` (pour payouts)
   - `transfer.declined`
3. **Secret Webhook**: Copier et configurer dans `FEDAPAY_WEBHOOK_SECRET`

---

## 2. Analyse des Edge Functions

### 2.1 create-payment/index.ts ✅

| Aspect | Statut | Notes |
|--------|--------|-------|
| URL API dynamique | ✅ OK | Utilise `FEDAPAY_MODE` pour choisir l'URL |
| Logs en production | ✅ OK | Pas de données sensibles |
| Timeout API | ✅ OK | 30 secondes avec fetchWithTimeout |
| Validation Zod | ✅ OK | Tous les inputs validés |
| Format téléphone | ✅ OK | Fonctionne en live et sandbox |

### 2.2 payment-webhook/index.ts ✅

| Aspect | Statut | Notes |
|--------|--------|-------|
| Signature HMAC obligatoire (LIVE) | ✅ OK | Erreur 500 si absent en live |
| Timing-safe comparison | ✅ OK | Prévention timing attacks |
| Timestamp validation | ✅ OK | 5 min max en live (vs 30 min sandbox) |
| Idempotence | ✅ OK | UPSERT atomique |
| Notification patient | ✅ OK | Après paiement confirmé |
| Notification praticien | ✅ OK | Après paiement confirmé |

### 2.3 create-payout/index.ts ⚠️

| Aspect | Statut | Notes |
|--------|--------|-------|
| URL API dynamique | ✅ OK | Utilise `FEDAPAY_MODE` |
| Format country code | ⚠️ À corriger | `'BJ'` devrait être `'bj'` (minuscules) |

### 2.4 sync-payment-status/index.ts ✅

| Aspect | Statut | Notes |
|--------|--------|-------|
| URL API dynamique | ✅ OK | Utilise `FEDAPAY_MODE` |
| Mapping statuts | ✅ OK | Complet |
| Mise à jour balance | ✅ OK | Via RPC atomique |

### 2.5 cancel-pending-payment/index.ts ✅

| Aspect | Statut | Notes |
|--------|--------|-------|
| Support RDV classiques | ✅ OK | |
| Support séances groupe | ✅ OK | Format `group_session_*` géré |

### 2.6 process-refund/index.ts ✅

| Aspect | Statut | Notes |
|--------|--------|-------|
| URL API dynamique | ✅ OK | Utilise `FEDAPAY_MODE` |

---

## 3. Analyse des Widgets Frontend

### 3.1 FedaPayWidget.tsx ✅

| Aspect | Statut | Notes |
|--------|--------|-------|
| Chargement script avec timeout | ✅ OK | 15 secondes |
| Pas de pré-remplissage sandbox | ✅ OK | Log console seulement |
| Alerte mode sandbox | ✅ OK | Affichée si environment=sandbox |
| Sauvegarde méthode paiement | ✅ OK | |

### 3.2 GroupSessionPaymentWidget.tsx ✅

| Aspect | Statut | Notes |
|--------|--------|-------|
| Chargement script avec timeout | ✅ OK | 15 secondes (corrigé) |
| Pas de pré-remplissage sandbox | ✅ OK | Corrigé - log console seulement |
| Sauvegarde méthode paiement | ✅ OK | Corrigé |

### 3.3 RetryGroupSessionPaymentWidget.tsx ❌

| Aspect | Statut | Notes |
|--------|--------|-------|
| Pré-remplissage numéro sandbox | ❌ À corriger | Ligne 65-66 |
| Pas de timeout script | ⚠️ À améliorer | |

---

## 4. Bugs Identifiés

### Bug #1 - CRITIQUE: RetryGroupSessionPaymentWidget pré-remplit numéro sandbox

**Fichier:** `src/components/coach/RetryGroupSessionPaymentWidget.tsx:65-66`

**Problème:**
```typescript
if (data?.environment === 'sandbox' && !phoneNumber) {
  setPhoneNumber('+22966000001');
}
```

Ce code ne devrait PAS exister, même conditionné sur sandbox.

**Correction requise:**
Supprimer ce bloc et utiliser uniquement les logs console.

---

### Bug #2 - MOYEN: create-payout utilise country code en majuscules

**Fichier:** `supabase/functions/create-payout/index.ts:334`

**Problème:**
```typescript
phone_number: {
  number: cleanPhone,
  country: 'BJ' // Majuscules
}
```

Mais `create-payment` utilise:
```typescript
country: 'bj' // Minuscules - correct selon FedaPay
```

**Correction requise:**
Uniformiser en minuscules `'bj'`.

---

### Bug #3 - MINEUR: Commentaires trompeurs sur "sandbox"

**Fichiers:** `create-payment/index.ts:480`, `FedaPayWidget.tsx:184`

**Problème:**
```typescript
number: phoneNumber.replace(/^\+229/, ''), // Retirer +229 pour sandbox
```

Le commentaire suggère que c'est seulement pour sandbox, mais ce format est correct pour les deux modes.

**Correction requise:**
Mettre à jour les commentaires.

---

## 5. Tests de Validation LIVE

### 5.1 Test Connectivité FedaPay

```bash
# Appeler l'edge function de test
curl -X POST "https://jucqnqatncjcjlnhprsq.supabase.co/functions/v1/test-fedapay-connectivity"
```

Vérifier:
- `results.analysis.secretKeyMode === 'live'`
- `results.analysis.publicKeyMode === 'live'`
- `results.api.status === 'success'`

### 5.2 Test Webhook

1. Créer un paiement test en live
2. Vérifier que le webhook est reçu
3. Vérifier la signature est validée
4. Vérifier les notifications sont envoyées

### 5.3 Scénarios de Paiement

| Scénario | Test |
|----------|------|
| Paiement RDV MTN succès | Créer RDV, payer avec MTN |
| Paiement RDV MOOV succès | Créer RDV, payer avec MOOV |
| Paiement séance groupe | S'inscrire et payer |
| Retry paiement échoué | Échouer paiement, retry |
| Annulation paiement pending | Annuler avant confirmation |
| Webhook signature invalide | Envoyer faux webhook, vérifier rejet |

### 5.4 Scénarios Payout (Praticien)

| Scénario | Test |
|----------|------|
| Payout MTN | Demander payout sur MTN |
| Payout MOOV | Demander payout sur MOOV |
| Payout Bank | Demander payout bancaire |

---

## 6. Plan de Correction

### Priorité 1 - Critiques (Avant passage LIVE)

| Bug | Fichier | Action | Statut |
|-----|---------|--------|--------|
| #1 | RetryGroupSessionPaymentWidget.tsx | Supprimer pré-remplissage numéro | ✅ CORRIGÉ |

### Priorité 2 - Moyens

| Bug | Fichier | Action | Statut |
|-----|---------|--------|--------|
| #2 | create-payout/index.ts | Corriger country 'BJ' → 'bj' | ✅ CORRIGÉ |

### Priorité 3 - Mineurs

| Bug | Fichier | Action | Statut |
|-----|---------|--------|--------|
| #3 | create-payment, FedaPayWidget | Corriger commentaires | ✅ CORRIGÉ |

---

## 7. Checklist Finale Passage en LIVE

### Configuration Supabase
- [ ] `FEDAPAY_MODE` = `live`
- [ ] `FEDAPAY_PUBLIC_KEY` = `pk_live_...`
- [ ] `FEDAPAY_SECRET_KEY` = `sk_live_...`
- [ ] `FEDAPAY_WEBHOOK_SECRET` configuré
- [ ] `APP_BASE_URL` = `https://domicares.life`

### Configuration Dashboard FedaPay
- [ ] Webhook URL configurée
- [ ] Événements transaction activés
- [ ] Événements transfer activés (si payouts)
- [ ] Secret webhook copié

### Tests
- [ ] test-fedapay-connectivity réussi
- [ ] Paiement test MTN réussi
- [ ] Paiement test MOOV réussi
- [ ] Webhook reçu et traité
- [ ] Notifications envoyées
- [ ] Payout test réussi (si activé)

### Corrections Code
- [ ] Bug #1 corrigé (RetryGroupSessionPaymentWidget)
- [ ] Bug #2 corrigé (create-payout country code)
- [ ] Bug #3 corrigé (commentaires)

---

## 8. Conclusion

L'implémentation FedaPay est **prête pour le mode LIVE**.

### Corrections effectuées (2026-01-27)

- ✅ **Bug #1** - Suppression pré-remplissage numéro sandbox dans RetryGroupSessionPaymentWidget
- ✅ **Bug #2** - Correction country code 'BJ' → 'bj' dans create-payout
- ✅ **Bug #3** - Correction des commentaires trompeurs

### État actuel

1. ✅ **URLs API** - Toutes les edge functions utilisent `FEDAPAY_MODE` correctement
2. ✅ **Sécurité Webhook** - Signature HMAC obligatoire en LIVE
3. ✅ **Timeouts** - Présents sur tous les appels API (30s)
4. ✅ **Validation** - Zod sur tous les inputs
5. ✅ **Format téléphone** - Correct pour live et sandbox
6. ✅ **Country code** - Minuscules partout
7. ✅ **Pas de données test** - Aucun numéro de test pré-rempli

### Configuration vérifiée (2026-01-27)

```
✅ test-fedapay-connectivity:
   - Mode: live
   - Clé publique: pk_live_* ✅
   - Clé secrète: sk_live_* ✅
   - Checkout FedaPay: accessible ✅
   - CDN FedaPay: accessible ✅
   - Test transaction: succès (ID: 109025880) ✅
   - État global: healthy ✅

✅ Webhook sécurisé:
   - FEDAPAY_WEBHOOK_SECRET: configuré ✅
   - Requêtes sans signature: rejetées ✅
   - URL: https://jucqnqatncjcjlnhprsq.supabase.co/functions/v1/payment-webhook
```

### Prochaine étape

Effectuer un paiement test réel en LIVE pour valider le flux complet.
