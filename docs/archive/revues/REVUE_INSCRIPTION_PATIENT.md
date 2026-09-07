# Revue Fonctionnelle - Workflow Inscription Patient

**Date:** 2026-01-27
**Version:** 1.0

---

## 1. Architecture du Workflow

### 1.1 Phases du workflow

```
PHASE 1: FORMULAIRE (PatientSignup.tsx)
    |
    v
[Validation Zod] --> [Check tel unique] --> [Supabase SignUp] --> [Edge Function]
    |                                              |
    v                                              v
[Erreur validation]                    [Email non confirmé?]
                                              |
                        +-----------+---------+
                        |                     |
                   [OUI: Redirect           [NON: Continue]
                   ConfirmEmail]                  |
                                                  v
                                         [Edge Function OK?]
                                              |
                              +---------------+---------------+
                              |                               |
                         [OUI: Success]                   [NON: Toast retry]
                              |
                              v
PHASE 2: PAGE SUCCES (RegistrationSuccess.tsx)
    |
    v
[Check email confirmé] --> [Countdown si confirmé] --> [Redirect dashboard]
    |
    v
[Resend email si besoin]

PHASE 3: DASHBOARD (PatientDashboard.tsx)
    |
    v
[ProtectedRoute check role] --> [completePatientOnboardingFromMetadata]
```

### 1.2 Tables de données créées

| Table | Champs principaux | Obligatoire |
|-------|-------------------|-------------|
| auth.users | email, password, user_metadata | OUI |
| profiles | id, full_name, phone, gender, date_of_birth | OUI |
| addresses | user_id, address, label, is_default | NON |
| emergency_contacts | user_id, name, phone, relationship | NON |
| medical_profiles | user_id, chronic_diseases | NON |
| consents | user_id, consent_type, is_accepted, accepted_at | OUI |

### 1.3 Fichiers impliqués

| Fichier | Rôle |
|---------|------|
| `src/pages/PatientSignup.tsx` | Formulaire inscription |
| `src/pages/RegistrationSuccess.tsx` | Page succès après inscription |
| `src/pages/ConfirmEmail.tsx` | Page confirmation email |
| `src/pages/PatientLogin.tsx` | Connexion patient |
| `src/pages/PatientDashboard.tsx` | Dashboard patient |
| `src/lib/patient-onboarding.ts` | Fonctions onboarding patient |
| `src/lib/userRoleResolver.ts` | Résolution des rôles |
| `src/components/ProtectedRoute.tsx` | Protection des routes |
| `supabase/functions/complete-user-registration/index.ts` | Edge function finalisation |

---

## 2. Analyse des Bugs Identifiés

### Bug #1 - CRITIQUE: Email manquant dans la redirection RegistrationSuccess

**Fichier:** `src/pages/PatientSignup.tsx:360`

**Problème:**
```typescript
// Actuel - email NON passé
navigate('/registration-success?type=patient', { replace: true });

// Comparé au praticien qui passe l'email:
// navigate(`/registration-success?type=practitioner&practitionerType=${practitionerType}&email=${encodeURIComponent(formData.email)}`);
```

**Impact:**
- RegistrationSuccess ne peut pas afficher l'email du patient
- Le bouton "Renvoyer l'email" ne fonctionnera pas (currentUserEmail sera null)
- L'utilisateur ne saura pas à quelle adresse le mail a été envoyé

**Correction requise:**
```typescript
navigate(`/registration-success?type=patient&email=${encodeURIComponent(formData.email)}`, { replace: true });
```

---

### Bug #2 - CRITIQUE: updateUser sans session active (email non confirmé)

**Fichier:** `src/pages/PatientSignup.tsx:285-290`

**Problème:**
```typescript
if (authData.user && !authData.user.confirmed_at && !authData.session) {
  // Sauvegarder les données dans user_metadata pour finalisation après confirmation
  await supabase.auth.updateUser({  // <-- ERREUR: pas de session active!
    data: {
      pending_onboarding: onboardingPayload,
      needs_onboarding: true
    }
  });
```

**Impact:**
- `supabase.auth.updateUser()` nécessite une session active
- Sans session (car email non confirmé), l'appel échouera silencieusement
- Les données d'onboarding ne seront pas sauvegardées

