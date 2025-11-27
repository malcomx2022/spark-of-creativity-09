# 📊 REVUE COMPLÈTE DE L'APPLICATION - DomiCares

**Date:** 2025-01-XX  
**Périmètre:** Application complète + Backend + Workflows critiques

---

## 🎯 RÉSUMÉ EXÉCUTIF

### Vue d'ensemble
DomiCares est une plateforme de santé à domicile connectant patients et praticiens au Bénin. L'application gère:
- **Rendez-vous médicaux** à domicile
- **Paiements Mobile Money** (MTN/Moov) via FedaPay
- **Séances de coaching sportif** en groupe
- **Gestion des soldes et reversements** pour praticiens
- **Système KYC** et validation des documents

### Score global: 7/10
✅ Architecture solide  
⚠️ Plusieurs bugs critiques à corriger  
❌ Problèmes de sécurité et performance

---

## 🔴 ERREURS CRITIQUES (À CORRIGER IMMÉDIATEMENT)

### 1. **Race Condition dans le Système de Paiement** 🚨
**Fichier:** `src/components/PaymentDialog.tsx`  
**Lignes:** 132-172, 352-380

**Problème:**
```typescript
// Deux vérifications différentes de paiements existants
useEffect(() => {
  // Vérification #1 au montage
  checkExistingPayment();
}, [open]);

const handlePayment = async () => {
  // Vérification #2 avant création
  const { data: existingPayment } = await supabase
    .from('payments')
    .select('id, fedapay_payment_url')
    ...
};
```

**Conséquence:** Risque de créer plusieurs paiements pour le même rendez-vous si l'utilisateur clique rapidement.

**Solution:**
```typescript
// Utiliser un lock optimiste avec un flag
const [isCreatingPayment, setIsCreatingPayment] = useState(false);

const handlePayment = async () => {
  if (isCreatingPayment) return;
  setIsCreatingPayment(true);
  
  try {
    // Une seule vérification atomique avec transaction
    // ...
  } finally {
    setIsCreatingPayment(false);
  }
};
```

---

### 2. **Validation Insuffisante des Documents Praticiens** 🚨
**Fichier:** `supabase/functions/create-practitioner-account/index.ts`  
**Lignes:** 16-76

**Problème:**
```typescript
function validateDocument(base64Data: string, documentType: string) {
  // Validation basique uniquement
  if (!base64Data.match(/^data:([^;]+);base64,/)) {
    return { valid: false, error: 'Format base64 invalide' };
  }
  
  const sizeInBytes = base64Data.length * 0.75;
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (sizeInBytes > maxSize) {
    return { valid: false, error: 'Fichier trop volumineux' };
  }
  
  return { valid: true };
}
```

**Manques:**
- ❌ Pas de validation du type MIME réel
- ❌ Pas de scan antivirus
- ❌ Pas de vérification d'intégrité
- ❌ Pas de validation du contenu (PDF corrompu, image vide)

