# Guide de Migration de Base de Données DomiCares

Ce guide explique comment exporter les données de Lovable Cloud et les importer dans une nouvelle base Supabase.

## Prérequis

1. **Compte Admin** : Vous devez être connecté en tant que `super_admin`
2. **Nouvelle Base Supabase** : Créer un nouveau projet sur [supabase.com](https://supabase.com)
3. **Credentials** de la nouvelle base :
   - `SUPABASE_URL`
   - `SERVICE_ROLE_KEY`
   - `ANON_KEY`

---

## Étape 1 : Exporter le Schéma SQL

### 1.1 Récupérer le schéma depuis Lovable Cloud

Le schéma complet est disponible dans le fichier `src/integrations/supabase/types.ts`.

### 1.2 Appliquer les Migrations

Toutes les migrations SQL doivent être appliquées sur la nouvelle base. Si vous n'avez pas les fichiers de migration, utilisez le SQL Editor de Supabase pour créer les tables manuellement.

**Script SQL de base** (à exécuter dans SQL Editor de la nouvelle base) :

```sql
-- ================================
-- ÉTAPE 1 : Types et Enums
-- ================================

-- Créer les enums s'ils n'existent pas
DO $$ BEGIN
    CREATE TYPE app_role AS ENUM ('super_admin', 'ops', 'finance', 'compliance', 'support', 'analyst');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE gender AS ENUM ('homme', 'femme', 'autre', 'non_specifie');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE blood_type AS ENUM ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'inconnu');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE practitioner_type AS ENUM ('generaliste', 'specialiste', 'infirmier', 'kinesitherapeute', 'aide_soignant', 'sage_femme', 'coach_sportif');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE kyc_status AS ENUM ('pending', 'approved', 'rejected', 'under_review');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE appointment_status AS ENUM (
        'pending_payment', 'pending', 'accepted', 'rejected', 'cancelled',
        'cancelled_unpaid', 'in-progress', 'completed', 'awaiting_confirmation',
        'disputed', 'no-show'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM (
        'initiated', 'pending', 'authorized', 'paid', 'completed',
        'failed', 'canceled', 'expired', 'refunded', 'partially_refunded', 'chargeback'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payout_status AS ENUM ('pending', 'held', 'ready', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ================================
-- ÉTAPE 2 : Tables Principales
-- ================================

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    phone TEXT UNIQUE,
    gender gender DEFAULT 'non_specifie',
    date_of_birth DATE,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Practitioners
CREATE TABLE IF NOT EXISTS public.practitioners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    specialty TEXT,
    practitioner_type practitioner_type DEFAULT 'generaliste',
    email TEXT,
    phone TEXT,
    image TEXT,
    rating NUMERIC(3,2) DEFAULT 0,
    available BOOLEAN DEFAULT false,
    can_accept_missions BOOLEAN DEFAULT false,
    bio TEXT,
    years_experience INTEGER DEFAULT 0,
    languages TEXT[] DEFAULT '{}',
    communes_served TEXT[] DEFAULT '{}',
    intervention_zone TEXT,
    intervention_radius INTEGER DEFAULT 10,
    certifications TEXT[] DEFAULT '{}',
    session_types TEXT[] DEFAULT '{}',
    latitude NUMERIC,
    longitude NUMERIC,
    kyc_status kyc_status DEFAULT 'pending',
    kyc_documents JSONB DEFAULT '{}',
    kyc_comment TEXT,
    kyc_validated_at TIMESTAMPTZ,
    kyc_reviewed_at TIMESTAMPTZ,
    kyc_reviewed_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Services
CREATE TABLE IF NOT EXISTS public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    base_price INTEGER,
    duration INTEGER DEFAULT 60,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Appointments
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES auth.users(id),
    practitioner_id TEXT NOT NULL,
    service_id UUID REFERENCES public.services(id),
    date DATE NOT NULL,
    time TIME NOT NULL,
    duration INTEGER DEFAULT 60,
    status appointment_status DEFAULT 'pending_payment',
    notes TEXT,
    internal_notes TEXT,
    address TEXT,
    latitude NUMERIC,
    longitude NUMERIC,
    payment_expires_at TIMESTAMPTZ,
    confirmation_requested_at TIMESTAMPTZ,
    patient_confirmed_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id TEXT,
    patient_id UUID REFERENCES auth.users(id),
    amount INTEGER NOT NULL,
    platform_fee INTEGER DEFAULT 0,
    practitioner_fee INTEGER DEFAULT 0,
    net_amount INTEGER DEFAULT 0,
    currency TEXT DEFAULT 'XOF',
    status payment_status DEFAULT 'initiated',
    payout_status payout_status DEFAULT 'pending',
    payment_method TEXT,
    fedapay_transaction_id TEXT,
    fedapay_reference TEXT,
    invoice_number TEXT,
    hold_until TIMESTAMPTZ,
    webhook_received_at TIMESTAMPTZ,
    customer_phone TEXT,
    customer_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ... Continuer avec les autres tables selon le schéma types.ts

-- ================================
-- ÉTAPE 3 : Activer RLS
-- ================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practitioners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
-- ... pour toutes les tables

-- ================================
-- ÉTAPE 4 : Policies RLS
-- ================================

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- ... Ajouter toutes les policies selon vos besoins
```

---

## Étape 2 : Exporter les Données

### 2.1 Via l'Edge Function (Recommandé)

```javascript
// Dans la console du navigateur, connecté en super_admin
const response = await fetch(
  'https://kskkufjliwdfqqyemcpf.supabase.co/functions/v1/export-database',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session.access_token}`
    },
    body: JSON.stringify({ action: 'export_all' })
  }
);

