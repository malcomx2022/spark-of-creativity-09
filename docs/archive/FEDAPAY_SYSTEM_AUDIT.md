# Audit Système de Paiement FedaPay

## Date : 2025-11-29

## Résumé Exécutif

Audit complet du système de paiement intégrant FedaPay. Identification des problèmes de conformité et des blocages empêchant le bon fonctionnement des paiements.

---

## 🔴 Problèmes Critiques Identifiés

### 1. Gestion Incomplète des Statuts FedaPay

**Localisation**: `supabase/functions/payment-webhook/index.ts` (ligne 78-86)

**Problème**: 
- Le mapping des statuts ne gère pas `authorized`, un statut intermédiaire important de FedaPay
- Manque de gestion pour les statuts `processing` et `timeout`

```typescript
// ACTUEL (incomplet)
const statusMap: Record<string, string> = {
  'pending': 'pending',
  'approved': 'paid',
  'declined': 'failed',
  'canceled': 'canceled',
  'refunded': 'refunded',
};

// DEVRAIT ÊTRE
const statusMap: Record<string, string> = {
  'pending': 'pending',
  'processing': 'pending',
  'authorized': 'authorized',
  'approved': 'paid',
  'declined': 'failed',
  'canceled': 'canceled',
  'refunded': 'refunded',
  'timeout': 'failed',
};
```

**Impact**: Les paiements en statut `authorized` ou `processing` ne sont pas traités correctement.

---

### 2. URL de Callback Manquante

**Localisation**: `supabase/functions/create-payment/index.ts` (ligne 360-385)

**Problème**: 
- Utilise uniquement `notify_url` (webhook serveur)
- N'utilise pas `callback_url` (redirection client)
- L'utilisateur n'est pas redirigé après paiement

```typescript
// ACTUEL
body: JSON.stringify({
  // ... autres champs
  notify_url: `${supabaseUrl}/functions/v1/payment-webhook`,
  // ❌ callback_url manquant
})

// DEVRAIT ÊTRE
body: JSON.stringify({
  // ... autres champs
  notify_url: `${supabaseUrl}/functions/v1/payment-webhook`,
  callback_url: `https://domicares.app/payment/callback?payment_id=${appointmentId}`,
})
```

**Impact**: Après avoir payé via FedaPay, l'utilisateur reste sur la page FedaPay sans retour automatique vers l'application.

---

### 3. Gestion des Transitions de Balance Incomplète

**Localisation**: `supabase/functions/payment-webhook/index.ts` (ligne 151)

**Problème**:
- Ne gère que `['paid', 'failed', 'canceled']`
- Ignore le statut `authorized` qui doit aussi affecter le balance

```typescript
// ACTUEL
if (practitionerId && ['paid', 'failed', 'canceled'].includes(paymentStatus)) {
  // Mise à jour atomique
}

// DEVRAIT ÊTRE
if (practitionerId && ['paid', 'authorized', 'failed', 'canceled'].includes(paymentStatus)) {
  // Gérer toutes les transitions importantes
}
```

**Impact**: Les paiements autorisés ne sont pas comptabilisés dans le balance du praticien.

---

### 4. Vérification Timestamp Trop Stricte pour Sandbox

**Localisation**: `supabase/functions/payment-webhook/index.ts` (ligne 467-487)

**Problème**:
- Rejette les webhooks de plus de 5 minutes
- FedaPay sandbox peut avoir des délais importants lors des tests
- Rejette aussi les webhooks "dans le futur" avec seulement 1 minute de marge

```typescript
// ACTUEL
if (Math.abs(diffMinutes) > 5) {
  // Rejet strict
}