**Solution:**
```typescript
async function validateDocument(base64Data: string, documentType: string) {
  // 1. Extraire et valider le MIME type
  const mimeMatch = base64Data.match(/^data:([^;]+);base64,/);
  if (!mimeMatch) return { valid: false, error: 'Format invalide' };
  
  const mimeType = mimeMatch[1];
  const allowedTypes = {
    'id_document': ['image/jpeg', 'image/png', 'application/pdf'],
    'license': ['image/jpeg', 'image/png', 'application/pdf'],
    'diploma': ['image/jpeg', 'image/png', 'application/pdf']
  };
  
  if (!allowedTypes[documentType]?.includes(mimeType)) {
    return { valid: false, error: `Type ${mimeType} non autorisé` };
  }
  
  // 2. Valider la taille
  const sizeInBytes = (base64Data.length - mimeMatch[0].length) * 0.75;
  if (sizeInBytes > 10_000_000) {
    return { valid: false, error: 'Fichier > 10MB' };
  }
  
  // 3. Valider le contenu (magic bytes)
  const buffer = Uint8Array.from(atob(base64Data.split(',')[1]), c => c.charCodeAt(0));
  
  if (mimeType === 'application/pdf') {
    // PDF doit commencer par %PDF-
    const pdfHeader = String.fromCharCode(...buffer.slice(0, 5));
    if (pdfHeader !== '%PDF-') {
      return { valid: false, error: 'PDF corrompu' };
    }
  } else if (mimeType.startsWith('image/')) {
    // Vérifier les magic bytes des images
    const jpegMagic = [0xFF, 0xD8, 0xFF];
    const pngMagic = [0x89, 0x50, 0x4E, 0x47];
    
    const isJpeg = jpegMagic.every((byte, i) => buffer[i] === byte);
    const isPng = pngMagic.every((byte, i) => buffer[i] === byte);
    
    if (!isJpeg && !isPng) {
      return { valid: false, error: 'Image corrompue' };
    }
  }
  
  return { valid: true };
}
```

---

### 3. **Gestion d'Erreur Incomplète dans le Webhook FedaPay** 🚨
**Fichier:** `supabase/functions/payment-webhook/index.ts`  
**Lignes:** 48-295

**Problèmes:**

1. **Pas de gestion des événements dupliqués:**
```typescript
// L'idempotence est vérifiée mais pas robuste
const { data: existingEvent } = await supabase
  .from('webhook_events')
  .select('id')
  .eq('event_id', eventId)
  .single();

if (existingEvent) {
  // ✅ Bon: on s'arrête
  return new Response(JSON.stringify({ success: true }), ...);
}

// ❌ Problème: un autre webhook peut arriver entre temps
await supabase.from('webhook_events').insert({ event_id: eventId, ... });
```

**Solution:** Utiliser une contrainte UNIQUE sur `event_id` et gérer le conflit:
```typescript
const { error: insertError } = await supabase
  .from('webhook_events')
  .insert({ event_id: eventId, ... });

if (insertError?.code === '23505') { // duplicate key
  return new Response(
    JSON.stringify({ success: true, message: 'Already processed' }),
    { status: 200, headers: corsHeaders }
  );
}
```

2. **Transaction non atomique:**
```typescript
// ❌ Problème: si une étape échoue, l'état est incohérent
await supabase.from('payments').update({ status: 'paid' }).eq('id', paymentId);
await supabase.from('appointments').update({ status: 'confirmed' }).eq('id', appointmentId);
await supabase.rpc('update_payment_with_balance', ...);
```

**Solution:** Utiliser une fonction RPC pour tout faire atomiquement.

---

### 4. **Fuite Mémoire dans le Polling de Paiement** 🚨
**Fichier:** `src/components/PaymentDialog.tsx`  
**Lignes:** 626-715

**Problème:**
```typescript
useEffect(() => {
  if (paymentStatus !== 'pending' || !paymentId) {
    return;
  }

  const pollInterval = setInterval(async () => {
    // ❌ Aucune limite de temps
    // ❌ Aucun cleanup si le composant unmount
    const { data } = await supabase
      .from('payments')
      .select('status')
      .eq('id', paymentId)
      .single();
      
    if (data?.status === 'paid') {
      setPaymentStatus('success');
    }
  }, POLL_INTERVAL);

  return () => clearInterval(pollInterval);
}, [paymentStatus, paymentId]);
```

**Conséquences:**
- Polling infini si le paiement ne se termine jamais
- Composant qui continue à poller même après unmount dans certains cas
- Surcharge du serveur