const exportData = await response.json();

// Télécharger le fichier
const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `domicares-export-${new Date().toISOString().split('T')[0]}.json`;
a.click();
```

### 2.2 Vérifier l'export

```javascript
// Lister les tables et comptages
const listResponse = await fetch(
  'https://kskkufjliwdfqqyemcpf.supabase.co/functions/v1/export-database',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ action: 'list_tables' })
  }
);

console.log(await listResponse.json());
```

---

## Étape 3 : Migrer les Utilisateurs

### ⚠️ Important : Les mots de passe

Les mots de passe hashés ne peuvent PAS être exportés via l'API. Options :

**Option A - Reset Password (Recommandé pour < 50 utilisateurs)**

1. Créer les utilisateurs avec des mots de passe temporaires
2. Envoyer un email de reset à chaque utilisateur

**Option B - pg_dump (Si accès direct à la DB)**

```bash
pg_dump -h db.kskkufjliwdfqqyemcpf.supabase.co -U postgres \
  -d postgres -t auth.users --data-only > auth_users.sql
```

### 3.1 Créer les utilisateurs dans la nouvelle base

```javascript
// Pour chaque utilisateur exporté
const { data, error } = await newSupabase.auth.admin.createUser({
  email: user.email,
  email_confirm: true,
  password: generateTempPassword(), // Mot de passe temporaire
  user_metadata: user.raw_user_meta_data
});

// Envoyer email de reset
await newSupabase.auth.resetPasswordForEmail(user.email);
```

---

## Étape 4 : Importer les Données

### 4.1 Préparer la nouvelle base

```sql
-- Désactiver temporairement les contraintes FK
SET session_replication_role = 'replica';
```

### 4.2 Importer via l'Edge Function

```javascript
const exportData = /* données exportées */;

const response = await fetch(
  'https://NOUVELLE_BASE.supabase.co/functions/v1/import-database',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Target-Supabase-Url': 'https://NOUVELLE_BASE.supabase.co',
      'X-Target-Service-Role-Key': 'SERVICE_ROLE_KEY_NOUVELLE_BASE'
    },
    body: JSON.stringify({ 
      action: 'import_tables',
      data: exportData.tables
    })
  }
);
```

### 4.3 Réactiver les contraintes

```sql
SET session_replication_role = 'origin';
```

---

## Étape 5 : Vérification

### 5.1 Comparer les comptages

```sql
-- Sur les deux bases
SELECT 'profiles' as t, COUNT(*) FROM profiles
UNION ALL SELECT 'practitioners', COUNT(*) FROM practitioners
UNION ALL SELECT 'appointments', COUNT(*) FROM appointments
UNION ALL SELECT 'payments', COUNT(*) FROM payments;
```

### 5.2 Tester les fonctionnalités

- [ ] Connexion utilisateur
- [ ] Création de rendez-vous
- [ ] Paiement FedaPay
- [ ] Notifications

---

## Étape 6 : Mettre à jour l'Application

### 6.1 Variables d'environnement

Mettre à jour `.env` avec les nouvelles credentials :

```env
VITE_SUPABASE_URL=https://NOUVELLE_BASE.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=nouvelle_anon_key
```

### 6.2 Webhooks FedaPay

Mettre à jour l'URL du webhook chez FedaPay :
```
https://NOUVELLE_BASE.supabase.co/functions/v1/payment-webhook
```

### 6.3 Secrets Edge Functions

Configurer tous les secrets sur la nouvelle base :
- FEDAPAY_SECRET_KEY
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- etc.

---

## Troubleshooting

### Erreur "Foreign key violation"

```sql
-- Désactiver les FK temporairement
ALTER TABLE appointments DISABLE TRIGGER ALL;
-- Importer...
ALTER TABLE appointments ENABLE TRIGGER ALL;
```

### Erreur "Duplicate key"

```sql
-- Utiliser upsert au lieu d'insert
INSERT INTO ... ON CONFLICT (id) DO UPDATE SET ...;
```

### Utilisateurs sans profil

```sql
-- Créer les profils manquants
INSERT INTO profiles (id, full_name)
SELECT id, email FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles);
```

---

## Rollback

Si la migration échoue :

1. Garder l'ancienne base intacte
2. Ne pas mettre à jour les variables d'environnement
3. Supprimer la nouvelle base si nécessaire

---

## Temps estimé

| Étape | Durée |
|-------|-------|
| Préparation | 30 min |
| Export | 15 min |
| Migration users | 1-2h |
| Import données | 30 min |
| Vérification | 1h |
| **Total** | **3-4h** |
