# Architecture des rôles utilisateurs

## Vue d'ensemble

Ce document explique comment fonctionnent les rôles dans l'application et clarifie la distinction entre les **rôles applicatifs** et les **rôles stockés en base de données**.

## Types de rôles

### 1. Rôles applicatifs (`AppRole`)

Définis dans `src/lib/userRoleResolver.ts` :

```typescript
export type AppRole = 'patient' | 'practitioner' | 'coach' | 'admin';
```

Ces rôles représentent les **4 types d'utilisateurs** dans l'application et sont déterminés **dynamiquement** lors de la résolution du rôle utilisateur.

### 2. Enum de base de données (`app_role`)

Défini dans PostgreSQL via la migration initiale :

```sql
CREATE TYPE public.app_role AS ENUM (
  'super_admin', 'ops', 'finance', 'compliance', 'support', 'analyst',
  'patient', 'practitioner', 'coach'
);
```

**⚠️ IMPORTANT** : Cet enum contient **9 valeurs** mais la table `user_roles` n'utilise que les **6 rôles administrateurs**.

## Table `user_roles`

### Utilisation

La table `user_roles` stocke **UNIQUEMENT** les rôles administrateurs :
- `super_admin` - Super administrateur (accès complet)
- `ops` - Opérations
- `finance` - Finance
- `compliance` - Conformité
- `support` - Support client
- `analyst` - Analyste

### Structure

```sql
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE (user_id, role)
);
```

### Règles RLS

```sql
-- Seuls les super_admins peuvent gérer les rôles
CREATE POLICY "Super admins can manage all roles"
ON user_roles FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Les utilisateurs peuvent voir leurs propres rôles
CREATE POLICY "Users can view their own roles"
ON user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
```

## Résolution des rôles applicatifs

La fonction `resolveUserRole()` détermine le rôle applicatif selon cet ordre de priorité :

### 1️⃣ Administrateur (`admin`)

**Source** : Table `user_roles`

```sql
SELECT role FROM user_roles WHERE user_id = ?
```

Si l'utilisateur a **n'importe quel** rôle dans `user_roles`, il est considéré comme `admin` dans l'application.

### 2️⃣ Praticien (`practitioner`) ou Coach (`coach`)

**Source** : Table `practitioners`

```sql
SELECT practitioner_type FROM practitioners WHERE user_id = ?
```

- Si `practitioner_type = 'coach_sportif'` → Rôle applicatif = `coach`
- Sinon → Rôle applicatif = `practitioner`

**⚠️ Ces rôles ne sont JAMAIS stockés dans `user_roles`**

### 3️⃣ Métadonnées utilisateur (fallback)

**Source** : `auth.users.user_metadata.user_type`

Utilisé uniquement pour la compatibilité avec d'anciens comptes.

### 4️⃣ Patient (par défaut)

Si aucune des sources ci-dessus ne retourne de rôle, l'utilisateur est considéré comme `patient`.

**⚠️ Le rôle `patient` n'est JAMAIS stocké en base de données**

## Pourquoi `patient`, `practitioner`, `coach` sont dans l'enum ?

Ces valeurs ont été ajoutées à l'enum `app_role` pour :

1. **Uniformité** : Permettre l'utilisation du même enum dans d'autres tables si nécessaire à l'avenir
2. **Type safety** : Avoir un seul type PostgreSQL pour tous les rôles
3. **Flexibilité** : Permettre l'évolution du système sans migration complexe

**Cependant**, elles ne sont **jamais insérées** dans la table `user_roles`.

## Schéma de décision

```
Utilisateur authentifié
        |
        v
Existe dans user_roles ? ──YES──> Rôle = admin
        |
       NO
        v
Existe dans practitioners ? ──YES──> Rôle = practitioner ou coach
        |                              (selon practitioner_type)
       NO
        v
Rôle = patient (par défaut)
```

## Dashboards associés

Chaque rôle applicatif redirige vers un dashboard spécifique :

| Rôle applicatif | Dashboard |
|----------------|-----------|
| `admin` | `/admin` |
| `practitioner` | `/dashboard/practitioner` |
| `coach` | `/dashboard/coach` |
| `patient` | `/dashboard/patient` |

## Fonction de sécurité

La fonction `has_role()` vérifie les rôles dans `user_roles` :

```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
```

**⚠️ Cette fonction ne fonctionne QUE pour les rôles administrateurs**

Ne l'utilisez JAMAIS avec `'patient'`, `'practitioner'`, ou `'coach'` !

## Exemples d'utilisation

### ✅ Correct

```typescript
// Vérifier si un utilisateur est admin
const { data } = await supabase
  .from('user_roles')
  .select('role')
  .eq('user_id', userId)
  .maybeSingle();

const isAdmin = !!data?.role;
```

```sql
-- RLS Policy pour les admins uniquement
CREATE POLICY "Only super admins"
ON some_table FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));
```

### ❌ Incorrect

```typescript
// NE JAMAIS faire ça !
const { data } = await supabase
  .from('user_roles')
  .select('role')
  .eq('user_id', userId)
  .eq('role', 'patient'); // ❌ patient n'est jamais dans user_roles
```

```sql
-- NE JAMAIS faire ça !
CREATE POLICY "Only patients"
ON some_table FOR SELECT
USING (has_role(auth.uid(), 'patient'::app_role)); -- ❌ Toujours false
```

## Résumé

| Rôle | Stocké dans `user_roles` ? | Comment le déterminer |
|------|---------------------------|-----------------------|
| `super_admin`, `ops`, `finance`, `compliance`, `support`, `analyst` | ✅ Oui | Table `user_roles` |
| `practitioner` | ❌ Non | Table `practitioners` où `practitioner_type != 'coach_sportif'` |
| `coach` | ❌ Non | Table `practitioners` où `practitioner_type = 'coach_sportif'` |
| `patient` | ❌ Non | Par défaut (absence dans `user_roles` et `practitioners`) |

## Fichiers clés

- **Résolution des rôles** : `src/lib/userRoleResolver.ts`
- **Protection des routes** : `src/components/ProtectedRoute.tsx`
- **Hook admin** : `src/hooks/useAdminRole.ts`
- **Migration initiale** : `supabase/migrations/20251010095757_8406dea3-8455-4457-84a2-b1fd8c9fc979.sql`
- **Extension enum** : `supabase/migrations/20251129152438_8e60208c-aebe-4524-8999-9505cae41fb3.sql`