// DEVRAIT ÊTRE (différencier sandbox/production)
const maxAge = fedapayMode === 'sandbox' ? 30 : 5; // 30 min en sandbox, 5 en prod
const clockSkewMargin = fedapayMode === 'sandbox' ? 5 : 1; // Plus de marge en sandbox
```

**Impact**: Webhooks rejetés en sandbox lors de tests, empêchant la validation du système.

---

### 5. Erreur 409 Mal Gérée Côté Client

**Localisation**: 
- `src/components/PaymentDialog.tsx`
- `src/components/FedaPayWidget.tsx`

**Problème**:
- Le parsing du JSON imbriqué dans l'erreur 409 est fragile
- Plusieurs patterns de parsing sans garantie de succès
- Peut causer des écrans blancs si le parsing échoue

**Impact**: Écrans blancs quand un paiement est déjà en cours, mauvaise UX.

---

### 6. Numéros de Test Non Accessibles à l'UI

**Localisation**: `src/components/FedaPayWidget.tsx` et `PaymentDialog.tsx`

**Problème**:
- Les numéros de test FedaPay sont affichés uniquement dans les logs backend
- Difficiles à trouver pour les testeurs
- L'alerte côté client existe mais pourrait être plus visible

**Impact**: Testeurs ne savent pas quels numéros utiliser, tests qui échouent inutilement.

---

## 🟡 Problèmes Non-Critiques

### 7. Logs Verbeux en Production

**Problème**: Trop de logs en production avec des informations potentiellement sensibles.

**Recommandation**: Filtrer davantage les logs en mode production.

---

### 8. Gestion Manuelle des Paiements Expirés

**Problème**: Le nettoyage des paiements expirés se fait uniquement lors d'une nouvelle tentative de paiement.

**Recommandation**: Créer un job CRON pour nettoyer automatiquement les paiements expirés.

---

## ✅ Points Conformes

1. ✅ Utilisation correcte de `notify_url` pour les webhooks
2. ✅ Vérification HMAC des signatures (en mode live)
3. ✅ Gestion atomique des balances avec RPC
4. ✅ Idempotence des webhooks avec table `webhook_events`
5. ✅ Timeout sur les requêtes FedaPay (30s)
6. ✅ Numéros de test documentés dans les logs
7. ✅ Mode sandbox/production bien géré
8. ✅ Auto-remplissage du numéro de test en sandbox

---

## 📋 Plan de Correction

### Phase 1 : Corrections Critiques (Immédiat)

1. **Compléter le mapping des statuts FedaPay**
   - Ajouter `authorized`, `processing`, `timeout`
   - Gérer les transitions de balance pour `authorized`

2. **Ajouter callback_url**
   - Créer une page de callback dans l'app
   - Ajouter le paramètre à la création de transaction
   - Gérer le retour utilisateur

3. **Améliorer la gestion des erreurs 409**
   - Simplifier le parsing côté client
   - Ajouter des fallbacks robustes
   - Éviter les écrans blancs

### Phase 2 : Améliorations (Court terme)

4. **Assouplir la vérification timestamp en sandbox**
   - Augmenter la fenêtre à 30 minutes en sandbox
   - Garder 5 minutes en production

5. **Améliorer l'affichage des numéros de test**
   - Rendre l'alerte plus visible
   - Ajouter un guide de test dans l'UI

### Phase 3 : Optimisations (Moyen terme)

6. **Créer un job CRON pour nettoyer les paiements expirés**
7. **Réduire les logs en production**
8. **Ajouter des métriques de monitoring**

---

## 🧪 Tests Recommandés

Après corrections, tester :

1. **Scénario 1**: Paiement MTN succès en sandbox
   - Numéro: +229 66 00 00 01
   - Vérifier: Balance praticien mis à jour, statut `paid`

2. **Scénario 2**: Paiement MOOV succès en sandbox
   - Numéro: +229 64 00 00 01
   - Vérifier: Redirection callback fonctionne

3. **Scénario 3**: Paiement échoué
   - Numéro: +229 66 00 00 00
   - Vérifier: Balance non affecté, statut `failed`

4. **Scénario 4**: Double tentative de paiement
   - Créer 2 paiements < 2 min d'écart
   - Vérifier: Erreur 409 bien gérée, pas d'écran blanc

5. **Scénario 5**: Webhook avec délai
   - Simuler un webhook de 10 minutes en sandbox
   - Vérifier: Accepté en sandbox, rejeté en prod

---

## 📝 Conclusion

Le système de paiement FedaPay est **partiellement conforme** mais présente des **blocages critiques** empêchant son bon fonctionnement :

- ❌ Gestion incomplète des statuts
- ❌ Pas de callback_url (mauvaise UX)
- ❌ Erreurs 409 mal gérées
- ⚠️  Vérification timestamp trop stricte pour sandbox

**Priorité absolue** : Corriger les points 1, 2 et 3 pour rendre le système fonctionnel.
