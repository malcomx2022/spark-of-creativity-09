# Audit de l'Implémentation FedaPay

## Date: 2025-11-25

---

## 🎯 Objectif

Vérifier que notre implémentation respecte les standards et la documentation officielle FedaPay pour:
1. L'initialisation du widget Checkout
2. La création de transactions via l'API REST
3. La gestion des webhooks et leur sécurité
4. Le flux de paiement complet

---

## ✅ Points Conformes à la Documentation FedaPay

### 1. Widget Checkout JavaScript ✅

**Fichier:** `src/components/PaymentDialog.tsx` (lignes 569-644)

```typescript
const widget = initFedaPayWidget({
  public_key: fedapayConfig.publicKey,
  environment: fedapayConfig.environment as 'sandbox' | 'live',
  transaction: {
    id: txId,
    amount: amount,
    description: `Paiement rendez-vous médical #${appointmentId}`,
  },
  customer: {
    phone_number: {
      number: sanitizedPhoneNumber,
      country: 'BJ',
    },
  },
  currency: {
    iso: 'XOF',
  },
  locale: 'fr',
  onComplete: async (payload) => { /* ... */ }
});

widget.open();
```

**✅ Conforme:** Structure correcte selon la documentation FedaPay Checkout.js
- Public key chargée dynamiquement via edge function sécurisée
- Environment correctement configuré (sandbox/live)
- Transaction ID passé à l'initialisation
- Customer data avec phone_number structuré
- Currency ISO code (XOF)
- Callbacks onComplete gérés

### 2. API REST - Création de Transaction ✅

**Fichier:** `supabase/functions/create-payment/index.ts` (lignes 325-355)

```typescript
await fetch(`${fedapayBaseUrl}/v1/transactions`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${fedapaySecretKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    description: `Paiement rendez-vous médical #${appointmentId}`,
    amount: amountToCharge,
    currency: {
      iso: 'XOF'
    },
    callback_url: `${supabaseUrl}/functions/v1/payment-webhook`,
    customer: {
      firstname,
      lastname,
      email: customerEmail,
      phone_number: {
        number: phoneNumber,
        country: 'BJ'
      }
    },
    custom_metadata: {
      appointment_id: appointmentId,
      user_id: paymentUserId,
      payment_method: paymentMethod
    }
  })
})
```

**✅ Conforme:** Tous les champs requis sont présents
- Authorization header avec Bearer token
- Description de la transaction
- Montant et devise structurés correctement
- callback_url pour les webhooks
- Customer data avec firstname, lastname, email, phone_number
- custom_metadata pour le tracking interne

### 3. Génération du Token de Paiement ✅

**Fichier:** `supabase/functions/create-payment/index.ts` (lignes 386-395)

```typescript
await fetch(`${fedapayBaseUrl}/v1/transactions/${transaction.id}/token`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${fedapaySecretKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    mode: selectedMode  // 'mtn_benin' ou 'moov_benin'
  })
})
```

**✅ Conforme:** Appel correct au endpoint de génération de token
- Utilise l'ID de transaction retourné
- Spécifie le mode de paiement (mobile money provider)

### 4. Webhook - Vérification de Signature HMAC ✅

**Fichier:** `supabase/functions/payment-webhook/index.ts` (lignes 14-44)

```typescript
async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload)
  );
  
  const expectedSignature = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return expectedSignature === signature;
}
```

**✅ Conforme:** Utilise HMAC-SHA256 pour la vérification
- Algorithme correct (SHA-256)
- Comparaison de signature hex

### 5. Mapping des Statuts FedaPay ✅

**Fichier:** `supabase/functions/payment-webhook/index.ts` (lignes 58-66)

```typescript
const statusMap: Record<string, string> = {
  'pending': 'pending',
  'approved': 'paid',
  'declined': 'failed',
  'canceled': 'canceled',
  'refunded': 'refunded',
};
```

**✅ Conforme:** Tous les statuts FedaPay sont gérés

---

## ⚠️ Points à Améliorer

### 1. 🔴 CRITIQUE: Absence de `timingSafeEqual` pour Comparaison Signature

**Fichier:** `supabase/functions/payment-webhook/index.ts` (ligne 39)

**Problème:**
```typescript
return expectedSignature === signature;  // ❌ Vulnérable aux timing attacks
```

**Solution Recommandée:**
```typescript
// Utiliser une comparaison sécurisée
const expectedBuffer = Buffer.from(expectedSignature, 'hex');
const actualBuffer = Buffer.from(signature, 'hex');

if (expectedBuffer.length !== actualBuffer.length) {
  return false;
}

