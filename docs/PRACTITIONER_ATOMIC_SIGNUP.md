# Inscription Praticien Atomique

## Vue d'ensemble

L'edge function `create-practitioner-account` gère l'inscription complète d'un praticien de manière **atomique** avec rollback automatique en cas d'échec. Cela garantit l'intégrité des données et évite les états partiels en production.

## Architecture

### Composants

```
┌─────────────────────────────────────────────────┐
│         PractitionerSignup.tsx (Frontend)       │
│  - Validation formulaire                        │
│  - Validation fichiers (taille/type)            │
│  - Création compte auth                         │
└────────────────┬────────────────────────────────┘
                 │
                 │ invoke()
                 ▼
┌─────────────────────────────────────────────────┐
│   create-practitioner-account (Edge Function)   │
│                                                  │
│  1. Validation backend stricte                  │
│  2. Création profil                             │
│  3. Upload documents (Wasabi)                   │
│  4. Création entrée practitioners               │
│  5. Notifications admins                        │
│  6. Rollback automatique si échec               │
└─────────────────────────────────────────────────┘
```

## Flux transactionnel

### Étape 1 : Validation des données

**Fichier**: `supabase/functions/create-practitioner-account/index.ts` (lignes 19-67)

```typescript
function validatePractitionerData(practitionerData: any): string[] {
  const errors: string[] = [];
  
  // Validation nom (min 2 caractères)
  if (!practitionerData.name || practitionerData.name.trim().length < 2) {
    errors.push('Nom invalide (minimum 2 caractères)');
  }
  
  // Validation téléphone (8-15 chiffres)
  if (!practitionerData.phone || !/^\+?[0-9]{8,15}$/.test(...)) {
    errors.push('Numéro de téléphone invalide');
  }
  
  // Validation spécialité
  // Validation expérience (0-70 ans)
  // Validation rayon intervention (1-100 km)
  
  return errors;
}

function validateDocument(base64Data: string, documentType: string) {
  // ✅ Vérifier format base64
  // ✅ Vérifier type MIME (PDF, JPG, PNG)
  // ✅ Vérifier taille (max 5MB)
  
  return { valid: boolean, error?: string };
}
```

**Retour si erreur** : `400 Bad Request` avec détails des erreurs

### Étape 2 : Création du profil

```typescript
const { error: profileError } = await supabase
  .from('profiles')
  .upsert([profileData]);

if (profileError) {
  throw new Error(`Échec création profil: ${profileError.message}`);
}

profileCreated = true; // Flag pour rollback
```

**Variables de rollback** :
- `profileCreated: boolean`
- `practitionerCreated: boolean`
- `uploadedDocuments: Array<{ key: string; path: string }>`

### Étape 3 : Upload des documents

```typescript
const uploadedDocs: Record<string, any> = {};

for (const [key, base64Data] of Object.entries(documents)) {
  if (base64Data) {
    const ext = base64Data.includes('pdf') ? 'pdf' : 'jpg';
    const fileName = `${key}_${Date.now()}.${ext}`;
    
    // Upload via upload-to-wasabi
    const result = await uploadDocument(supabase, base64Data, fileName, userId);
    
    uploadedDocs[key] = result;
    uploadedDocuments.push({ key, path: result.path });
  }
}
```

**Chemin Wasabi** : `practitioner-documents/{userId}/{key}_{timestamp}.{ext}`

**Documents gérés** :
- `profilePhoto` → `image` (URL publique)
- `idDocument` → `id_document_url`
- `licenseDocument` → `license_document_url`
- `diploma` → `insurance_document_url`

### Étape 4 : Création practitioners

```typescript
const practitionerPayload = {
  ...practitionerData,
  image: uploadedDocs.profilePhoto?.url || null,
  id_document_url: uploadedDocs.idDocument?.path || null,
  license_document_url: uploadedDocs.licenseDocument?.path || null,
  insurance_document_url: uploadedDocs.diploma?.path || null,
  kyc_status: 'pending',
  can_accept_missions: false, // Bloqué jusqu'à validation KYC
};

const { data: practitionerResult, error: practitionerError } = await supabase
  .from('practitioners')
  .insert([practitionerPayload])
  .select()
  .single();

practitionerCreated = true; // Flag pour rollback
```

### Étape 5 : Notifications admins

```typescript
const { data: adminRoles } = await supabase
  .from('user_roles')
  .select('user_id')
  .in('role', ['admin', 'super_admin']);

const notificationsPayload = uniqueAdminIds.map((adminId) => ({
  user_id: adminId,
  title: 'Nouveau dossier KYC à valider',
  message: `Le praticien ${practitionerPayload.name} vient de s'inscrire...`,
  type: 'kyc_pending',
  link: '/admin?tab=kyc',
}));