**Correction requise:**
Les données sont déjà passées lors du `signUp` dans `options.data`, donc ce bloc de code est redondant et devrait être supprimé ou modifié pour utiliser l'API admin via edge function.

---

### Bug #3 - MOYEN: Pas de détection d'inscription patient incomplète

**Fichier:** `src/lib/userRoleResolver.ts`

**Problème:**
Le resolver détecte `incomplete_practitioner` mais pas `incomplete_patient`:

```typescript
// PRIORITÉ 3: Vérifier les métadonnées utilisateur
if (metadataType === 'practitioner') {
  return {
    role: 'incomplete_practitioner',
    // ...
  };
}

// Pas de détection pour:
// if (metadataType === 'patient' && needs_onboarding) { ... }
```

**Impact:**
- Un patient dont l'edge function a échoué accèdera au dashboard avec un profil vide
- Pas de redirection vers une page de récupération comme pour les praticiens

**Note:** Partiellement mitigé car PatientDashboard appelle `completePatientOnboardingFromMetadata`

---

### Bug #4 - MOYEN: Redirection incorrecte si utilisateur déjà connecté

**Fichier:** `src/pages/PatientSignup.tsx:106-110`

**Problème:**
```typescript
useEffect(() => {
  if (!isLoading && user) {
    navigate("/dashboard/patient", { replace: true });  // <-- Assume que c'est un patient!
  }
}, [user, isLoading, navigate]);
```

**Impact:**
- Si un praticien visite `/signup/patient` alors qu'il est connecté, il sera redirigé vers `/dashboard/patient`
- Cela provoquera une erreur de rôle dans ProtectedRoute

**Correction requise:**
```typescript
useEffect(() => {
  if (!isLoading && user) {
    // Vérifier le rôle et rediriger vers le bon dashboard
    getDashboardPathFromAuth().then(path => {
      navigate(path, { replace: true });
    });
  }
}, [user, isLoading, navigate]);
```

---

### Bug #5 - MOYEN: Pas de mécanisme de récupération localStorage

**Fichier:** `src/pages/PatientSignup.tsx`

**Problème:**
Contrairement au workflow praticien qui utilise `savePendingRegistration()` en cas d'échec de l'edge function, le workflow patient ne sauvegarde pas les données dans localStorage.

```typescript
// Praticien (PractitionerSignup.tsx):
if (result.error) {
  savePendingRegistration({ ... });  // <-- Sauvegarde pour récupération
}

// Patient (PatientSignup.tsx):
if (registrationError) {
  // Juste un toast avec bouton retry, pas de sauvegarde
  toast({ ... });
}
```

**Impact:**
- Si l'utilisateur ferme l'onglet après l'échec, les données sont perdues
- L'utilisateur devra tout ressaisir

---

### Bug #6 - MINEUR: Retry edge function ne vérifie pas le userId

**Fichier:** `src/pages/PatientSignup.tsx:386-410`

**Problème:**
```typescript
const handleRetryFinalization = async (userId: string, payload: any) => {
  // Le userId est passé en closure mais pourrait être obsolète
  // si l'utilisateur s'est déconnecté puis reconnecté
```

**Impact faible:** Dans la pratique, l'utilisateur est généralement connecté lors du retry.

---

### Bug #7 - MINEUR: Message d'erreur générique pour email déjà utilisé

**Fichier:** `src/pages/PatientSignup.tsx:264-266`

**Problème:**
```typescript
description: isEmailAlreadyUsed
  ? "Cet email est déjà lié à un compte patient ou praticien. Connectez-vous ou utilisez une autre adresse."
```

Le message ne distingue pas si c'est un compte patient ou praticien existant, ce qui pourrait aider l'utilisateur à comprendre où se connecter.

---

### Bug #8 - MINEUR: Pas de vérification de confirmation email dans PatientLogin

**Fichier:** `src/pages/PatientLogin.tsx`

**Problème:**
Le login patient ne vérifie pas si `email_confirmed_at` est défini. Un utilisateur dont l'email n'est pas confirmé pourrait potentiellement se connecter.

**Note:** Supabase bloque généralement cela au niveau auth, mais une vérification explicite serait plus robuste.