// Utiliser timingSafeEqual pour éviter les timing attacks
return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
```

**Impact:** Sécurité (timing attacks possibles)
**Priorité:** HAUTE

### 2. 🟡 IMPORTANT: Absence de Timeout sur les Appels API FedaPay

**Fichier:** `supabase/functions/create-payment/index.ts` (lignes 325, 386)

**Problème:**
```typescript
const createTransactionResponse = await fetch(...)  // ❌ Pas de timeout
const generateTokenResponse = await fetch(...)      // ❌ Pas de timeout
```

**Solution Recommandée:**
```typescript
// Créer un wrapper avec timeout
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('FedaPay API request timeout');
    }
    throw error;
  }
}

// Utiliser dans les appels
const createTransactionResponse = await fetchWithTimeout(
  `${fedapayBaseUrl}/v1/transactions`,
  { method: 'POST', headers, body },
  30000  // 30 secondes
);
```

**Impact:** Blocage indéfini si FedaPay ne répond pas
**Priorité:** HAUTE

### 3. 🟡 ATTENTION: Validation du Timestamp Webhook

**Fichier:** `supabase/functions/payment-webhook/index.ts` (lignes 443-457)

**Code Actuel:**
```typescript
const timestamp = webhookData.created_at;
if (timestamp) {
  const eventTime = new Date(timestamp * 1000);  // ✅ Bon
  const now = new Date();
  const diffMinutes = (now.getTime() - eventTime.getTime()) / (1000 * 60);
  
  if (diffMinutes > 5) {  // ✅ Bon: rejet si > 5 minutes
    return new Response(
      JSON.stringify({ error: 'Timestamp too old' }),
      { status: 400, headers: corsHeaders }
    );
  }
}
```

**✅ Conforme MAIS:** Devrait aussi rejeter les événements "du futur"

**Amélioration Recommandée:**
```typescript
if (timestamp) {
  const eventTime = new Date(timestamp * 1000);
  const now = new Date();
  const diffMinutes = (now.getTime() - eventTime.getTime()) / (1000 * 60);
  
  // Rejeter si trop vieux OU dans le futur
  if (Math.abs(diffMinutes) > 5) {
    console.error('Webhook timestamp invalid:', {
      eventTime: eventTime.toISOString(),
      now: now.toISOString(),
      diffMinutes
    });
    return new Response(
      JSON.stringify({ error: 'Invalid timestamp' }),
      { status: 400, headers: corsHeaders }
    );
  }
}
```

**Impact:** Protection additionnelle contre replay attacks
**Priorité:** MOYENNE

### 4. 🟢 AMÉLIORATION: Logs de Debug en Production

**Fichiers:** Multiples edge functions

**Problème:**
```typescript
console.log('FedaPay transaction created successfully:', fedapayData);  // ⚠️ Peut exposer des données sensibles
console.log('Payment URL extracted:', paymentUrl);
```

**Solution Recommandée:**
```typescript
// Utiliser des logs conditionnels
const isProduction = Deno.env.get('FEDAPAY_MODE') === 'live';

if (!isProduction) {
  console.log('FedaPay transaction created:', {
    id: fedapayData.id,
    status: fedapayData.status
  });
}
// En production, logger uniquement les IDs et statuts, pas les URLs complètes
console.log('Transaction created:', fedapayData.id);
```

**Impact:** Sécurité et conformité RGPD
**Priorité:** MOYENNE

### 5. 🟢 OPTIMISATION: Vérification d'Idempotence Webhook

**Fichier:** `supabase/functions/payment-webhook/index.ts` (lignes 462-496)

**Code Actuel:**
```typescript
// Vérification de l'idempotence
if (eventId) {
  const { data: existingEvent } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('event_id', eventId)
    .single();
  
  if (existingEvent) {
    return new Response(
      JSON.stringify({ success: true, message: 'Event already processed' }),
      { status: 200, headers: corsHeaders }
    );
  }
  
  const { error: insertError } = await supabase
    .from('webhook_events')
    .insert({ event_id: eventId, ... });
}
```

**✅ Bonne Logique MAIS:** Race condition possible entre SELECT et INSERT

**Amélioration avec UPSERT:**
```typescript
// Utiliser ON CONFLICT pour l'atomicité
const { data: webhookEvent, error: upsertError } = await supabase
  .from('webhook_events')
  .upsert({
    event_id: eventId,
    event_type: webhookData.type || 'transaction.update',
    payload: webhookData,
    processed_at: new Date().toISOString()
  }, {
    onConflict: 'event_id',
    ignoreDuplicates: true
  })
  .select()
  .single();