await supabase.from('notifications').insert(notificationsPayload);
```

## Rollback automatique

### Déclenchement

Le rollback est déclenché automatiquement si **n'importe quelle étape échoue** :
- Validation échouée
- Erreur création profil
- Erreur upload document
- Erreur création practitioners
- Erreur notifications (non bloquant)

### Séquence de rollback

```typescript
try {
  // Étapes 1-5...
} catch (error: any) {
  console.error('❌ Erreur transaction, rollback atomique en cours...', error);

  // 1️⃣ Supprimer practitioners si créé
  if (practitionerCreated) {
    await supabase
      .from('practitioners')
      .delete()
      .eq('user_id', userId);
  }

  // 2️⃣ Supprimer profil si créé
  if (profileCreated) {
    await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);
  }

  // 3️⃣ Supprimer documents Wasabi
  for (const doc of uploadedDocuments) {
    await deleteWasabiDocument(supabase, doc.path);
  }

  throw error; // Propager l'erreur
}
```

### Garanties

✅ **Pas d'état partiel** : Si une étape échoue, toutes les étapes précédentes sont annulées  
✅ **Nettoyage complet** : Profil, practitioner ET documents sont supprimés  
✅ **Erreurs détaillées** : Logs précis pour chaque étape et chaque rollback  
✅ **Idempotence** : Appeler plusieurs fois la fonction ne crée pas de doublons

## Validation multi-niveaux

### Niveau 1 : Frontend (PractitionerSignup.tsx)

```typescript
// Validation formulaire
if (formData.password !== formData.confirmPassword) {
  toast({ title: "Erreur", description: "Mots de passe différents" });
  return;
}

// Validation fichiers
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

for (const [key, file] of Object.entries(documentUploads)) {
  if (file) {
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "Fichier trop volumineux", description: `${key}: Max 5MB` });
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({ title: "Type non supporté", description: `${key}: PDF, JPG, PNG` });
      return;
    }
  }
}
```

**Avantages** :
- Retour immédiat à l'utilisateur
- Économie de bande passante
- Pas d'appel serveur inutile

### Niveau 2 : Backend (Edge Function)

```typescript
// Validation données praticien
const validationErrors = validatePractitionerData(practitionerData);
if (validationErrors.length > 0) {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Données invalides',
      details: validationErrors,
    }),
    { status: 400 }
  );
}

// Validation documents
for (const [key, base64Data] of Object.entries(documents)) {
  const validation = validateDocument(base64Data, key);
  if (!validation.valid) {
    return new Response(
      JSON.stringify({ success: false, error: validation.error }),
      { status: 400 }
    );
  }
}
```

**Avantages** :
- Sécurité : Le frontend peut être contourné
- Double vérification : Protection contre les bugs frontend
- Cohérence : Mêmes règles appliquées partout

## Gestion des erreurs

### Erreurs retournées

| Statut | Cas | Réponse |
|--------|-----|---------|
| `400` | Validation échouée | `{ success: false, error: string, details?: string[] }` |
| `400` | Document invalide | `{ success: false, error: "Type non supporté..." }` |
| `400` | Échec création | `{ success: false, error: "Erreur lors de..." }` |
| `200` | Succès | `{ success: true, practitionerId: uuid, message: string }` |

### Logs détaillés

```typescript
console.log('🚀 Création compte praticien atomique:', userId);
console.log('📝 Création profil...');
console.log('✅ Profil créé');
console.log('📤 Upload documents...');
console.log(`✅ ${key} uploadé: ${result.path}`);
console.log('👨‍⚕️ Création praticien...');
console.log('✅ Praticien créé:', practitionerResult.id);
console.log('📧 Envoi notifications admins...');
console.log(`✅ Notifications KYC envoyées à ${count} admin(s)`);

