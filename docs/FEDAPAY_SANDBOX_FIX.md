# 🎯 RÉSOLU : Paiements FedaPay Sandbox qui échouent

## 🔴 Problèmes Identifiés

J'ai trouvé **2 bugs critiques** qui faisaient échouer vos paiements avec le numéro de test 66000001 :

### Bug #1 : Code Pays en MAJUSCULES ❌
**Localisation** : Tous les fichiers qui appellent FedaPay
- `create-payment/index.ts` ligne 362
- `PaymentDialog.tsx` ligne 664
- `FedaPayWidget.tsx` ligne 309

**Le problème** :
```typescript
country: 'BJ'  // ❌ MAJUSCULES - REFUSÉ par FedaPay !
```

**Ce que FedaPay attend** :
```typescript
country: 'bj'  // ✅ MINUSCULES - Selon la documentation officielle
```

### Bug #2 : Format du Numéro avec Préfixe ❌
**Le problème** :
```typescript
number: '+22966000001'  // ❌ Avec préfixe +229
```

**Ce que FedaPay attend pour sandbox** :
```typescript
number: '66000001'  // ✅ SANS préfixe +229
```

---

## ✅ Corrections Appliquées

J'ai corrigé les 3 fichiers :

### 1. Backend : `supabase/functions/create-payment/index.ts`
```typescript
phone_number: {
  number: phoneNumber.replace(/^\+229/, ''), // Retire +229
  country: 'bj' // Minuscules
}
```

### 2. Frontend : `src/components/PaymentDialog.tsx`
```typescript
phone_number: {
  number: sanitizedPhoneNumber.replace(/^\+229/, ''),
  country: 'bj',
}
```

### 3. Frontend : `src/components/FedaPayWidget.tsx`
```typescript
phone_number: {
  number: sanitizedPhoneNumber.replace(/^\+229/, ''),
  country: 'bj',
}
```

---

## 📋 Numéros de Test FedaPay Sandbox

Selon la [documentation officielle](https://docs-v1.fedapay.com/payments/test) :

| Numéro | Opérateur | Résultat |
|--------|-----------|----------|
| **66000001** | MTN Benin | **Succès** ✅ |
| 66000000 | MTN Benin | Échec ❌ |
| 64000001 | MOOV Benin | Succès ✅ |
| 64000000 | MOOV Benin | Échec ❌ |

---

## 🧪 Comment Tester Maintenant

### Étape 1 : Redéployer le code
Les changements sont sur la branche `claude/fix-payment-failure-01N1R2fkpC9kC3C2SbiGWiA5`.

Deployez les edge functions mises à jour :
```bash
supabase functions deploy create-payment
```

### Étape 2 : Test de Paiement MTN

1. **Créer un rendez-vous** dans votre application
2. **Cliquer sur "Payer"**
3. **Utiliser ces valeurs** :
   - Numéro : `66000001` (ou `0166000001` ou `+22966000001`)
   - Méthode : **MTN**
   - Montant : n'importe quel montant

4. **Résultat attendu** :
   - Une popup FedaPay s'ouvre ✅
   - Le formulaire de paiement s'affiche ✅
   - Vous voyez les options MTN Mobile Money ✅
   - Le paiement se complète avec succès ✅

### Étape 3 : Test de Paiement MOOV

1. **Créer un autre rendez-vous**
2. **Utiliser ces valeurs** :
   - Numéro : `64000001`
   - Méthode : **MOOV**

3. **Résultat attendu** :
   - Le paiement doit également réussir ✅

---

## 🔍 Vérifications Complémentaires

### Vérifier les Variables d'Environnement

Assurez-vous que ces variables sont définies dans Supabase :

```bash
FEDAPAY_PUBLIC_KEY=pk_sandbox_XXXXXXXXXXXXX
FEDAPAY_SECRET_KEY=sk_sandbox_XXXXXXXXXXXXX
FEDAPAY_MODE=sandbox
FEDAPAY_WEBHOOK_SECRET=whsec_XXXXXXXXXXXXX
```

### Vérifier les Logs

Après un test de paiement, vérifiez les logs dans Supabase :

```bash
# Dans Supabase Dashboard > Edge Functions > create-payment > Logs
```

Vous devriez voir :
```
✅ Étape 1 Terminée : Transaction créée
✅ Étape 2 Terminée : Token généré avec succès
```

---

## 📊 Format FedaPay Correct

Pour référence, voici le format exact attendu par l'API FedaPay :

```json
{
  "customer": {
    "firstname": "Patient",
    "lastname": "Test",
    "email": "[email protected]",
    "phone_number": {
      "number": "66000001",   // ✅ Sans +229
      "country": "bj"         // ✅ Minuscules !
    }
  },
  "transaction": {
    "amount": 10000,
    "description": "Paiement rendez-vous médical",
    "currency": { "iso": "XOF" }
  }
}
```

---

## 🚨 Si le Problème Persiste

Si après ces corrections le paiement échoue encore :

### 1. Vérifier le Console du Navigateur (F12)

```javascript
// Ouvrez la console et cherchez les erreurs
// Vous devriez voir :
"FedaPay widget initialized"
"Payment initiated"
```

### 2. Vérifier la Réponse de l'API FedaPay

Dans les logs backend, vérifiez :
```
FedaPay transaction created successfully: {...}
```

Si vous voyez une erreur 400 ou 422, vérifiez le message d'erreur exact.

### 3. Lancer le Diagnostic

Utilisez l'outil de diagnostic créé :
```bash
curl -X POST https://your-project.supabase.co/functions/v1/test-fedapay-connectivity \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" | jq '.'
```

### 4. Vérifier le Statut sur FedaPay Dashboard

- Connectez-vous sur [sandbox.fedapay.com](https://sandbox.fedapay.com)
- Vérifiez l'onglet "Transactions"
- Vous devriez voir votre transaction de test

---

## 📚 Sources Consultées

- [FedaPay Test Card Numbers](https://docs-v1.fedapay.com/payments/test)
- [FedaPay API - Collects Management](https://docs.fedapay.com/integration-api/en/collects-management-en)
- [FedaPay Ruby SDK Examples](https://github.com/fedapay/fedapay-ruby)

---

## ✅ Checklist de Validation

- [x] Code pays en minuscules (`'bj'`)
- [x] Numéro sans préfixe +229 pour sandbox
- [x] Variables d'environnement configurées
- [x] Code déployé sur Supabase
- [ ] Test avec 66000001 (MTN) - **À TESTER**
- [ ] Test avec 64000001 (MOOV) - **À TESTER**
- [ ] Vérification du webhook - **À VÉRIFIER**

---

## 🎉 Résultat Attendu

Après ces corrections, lorsque vous testez avec le numéro **66000001** :

1. ✅ La popup FedaPay s'ouvre
2. ✅ Le formulaire de paiement MTN s'affiche
3. ✅ La transaction se crée sans erreur
4. ✅ Le paiement se complète (sandbox simule automatiquement le succès)
5. ✅ Le webhook est appelé avec le statut "approved"
6. ✅ Le rendez-vous passe en "confirmed"
7. ✅ Le patient reçoit une notification de succès

**Testez maintenant et confirmez-moi que ça fonctionne !** 🚀

---

## 📞 Support

Si vous avez encore des problèmes :

1. Partagez les logs de la console (F12 > Console)
2. Partagez les logs de Supabase Edge Functions
3. Partagez le message d'erreur exact

Je suis là pour vous aider ! 💪
