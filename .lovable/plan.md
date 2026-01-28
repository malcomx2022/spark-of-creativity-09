
# Plan de correction des erreurs de build TypeScript

## Résumé du problème

L'application a des erreurs de build car le code fait référence à des tables et colonnes qui n'existent pas dans la base de données :

| Élément manquant | Fichier impacté | Description |
|------------------|-----------------|-------------|
| Table `kyc_documents` | ApiManagementSection.tsx | Stockage des documents KYC |
| Table `user_consents` | ComplianceSection.tsx | Historique des consentements utilisateurs |
| Table `admins` | useAdminAuth.ts | Informations sur les administrateurs |
| Relation `support_tickets` → `profiles` | SupportSection.tsx | Lien manquant pour afficher le nom de l'utilisateur |
| Colonnes `admin_response`, `responded_at`, `responded_by` | SupportSection.tsx | Colonnes pour la réponse admin aux tickets |

## Solution proposée

### Étape 1 : Créer les tables manquantes

#### 1.1 Table `kyc_documents`
Stocke les documents KYC des praticiens (CNI, diplômes, assurances).

```text
+------------------+------------------------+
| Colonne          | Type                   |
+------------------+------------------------+
| id               | UUID (PK)              |
| practitioner_id  | UUID → practitioners   |
| document_type    | TEXT                   |
| document_url     | TEXT                   |
| status           | TEXT                   |
| created_at       | TIMESTAMPTZ            |
| updated_at       | TIMESTAMPTZ            |
+------------------+------------------------+
```

#### 1.2 Table `user_consents`
Stocke l'historique des acceptations de consentement par utilisateur.

```text
+------------------+------------------------+
| Colonne          | Type                   |
+------------------+------------------------+
| id               | UUID (PK)              |
| user_id          | UUID → auth.users      |
| consent_type     | consent_type (enum)    |
| version_id       | UUID → consent_versions|
| is_accepted      | BOOLEAN                |
| accepted_at      | TIMESTAMPTZ            |
| ip_address       | INET                   |
| created_at       | TIMESTAMPTZ            |
+------------------+------------------------+
```

#### 1.3 Table `admins`
Stocke les informations supplémentaires des administrateurs.

```text
+------------------+------------------------+
| Colonne          | Type                   |
+------------------+------------------------+
| id               | UUID (PK)              |
| user_id          | UUID → auth.users      |
| email            | TEXT                   |
| full_name        | TEXT                   |
| role             | TEXT                   |
| created_at       | TIMESTAMPTZ            |
| updated_at       | TIMESTAMPTZ            |
+------------------+------------------------+
```

### Étape 2 : Ajouter les colonnes manquantes à `support_tickets`

```sql
ALTER TABLE support_tickets
ADD COLUMN IF NOT EXISTS admin_response TEXT,
ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS responded_by UUID;
```

### Étape 3 : Créer la relation `support_tickets` → `profiles`

Ajouter une clé étrangère :
```sql
ALTER TABLE support_tickets
ADD CONSTRAINT support_tickets_user_id_fkey
FOREIGN KEY (user_id) REFERENCES profiles(id);
```

### Étape 4 : Mettre en place les politiques RLS

- `kyc_documents` : Lecture seule pour les admins, praticiens peuvent voir leurs propres documents
- `user_consents` : Lecture seule pour les admins, utilisateurs peuvent voir leurs propres consentements
- `admins` : Lecture seule pour les admins authentifiés

### Étape 5 : Adapter le code TypeScript

Après l'application des migrations, les types seront automatiquement régénérés et les erreurs disparaîtront.

**Modifications de code nécessaires** (en attendant la régénération des types) :

1. **useAdminAuth.ts** : Refactorer pour utiliser `user_roles` + `profiles` au lieu de la table `admins`
2. **SupportSection.tsx** : Ajouter un type local pour la jointure
3. **ComplianceSection.tsx** : Ajouter un type local pour `user_consents`
4. **ApiManagementSection.tsx** : Ajouter un type local pour `kyc_documents`

---

## Détails techniques

### Migration SQL complète

```sql
-- 1. Table kyc_documents
CREATE TABLE IF NOT EXISTS public.kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  document_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Table user_consents
CREATE TABLE IF NOT EXISTS public.user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  consent_type consent_type NOT NULL,
  version_id UUID REFERENCES consent_versions(id),
  is_accepted BOOLEAN NOT NULL DEFAULT false,
  accepted_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Table admins
CREATE TABLE IF NOT EXISTS public.admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Colonnes support_tickets
ALTER TABLE public.support_tickets
ADD COLUMN IF NOT EXISTS admin_response TEXT,
ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS responded_by UUID;

-- 5. Relation support_tickets → profiles
ALTER TABLE public.support_tickets
DROP CONSTRAINT IF EXISTS support_tickets_user_id_fkey;

ALTER TABLE public.support_tickets
ADD CONSTRAINT support_tickets_user_id_fkey
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 6. RLS et index
ALTER TABLE public.kyc_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can view all kyc_documents"
  ON public.kyc_documents FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Practitioners can view own kyc_documents"
  ON public.kyc_documents FOR SELECT
  TO authenticated
  USING (practitioner_id IN (
    SELECT id FROM practitioners WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins can view all user_consents"
  ON public.user_consents FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can view own consents"
  ON public.user_consents FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view admins table"
  ON public.admins FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
```

### Modifications de code alternatives

Si vous préférez ne pas créer certaines tables, voici les adaptations de code possibles :

**Option A pour `admins`** : Utiliser `user_roles` + `profiles` (déjà existants)
```typescript
// useAdminAuth.ts - Utiliser user_roles + profiles
const { data: roleData } = await supabase
  .from('user_roles')
  .select('role')
  .eq('user_id', user.id)
  .maybeSingle();

const { data: profileData } = await supabase
  .from('profiles')
  .select('full_name')
  .eq('id', user.id)
  .maybeSingle();
```

**Option B pour `user_consents`** : Utiliser la table `consents` existante (si elle a les mêmes champs)

---

## Ordre d'exécution

1. Exécuter la migration SQL (création des tables + colonnes)
2. Les types TypeScript seront automatiquement régénérés
3. Le build passera sans erreurs

## Risques et considérations

- La création de la FK `support_tickets_user_id_fkey` échouera si des `user_id` dans `support_tickets` n'existent pas dans `profiles`
- Il faudra peut-être nettoyer les données orphelines avant d'ajouter la contrainte