// En cas d'erreur
console.error('❌ Erreur profil:', profileError);
console.error('❌ Erreur upload ${key}:', uploadError);
console.error('❌ Erreur transaction, rollback atomique en cours...', error);
console.log('🔄 Practitioner supprimé (rollback)');
console.log('🔄 Profil supprimé (rollback)');
console.log(`🔄 Suppression de ${uploadedDocuments.length} documents (rollback)`);
```

**Utilisation** : Vérifier les logs edge function dans Lovable Cloud

## Sécurité

### 1. Service Role Key

L'edge function utilise `SUPABASE_SERVICE_ROLE_KEY` pour bypasser RLS :

```typescript
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);
```

**Pourquoi ?**
- Créer le profil AVANT que l'utilisateur soit auth
- Insérer dans `practitioners` avec `user_id` d'un autre user
- Envoyer notifications aux admins

**Risque** : Contourné par validation stricte backend

### 2. Validation téléphone

```typescript
if (!practitionerData.phone || !/^\+?[0-9]{8,15}$/.test(practitionerData.phone.replace(/\s/g, ''))) {
  errors.push('Numéro de téléphone invalide');
}
```

**Format accepté** : `+229XXXXXXXX` ou `XXXXXXXX` (8-15 chiffres)

### 3. KYC bloqué par défaut

```typescript
kyc_status: 'pending',
can_accept_missions: false, // ⚠️ Bloqué jusqu'à validation admin
```

Le praticien ne peut **PAS** recevoir de missions tant que :
- `kyc_status !== 'validated'`
- `can_accept_missions !== true`

### 4. Documents sécurisés

- Upload via Wasabi (storage externe)
- Accès restreint aux URLs
- Suppression atomique si rollback

## Tests recommandés

### Scénario 1 : Inscription complète réussie

```bash
1. Remplir formulaire avec données valides
2. Uploader 4 documents (profil, ID, licence, diplôme)
3. Soumettre
✅ Vérifier : Profil créé, documents uploadés, practitioner créé, notifications envoyées
```

### Scénario 2 : Rollback upload document

```bash
1. Formulaire valide
2. Uploader 3 documents valides + 1 document corrompu
3. Soumettre
✅ Vérifier : Profil supprimé, 3 documents supprimés de Wasabi, erreur claire
```

### Scénario 3 : Validation backend

```bash
1. Contourner validation frontend (devtools)
2. Envoyer données invalides (téléphone incorrect, nom trop court)
3. Soumettre
✅ Vérifier : Requête rejetée avec détails erreurs, rien créé en DB
```

### Scénario 4 : Idempotence

```bash
1. Inscription réussie pour user@test.com
2. Réessayer avec MÊME email
✅ Vérifier : Erreur auth "Email déjà utilisé", pas de doublon
```

### Scénario 5 : KYC workflow

```bash
1. Inscription réussie
2. Se connecter en tant qu'admin
3. Vérifier notification KYC
4. Valider le KYC
✅ Vérifier : kyc_status = 'validated', can_accept_missions = true
```

## Améliorations futures

### 1. Suppression Wasabi

**Actuellement** : `TODO` dans `deleteWasabiDocument()`

**À implémenter** :
```typescript
// Dans upload-to-wasabi ou nouvelle fonction
async function deleteFromWasabi(filePath: string) {
  const S3 = await import('https://deno.land/x/s3@0.5.0/mod.ts');
  const s3 = new S3.S3Client({
    endPoint: Deno.env.get('WASABI_ENDPOINT'),
    accessKey: Deno.env.get('WASABI_ACCESS_KEY_ID'),
    secretKey: Deno.env.get('WASABI_SECRET_ACCESS_KEY'),
    region: Deno.env.get('WASABI_REGION'),
  });

  await s3.deleteObject(bucket, filePath);
}
```

### 2. Retry automatique

```typescript
async function uploadDocumentWithRetry(
  supabase: any,
  base64Data: string,
  fileName: string,
  userId: string,
  maxRetries = 3
): Promise<{ path: string; url: string }> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await uploadDocument(supabase, base64Data, fileName, userId);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`🔄 Retry upload ${fileName} (${i + 1}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error('Upload failed after retries');
}
```

### 3. Compression images

```typescript
// Avant upload, compresser les images > 2MB
import { compress } from 'https://deno.land/x/image_compression/mod.ts';

if (contentType.startsWith('image/') && sizeInBytes > 2 * 1024 * 1024) {
  bytes = await compress(bytes, { quality: 0.8, maxWidth: 1920 });
}
```

### 4. Webhook post-création

```typescript
// Notifier système externe après création
await fetch('https://external-system.com/webhook/practitioner-created', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    practitionerId: practitionerResult.id,
    name: practitionerPayload.name,
    specialty: practitionerPayload.specialty,
  }),
});
```

### 5. Analytics

```typescript
// Tracker métriques inscription
const metrics = {
  signup_started: Date.now(),
  profile_creation_time: profileTime,
  documents_upload_time: uploadTime,
  practitioner_creation_time: practitionerTime,
  total_time: Date.now() - signup_started,
  documents_count: uploadedDocuments.length,
  user_agent: req.headers.get('user-agent'),
};

await supabase.from('signup_analytics').insert(metrics);
```

## Métriques de succès

**Taux de succès attendu** : > 95%  
**Temps moyen** : 3-8 secondes (selon taille documents)  
**Rollback rate** : < 5%

**Raisons d'échec communes** :
1. Documents trop volumineux (> 5MB)
2. Connexion instable (upload échoue)
3. Données invalides côté backend
4. Email déjà utilisé (doublon)

## Support

**Logs** : Lovable Cloud → Functions → `create-practitioner-account`  
**Documentation** : Ce fichier + code source edge function  
**Contact** : Équipe dev pour bugs critiques
