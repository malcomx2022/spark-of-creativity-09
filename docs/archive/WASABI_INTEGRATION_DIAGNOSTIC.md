# Diagnostic de l'intégration Wasabi S3

## Vue d'ensemble

L'application utilise **Wasabi S3** comme solution de stockage externe pour tous les documents KYC des praticiens (pièces d'identité, diplômes, licences, etc.).

## Architecture

```
Frontend (React)
    ↓
src/lib/file-upload.ts
    ↓
Edge Functions (Deno)
    ├── upload-to-wasabi (upload)
    └── get-presigned-url (lecture)
    ↓
Wasabi S3 Storage
```

## Configuration des secrets

Tous les secrets Wasabi sont configurés :

- ✅ `WASABI_ACCESS_KEY_ID` - Clé d'accès Wasabi
- ✅ `WASABI_SECRET_ACCESS_KEY` - Clé secrète Wasabi
- ✅ `WASABI_BUCKET_NAME` - Nom du bucket
- ✅ `WASABI_REGION` - Région du bucket
- ✅ `WASABI_ENDPOINT` - Point de terminaison Wasabi

## Fonctionnement

### 1. Upload de fichiers (upload-to-wasabi)

**Processus :**
1. Le fichier est converti en base64 côté client
2. Envoyé à l'edge function `upload-to-wasabi`
3. L'edge function génère une signature AWS V4
4. Upload direct vers Wasabi S3
5. Retour du chemin du fichier

**Structure du chemin :**
```
{folder}/{userId}/{timestamp}-{filename}
```

Exemple :
```
documents/123e4567-e89b-12d3-a456-426614174000/1234567890-carte_identite.pdf
```

### 2. Génération d'URLs signées (get-presigned-url)

**Processus :**
1. Le client demande une URL signée pour un fichier
2. L'edge function vérifie les permissions :
   - Admins : accès à tous les fichiers
   - Utilisateurs : accès uniquement aux fichiers contenant leur userId
3. Génération d'une signature AWS V4 valide 1h
4. Retour de l'URL signée

**Format de l'URL signée :**
```
https://{endpoint}/{bucket}/{filePath}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...&X-Amz-Signature=...
```

## Sécurité

### Contrôle d'accès

**Upload :**
- Authentification obligatoire (JWT ou Service Role)
- Les fichiers sont organisés par userId
- Pas d'accès public

**Lecture :**
- Authentification obligatoire
- Vérification des permissions :
  - Admin : tous les fichiers
  - Utilisateur : uniquement ses propres fichiers
- URLs temporaires (1h d'expiration)

### Audit

Tous les uploads sont tracés dans la table `files` :
```sql
CREATE TABLE files (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  file_name VARCHAR NOT NULL,
  file_path VARCHAR NOT NULL,
  file_size BIGINT NOT NULL,
  file_type VARCHAR,
  folder VARCHAR,
  storage_provider VARCHAR DEFAULT 'wasabi',
  metadata JSONB,
  shared_with UUID[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

## Détection du type de fichier

### Frontend (src/lib/file-upload.ts)

```typescript
export function getFileExtension(filePath: string): string {
  // Gère les URLs avec query parameters
  const pathWithoutQuery = filePath.split('?')[0];
  const extension = pathWithoutQuery.split('.').pop()?.toLowerCase() || '';
  return extension;
}

export function isImageFile(filePath: string): boolean {
  const extension = getFileExtension(filePath);
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension);
}

export function isPdfFile(filePath: string): boolean {
  const extension = getFileExtension(filePath);
  return extension === 'pdf';
}
```

## Affichage des documents

### Dans l'admin (KYCQueue.tsx)

```tsx
<Dialog>
  {viewingDocument.url.toLowerCase().split('?')[0].endsWith('.pdf') ? (
    <iframe
      src={`${viewingDocument.url}#toolbar=0`}
      className="w-full border rounded"
      style={{ minHeight: '70vh' }}
      title={viewingDocument.name}
    />
  ) : (
    <img
      src={viewingDocument.url}
      alt={viewingDocument.name}
      className="w-full h-auto rounded"
    />
  )}