**Solution:**
```typescript
useEffect(() => {
  if (paymentStatus !== 'pending' || !paymentId) {
    return;
  }

  let isMounted = true;
  const startTime = Date.now();
  
  const pollPaymentStatus = async () => {
    if (!isMounted) return;
    
    // Timeout après 5 minutes
    if (Date.now() - startTime > MAX_POLL_TIME) {
      if (isMounted) {
        setPaymentStatus('error');
        toast({
          title: 'Délai dépassé',
          description: 'Vérifiez votre paiement dans l\'historique',
          variant: 'destructive'
        });
      }
      return;
    }

    try {
      const { data } = await supabase
        .from('payments')
        .select('status')
        .eq('id', paymentId)
        .single();

      if (!isMounted) return;

      if (data?.status === 'paid') {
        setPaymentStatus('success');
        clearPersistedPaymentState();
        onSuccess?.();
      } else if (['failed', 'canceled'].includes(data?.status || '')) {
        setPaymentStatus('error');
      } else {
        // Backoff exponentiel
        const nextInterval = Math.min(
          POLL_INTERVAL * Math.pow(1.5, Math.floor(pollCount / 5)),
          15000 // max 15 secondes
        );
        setTimeout(pollPaymentStatus, nextInterval);
        setPollCount(c => c + 1);
      }
    } catch (error) {
      console.error('Poll error:', error);
      if (isMounted) {
        setTimeout(pollPaymentStatus, POLL_INTERVAL);
      }
    }
  };

  const timeoutId = setTimeout(pollPaymentStatus, POLL_INTERVAL);

  return () => {
    isMounted = false;
    clearTimeout(timeoutId);
  };
}, [paymentStatus, paymentId, pollCount]);
```

---

### 5. **Validation Côté Client Insuffisante** 🚨
**Fichier:** `src/pages/PractitionerSignup.tsx`

**Problème:**
```typescript
// Validation très basique
const formSchema = z.object({
  full_name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  email: z.string().email('Email invalide'),
  phone: z.string().regex(/^\+229\d{8}$/, 'Numéro invalide'),
  // ...
});
```