if (upsertError?.code === '23505') {
  // Event déjà traité
  return new Response(
    JSON.stringify({ success: true, message: 'Event already processed' }),
    { status: 200, headers: corsHeaders }
  );
}
```

**Impact:** Prévention de doublons en cas de webhooks concurrents
**Priorité:** MOYENNE

---

## 📋 Résumé des Priorités

### 🔴 PRIORITÉ HAUTE (À corriger avant production)

1. **Sécurité Webhook:** Utiliser `timingSafeEqual` pour la comparaison de signature HMAC
2. **Timeouts API:** Ajouter des timeouts sur tous les appels FedaPay (30 secondes recommandé)

### 🟡 PRIORITÉ MOYENNE (Recommandé)

3. **Validation Timestamp:** Rejeter aussi les événements "du futur"
4. **Idempotence Atomique:** Utiliser UPSERT au lieu de SELECT + INSERT
5. **Logs Production:** Réduire/masquer les données sensibles en logs production

### 🟢 PRIORITÉ BASSE (Nice to have)

6. **Monitoring:** Ajouter des métriques sur les temps de réponse FedaPay
7. **Retry Logic:** Implémenter des retries automatiques avec backoff exponentiel pour les appels API FedaPay

---

## ✅ Conformité Globale

### Score: **85/100**

**Points positifs:**
- ✅ Structure de l'API REST conforme à la documentation FedaPay
- ✅ Widget Checkout correctement initialisé
- ✅ Tous les champs requis présents dans les appels API
- ✅ Gestion correcte des callbacks et événements
- ✅ Mapping des statuts complet
- ✅ Vérification HMAC-SHA256 implémentée
- ✅ Validation de timestamp webhook
- ✅ Gestion d'idempotence présente
- ✅ practitioner_id récupéré AVANT création FedaPay (corrigé)
- ✅ Widget FedaPay utilisé au lieu d'une simple URL (corrigé)
- ✅ Double appel à apply-ledger-entries supprimé (corrigé)

**Points d'amélioration:**
- ⚠️ Absence de `timingSafeEqual` (vulnérabilité timing attacks)
- ⚠️ Absence de timeouts sur appels API (risque blocage)
- 💡 Logs de debug à optimiser pour production
- 💡 Race condition possible sur idempotence webhook

---

## 🎯 Recommandations Finales

### Avant Mise en Production:

1. **OBLIGATOIRE:** Implémenter `timingSafeEqual` pour webhook signature
2. **OBLIGATOIRE:** Ajouter timeouts (30s) sur tous les appels FedaPay
3. **RECOMMANDÉ:** Valider timestamp webhook (pas dans le futur)
4. **RECOMMANDÉ:** Utiliser UPSERT pour idempotence atomique
5. **RECOMMANDÉ:** Masquer données sensibles en logs production

### Tests à Effectuer:

1. **Test de Paiement Complet:**
   - Créer un paiement via l'interface
   - Vérifier que le widget s'ouvre correctement
   - Compléter le paiement avec MTN ou Moov
   - Vérifier la réception du webhook
   - Vérifier la mise à jour du statut paiement et appointment

2. **Test de Sécurité Webhook:**
   - Simuler un webhook avec signature invalide (doit être rejeté)
   - Simuler un webhook avec timestamp trop ancien (doit être rejeté)
   - Simuler un webhook dupliqué (doit retourner 200 mais pas retraiter)

3. **Test de Timeout:**
   - Simuler un délai FedaPay (mock API lent)
   - Vérifier que le timeout s'active et retourne une erreur appropriée

4. **Test de Performance:**
   - Créer plusieurs paiements simultanés
   - Vérifier qu'il n'y a pas de doublons
   - Vérifier que les balances praticiens sont correctes

---

## 📚 Références

- [FedaPay Checkout.js Documentation](https://docs-v1.fedapay.com/payments/checkout)
- [FedaPay API Transactions](https://docs.fedapay.com/api-reference/transactions/create)
- [FedaPay Webhook Security](https://docs-v1.fedapay.com/development/webhooks)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

---

## 🔄 Historique des Corrections

### 2025-11-25
- ✅ Correction #1: PaymentDialog utilise maintenant le widget FedaPay
- ✅ Correction #3: practitioner_id récupéré AVANT création FedaPay
- ✅ Correction #5: Double appel à apply-ledger-entries supprimé
- 📝 Audit complet de l'implémentation FedaPay

---

**Conclusion:** L'implémentation FedaPay est globalement **conforme** à la documentation officielle. Les 3 problèmes critiques identifiés lors de la revue précédente ont été corrigés. Il reste 2 améliorations de sécurité HAUTE PRIORITÉ à implémenter avant la mise en production (timingSafeEqual et timeouts API).