</Dialog>
```

### Dans le dashboard praticien (DocumentsSection.tsx)

Même logique que l'admin avec détection du type de fichier.

## Logs et Debugging

### Logs importants à vérifier

**Upload :**
```typescript
console.log('Uploading file to Wasabi:', filePath);
console.log('File uploaded successfully:', filePath);
```

**Lecture :**
```typescript
console.log('Requesting presigned URL for:', filePath);
console.log('Presigned URL generated successfully:', {
  filePath,
  urlLength: presignedUrl.length,
  expiresIn,
  userId: user.id,
  isAdmin
});
```

### Erreurs courantes

1. **"Wasabi credentials not configured"**
   - Vérifier que tous les secrets sont configurés
   - Redéployer les edge functions

2. **"Unauthorized access to this file"**
   - L'utilisateur n'est pas admin
   - Le filePath ne contient pas le userId de l'utilisateur
   - Vérifier les permissions RLS

3. **"Failed to get signed file URL"**
   - Le fichier n'existe pas sur Wasabi
   - Erreur de génération de signature
   - Vérifier les credentials Wasabi

4. **Document ne s'affiche pas dans l'iframe/img**
   - Vérifier le Content-Type lors de l'upload
   - Vérifier les CORS de Wasabi
   - Vérifier que l'URL est valide et accessible

## Tests de validation

### 1. Test d'upload

```typescript
// Dans la console du navigateur
const testUpload = async () => {
  const file = new File(["test"], "test.pdf", { type: "application/pdf" });
  const content = await file.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(content)));
  
  const { data, error } = await supabase.functions.invoke('upload-to-wasabi', {
    body: {
      fileName: 'test.pdf',
      fileContent: base64,
      contentType: 'application/pdf',
      folder: 'documents'
    }
  });
  
  console.log('Upload result:', { data, error });
};

testUpload();
```

### 2. Test de lecture

```typescript
// Dans la console du navigateur
const testPresignedUrl = async (filePath) => {
  const { data, error } = await supabase.functions.invoke('get-presigned-url', {
    body: {
      filePath,
      expiresIn: 3600
    }
  });
  
  console.log('Presigned URL result:', { data, error });
  
  if (data?.url) {
    window.open(data.url, '_blank');
  }
};

testPresignedUrl('documents/YOUR_USER_ID/123456-test.pdf');
```

### 3. Vérifier les logs des edge functions

```bash
# Via l'interface Lovable Cloud
# Aller dans Backend → Functions → Logs
# Filtrer par fonction : upload-to-wasabi ou get-presigned-url
# Rechercher les erreurs
```

## Workflow complet d'inscription praticien avec documents

1. **Inscription** (`PractitionerSignup.tsx`)
   - Upload des documents via `uploadUserDocument()`
   - Stockage des chemins dans la table `practitioners`

2. **Validation admin** (`KYCQueue.tsx`)
   - Chargement des URLs signées via `getSignedFileUrl()`
   - Affichage des documents dans les dialogs
   - Validation/Rejet du dossier KYC

3. **Dashboard praticien** (`DocumentsSection.tsx`)
   - Visualisation de ses propres documents
   - Statut de validation KYC
   - Commentaires de l'admin si refus/incomplet

## Recommandations

1. **Monitoring**
   - Surveiller les logs des edge functions
   - Vérifier régulièrement l'espace disque Wasabi
   - Monitorer les quotas d'API Wasabi

2. **Optimisations**
   - Implémenter un cache des URLs signées côté client (< 1h)
   - Compression des images avant upload
   - Thumbnails pour les previews

3. **Sécurité**
   - Rotation régulière des credentials Wasabi
   - Audit des accès aux fichiers
   - Validation des types de fichiers (MIME types)
   - Scan antivirus des fichiers uploadés (à implémenter)

4. **Backup**
   - Politique de backup Wasabi
   - Réplication géographique si nécessaire
   - Procédure de restauration documentée