---

## 3. Points Positifs du Workflow Actuel

1. **Validation Zod complète** - Bonne validation frontend avec messages d'erreur clairs
2. **Vérification téléphone unique** - Check avant création du compte
3. **Retry avec timeout** - Mécanisme de retry intégré pour les erreurs réseau
4. **Récupération dans dashboard** - `completePatientOnboardingFromMetadata` permet de finaliser au login
5. **Protection des routes** - ProtectedRoute vérifie les rôles correctement
6. **Gestion des praticiens** - PatientLogin bloque les praticiens correctement

---

## 4. Plan de Correction

### Priorité 1 - Critiques - CORRIGEES

| Bug | Fichier | Action | Statut |
|-----|---------|--------|--------|
| #1 | PatientSignup.tsx:360 | Ajouter `&email=${encodeURIComponent(formData.email)}` | CORRIGE |
| #2 | PatientSignup.tsx:285-290 | Supprimer le bloc updateUser (données déjà dans signUp) | CORRIGE |

### Priorité 2 - Moyens - CORRIGEES

| Bug | Fichier | Action | Statut |
|-----|---------|--------|--------|
| #4 | PatientSignup.tsx:106-110 | Utiliser getDashboardPathFromAuth() | CORRIGE |
| #5 | PatientSignup.tsx | Ajouter savePendingRegistration comme pour praticien | CORRIGE |

### Priorité 3 - Mineurs (Amélioration continue)

| Bug | Fichier | Action | Statut |
|-----|---------|--------|--------|
| #3 | userRoleResolver.ts | Ajouter détection incomplete_patient (optionnel) | Non critique - mitigé par dashboard |
| #6 | PatientSignup.tsx | Vérifier la session avant retry | Mineur |
| #7 | PatientSignup.tsx | Améliorer le message d'erreur | Mineur |
| #8 | PatientLogin.tsx | Ajouter vérification email_confirmed_at | Mineur - Supabase gère |

---

## 5. Comparaison avec Workflow Praticien

| Aspect | Patient | Praticien | Recommandation |
|--------|---------|-----------|----------------|
| Email dans URL succès | NON | OUI | Aligner patient |
| Récupération localStorage | NON | OUI | Ajouter pour patient |
| Détection inscription incomplète | Via dashboard | Via userRoleResolver | Acceptable |
| Page CompleteRegistration | NON | OUI | Non nécessaire (dashboard gère) |
| Retry edge function | OUI | OUI | OK |
| Validation Zod | OUI | OUI | OK |

---

## 6. Tests Recommandés

### Scénario 1: Inscription normale
1. Remplir le formulaire complet
2. Soumettre
3. Vérifier redirection vers RegistrationSuccess
4. Vérifier affichage email (après correction Bug #1)
5. Confirmer email
6. Vérifier accès dashboard

### Scénario 2: Email non confirmé
1. Inscription complète
2. Ne PAS confirmer email
3. Essayer de se connecter → Doit échouer
4. Cliquer sur "Renvoyer email" → Doit fonctionner

### Scénario 3: Échec edge function
1. Simuler timeout edge function
2. Vérifier toast avec bouton retry
3. Cliquer retry
4. Vérifier finalisation

### Scénario 4: Fermeture navigateur après échec
1. Inscription, edge function échoue
2. Fermer l'onglet
3. Se reconnecter
4. Vérifier que dashboard finalise via completePatientOnboardingFromMetadata

### Scénario 5: Praticien sur page signup patient
1. Se connecter comme praticien
2. Naviguer vers /signup/patient
3. Vérifier redirection vers le bon dashboard (après correction Bug #4)

---

## 7. Conclusion

Le workflow d'inscription patient est fonctionnel mais nécessite quelques corrections pour être au même niveau de robustesse que celui des praticiens:

- **2 bugs critiques** à corriger immédiatement (email dans URL, updateUser sans session)
- **2 bugs moyens** à corriger rapidement (redirection, récupération localStorage)
- **4 bugs mineurs** à traiter en amélioration continue

La correction des bugs #1 et #2 est prioritaire car ils affectent directement l'expérience utilisateur lors de l'inscription.