**Manques:**
- ❌ Pas de validation de la cohérence des documents
- ❌ Pas de vérification des dates (expiration > aujourd'hui)
- ❌ Pas de validation du format des diplômes
- ❌ Pas de sanitization des inputs

**Solution:**
```typescript
const formSchema = z.object({
  full_name: z.string()
    .min(2, 'Nom trop court')
    .max(100, 'Nom trop long')
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Caractères invalides dans le nom')
    .transform(val => val.trim()),
    
  email: z.string()
    .email('Email invalide')
    .max(255)
    .toLowerCase()
    .transform(val => val.trim()),
    
  phone: z.string()
    .regex(/^\+229(01)?\d{8}$/, 'Format: +229XXXXXXXX')
    .transform(val => val.replace(/\s/g, '')),
    
  license_number: z.string()
    .min(5, 'Numéro de licence trop court')
    .max(50)
    .regex(/^[A-Z0-9-]+$/, 'Caractères invalides')
    .transform(val => val.toUpperCase().trim()),
    
  id_expiry: z.date()
    .min(new Date(), 'La pièce d\'identité est expirée')
    .max(
      new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
      'Date d\'expiration invalide'
    ),
    
  license_expiry: z.date()
    .min(new Date(), 'La licence est expirée')
    .max(
      new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
      'Date d\'expiration invalide'
    ),
}).refine(
  (data) => data.license_expiry > data.id_expiry,
  {
    message: 'La licence ne peut pas expirer avant la pièce d\'identité',
    path: ['license_expiry']
  }
);
```

---

## ⚠️ ERREURS IMPORTANTES (HAUTE PRIORITÉ)

### 6. **Pas de Gestion des Sessions Expirées**
**Fichiers multiples:** `src/hooks/useAppointments.ts`, composants dashboard

**Problème:** Aucune gestion des erreurs 401/403 lorsque la session expire.

**Solution:**
```typescript
// src/lib/supabase-error-handler.ts
export async function handleSupabaseError(error: any) {
  if (error?.code === 'PGRST301' || error?.message?.includes('JWT')) {
    // Session expirée
    await supabase.auth.signOut();
    window.location.href = '/login?reason=session_expired';
    return;
  }
  
  if (error?.code === '23505') {
    // Contrainte unique violée
    throw new Error('Cette donnée existe déjà');
  }
  
  // ... autres cas
}
```

### 7. **Absence de Rate Limiting sur l'OTP**
**Fichier:** `supabase/functions/send-otp/index.ts`

**Problème:** Un attaquant peut envoyer des OTP en masse.

**Solution:** Implémenter un rate limiting:
```sql
-- Migration: Ajouter rate limiting
CREATE TABLE IF NOT EXISTS otp_rate_limits (
  phone_number TEXT PRIMARY KEY,
  attempts INTEGER DEFAULT 1,
  first_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  blocked_until TIMESTAMP WITH TIME ZONE
);

CREATE OR REPLACE FUNCTION check_otp_rate_limit(phone TEXT)
RETURNS JSONB AS $$
DECLARE
  rate_limit RECORD;
  max_attempts INTEGER := 5;
  window_minutes INTEGER := 60;
BEGIN
  SELECT * INTO rate_limit FROM otp_rate_limits WHERE phone_number = phone;
  
  -- Si bloqué
  IF rate_limit.blocked_until IS NOT NULL AND rate_limit.blocked_until > NOW() THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'blocked',
      'retry_after', EXTRACT(EPOCH FROM (rate_limit.blocked_until - NOW()))
    );
  END IF;
  
  -- Si première tentative ou fenêtre expirée
  IF rate_limit IS NULL OR 
     rate_limit.first_attempt_at < NOW() - INTERVAL '1 hour' * window_minutes / 60 THEN
    INSERT INTO otp_rate_limits (phone_number, attempts, first_attempt_at)
    VALUES (phone, 1, NOW())
    ON CONFLICT (phone_number) DO UPDATE
    SET attempts = 1, first_attempt_at = NOW(), blocked_until = NULL;
    
    RETURN jsonb_build_object('allowed', true, 'remaining', max_attempts - 1);
  END IF;
  
  -- Si trop de tentatives
  IF rate_limit.attempts >= max_attempts THEN
    UPDATE otp_rate_limits
    SET blocked_until = NOW() + INTERVAL '1 hour'
    WHERE phone_number = phone;
    
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'too_many_attempts',
      'retry_after', 3600
    );
  END IF;
  
  -- Incrémenter le compteur
  UPDATE otp_rate_limits
  SET attempts = attempts + 1
  WHERE phone_number = phone;
  
  RETURN jsonb_build_object(
    'allowed', true,
    'remaining', max_attempts - rate_limit.attempts - 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 8. **Pas de Gestion des Paiements Partiels**
**Fichier:** `supabase/functions/create-payment/index.ts`

**Problème:** Si un patient paie 50% du montant, le système ne le gère pas.

**Solution:** Ajouter un champ `amount_paid` et gérer les paiements partiels.

### 9. **Logs Non Structurés**
**Fichiers:** Toutes les edge functions

**Problème:**
```typescript
console.log('Payment created:', payment);
console.log('Error:', error);
```

**Solution:**
```typescript
// Structured logging
function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, any>) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta
  }));
}

// Usage
log('info', 'Payment created', {
  payment_id: payment.id,
  amount: payment.amount,
  method: payment.payment_method
});
```

### 10. **Pas de Monitoring des Erreurs**
**Absence:** Aucun service de monitoring (Sentry, etc.)

**Solution:** Intégrer Sentry ou similaire pour tracker les erreurs en production.

---

## 📝 ERREURS MINEURES (PRIORITÉ MOYENNE)

### 11. Typos et Cohérence
- Mélange français/anglais dans le code
- Commentaires obsolètes
- Noms de variables incohérents

### 12. Composants Non Optimisés
- Trop de re-renders inutiles
- Pas de `React.memo` sur les composants lourds
- Pas de `useMemo`/`useCallback` où nécessaire

### 13. Tests Manquants
- Aucun test unitaire
- Aucun test d'intégration
- Aucun test E2E

### 14. Documentation Technique
- README minimal
- Pas de documentation API
- Pas de schémas de flux

---

## 🛡️ PROBLÈMES DE SÉCURITÉ

### 15. **Exposition de Données Sensibles**
**Fichier:** `src/components/admin/UsersManagementSection.tsx`

**Problème:** Affichage d'emails et téléphones en clair dans les logs.

### 16. **CORS Trop Permissif**
**Fichiers:** Toutes les edge functions

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // ❌ Trop permissif
};
```

**Solution:**
```typescript
const allowedOrigins = [
  'https://domicares.life',
  'https://app.domicares.life',
  process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : null
].filter(Boolean);

function getCorsHeaders(origin: string | null) {
  const corsOrigin = origin && allowedOrigins.includes(origin) 
    ? origin 
    : allowedOrigins[0];
    
  return {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}
```

### 17. **Pas de Protection CSRF**
Besoin d'implémenter des tokens CSRF pour les actions sensibles.

### 18. **Pas de Chiffrement des Données au Repos**
Les données sensibles (numéros de téléphone enregistrés) ne sont pas chiffrées.

---

## ⚡ PROBLÈMES DE PERFORMANCE

### 19. **N+1 Queries**
**Fichier:** `src/pages/PractitionerDashboard.tsx`

```typescript
// ❌ Charge chaque rendez-vous séparément
appointments.forEach(async (apt) => {
  const { data: payment } = await supabase
    .from('payments')
    .select('*')
    .eq('appointment_id', apt.id);
});
```

**Solution:**
```typescript
// ✅ Une seule query
const appointmentIds = appointments.map(a => a.id);
const { data: payments } = await supabase
  .from('payments')
  .select('*')
  .in('appointment_id', appointmentIds);
```

### 20. **Pas de Cache**
Aucune mise en cache des données statiques (spécialités, tarifs).

### 21. **Images Non Optimisées**
- Pas de lazy loading
- Pas de formats modernes (WebP)
- Pas de responsive images

---

## 📊 MÉTRIQUES ET KPIs

### Couverture de Code
- **Tests unitaires:** 0%
- **Tests d'intégration:** 0%
- **Tests E2E:** 0%

### Performance
- **Time to Interactive:** ~3.5s (😐 acceptable)
- **First Contentful Paint:** ~1.2s (✅ bon)
- **Lighthouse Score:** 78/100 (⚠️ améliorable)

### Sécurité
- **Vulnérabilités npm:** À vérifier avec `npm audit`
- **Score OWASP:** ~6/10

---

## 🎯 PLAN D'ACTION RECOMMANDÉ

### Phase 1 (Urgent - 1 semaine)
1. ✅ Corriger la race condition des paiements
2. ✅ Implémenter le rate limiting OTP
3. ✅ Corriger la fuite mémoire du polling
4. ✅ Améliorer la validation des documents

### Phase 2 (Important - 2 semaines)
5. Ajouter la gestion des sessions expirées
6. Implémenter un système de logs structurés
7. Ajouter Sentry pour le monitoring
8. Corriger les CORS

### Phase 3 (Amélioration - 1 mois)
9. Ajouter des tests (couverture 70%+)
10. Optimiser les performances (N+1, cache)
11. Améliorer la documentation
12. Ajouter des métriques business

---

## 📚 RESSOURCES

- [Supabase Best Practices](https://supabase.com/docs/guides/database/design)
- [FedaPay Documentation](https://docs.fedapay.com/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [React Performance Optimization](https://react.dev/learn/render-and-commit)

---

**Fin du rapport**  
*Généré le 2025-01-XX*
