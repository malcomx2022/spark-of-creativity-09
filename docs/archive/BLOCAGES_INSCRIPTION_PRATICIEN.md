# 🚨 Points de Blocage - Inscription Praticien et Coach Sportif

Ce document recense **TOUS** les points qui peuvent bloquer l'inscription d'un praticien, avec une attention particulière pour les **Coachs Sportifs**.

---

## 📋 CHAMPS OBLIGATOIRES

### ✅ Communs à tous les praticiens

| Champ | Validation | Message d'erreur | Ligne code |
|-------|-----------|------------------|------------|
| **Prénom** | Non vide après trim | "Prénom requis" | L179 |
| **Nom** | Non vide après trim | "Nom requis" | L180 |
| **Date de naissance** | Doit être remplie | "Date de naissance requise" | L181 |
| **Genre** | Doit être sélectionné | "Genre requis" | L182 |
| **Adresse** | Non vide après trim | "Adresse requise" | L183 |
| **Téléphone** | Non vide après trim | "Téléphone requis" | L184 |
| **Email** | Non vide après trim | "Email requis" | L185 |
| **Mot de passe** | Non vide | "Mot de passe requis" | L186 |
| **Confirmation mot de passe** | = mot de passe | "Les mots de passe ne correspondent pas" | L207-209 |
| **Profession** | Doit être sélectionnée | "Profession requise" | L187 |
| **Expérience** | Doit être remplie | "Expérience requise" | L189 |
| **Acceptation CGU** | Checkbox cochée | "Vous devez accepter la charte d'engagement" | L229-230 |

### ✅ Spécialité (SAUF Coach Sportif)

| Champ | Validation | Message d'erreur | Ligne code |
|-------|-----------|------------------|------------|
| **Spécialité** | Non vide après trim (si pas coach) | "Spécialité requise" | L188 |

---

## 🏋️ CHAMPS OBLIGATOIRES COACH SPORTIF

| Champ | Validation | Message d'erreur | Ligne code |
|-------|-----------|------------------|------------|
| **Types de séances** | Au moins 1 sélectionné | "Au moins un type de séance requis" | L213 |
| **Zone d'intervention** | Non vide + min 3 caractères | "Zone d'intervention requise" / "Zone d'intervention trop courte (min 3 caractères)" | L214-217 |
| **Rayon d'intervention** | Nombre entre 1 et 100 km | "Rayon d'intervention requis" / "Rayon entre 1 et 100 km" | L219-226 |

### Validation backend (edge function) :

```typescript
// supabase/functions/create-practitioner-account/index.ts:35-44
if (isCoachSportif) {
  if (!session_types || !Array.isArray(session_types) || session_types.length === 0) {
    errors.push('Au moins un type de séance requis pour les coachs sportifs');
  }
  if (!intervention_zone || intervention_zone.trim().length < 3) {
    errors.push('Zone d\'intervention requise (minimum 3 caractères)');
  }
  if (!intervention_radius || intervention_radius < 1 || intervention_radius > 100) {
    errors.push('Rayon d\'intervention invalide (1-100 km)');
  }
}
```

---

## 📄 DOCUMENTS OBLIGATOIRES

### ✅ Pour TOUS les praticiens

| Document | Formats acceptés | Taille max | Validation | Ligne code |
|----------|------------------|------------|------------|-----------|
| **Pièce d'identité** | PDF, JPG, PNG | 5 MB | Magic bytes + format | L192 (frontend), L241-252 (backend) |

### ✅ Pour Coach Sportif UNIQUEMENT

| Document | Formats acceptés | Taille max | Validation | Ligne code |
|----------|------------------|------------|------------|-----------|
| **Diplôme/Certification** | PDF, JPG, PNG | 5 MB | Magic bytes + format | L194-198 (frontend), L254-264 (backend) |

### ✅ Pour Autres Praticiens (NON Coach Sportif)

| Document | Formats acceptés | Taille max | Validation | Ligne code |
|----------|------------------|------------|------------|-----------|
| **Autorisation d'exercice** | PDF, JPG, PNG | 5 MB | Magic bytes + format | L200-204 (frontend), L267-278 (backend) |

### 📸 Documents optionnels (tous praticiens)

| Document | Formats acceptés | Taille max |
|----------|------------------|------------|
| **Photo de profil** | JPG, PNG, WEBP | 5 MB |

---

## 🔐 VALIDATION MOT DE PASSE

### Règles Supabase Auth

| Règle | Erreur | Ligne code |
|-------|--------|------------|
| **Minimum 8 caractères** | "Le mot de passe doit contenir au moins 8 caractères." | L276-281 |
| **Correspondance confirmation** | "Les mots de passe ne correspondent pas" | L207-209 |

---

## 📧 VALIDATION EMAIL

### Règles

| Règle | Erreur | Ligne code |
|-------|--------|------------|
| **Email déjà utilisé** | "Cet email est déjà associé à un compte. Connectez-vous ou utilisez un autre email." | L270-275 |
| **Format invalide** | Gestion Supabase Auth | - |
| **Confirmation email** | Redirection vers `/confirm-email` si nécessaire | L294-298 |

---

## 📱 VALIDATION TÉLÉPHONE

### Règles backend

```typescript
// supabase/functions/create-practitioner-account/index.ts:24-26
if (!phone || !/^\+?[0-9]{8,15}$/.test(phone.replace(/\s/g, ''))) {
  errors.push('Numéro de téléphone invalide');
}
```

**Format attendu** : +229XXXXXXXX (avec indicatif) ou XXXXXXXX (8 à 15 chiffres)

---

## 📂 VALIDATION DOCUMENTS (Magic Bytes)

### PDF (application/pdf)

```typescript
// Doit commencer par '%PDF-'
const pdfHeader = String.fromCharCode(...bytes.slice(0, 5));
if (pdfHeader !== '%PDF-') {
  return { valid: false, error: 'Fichier PDF corrompu ou invalide' };
}
```

### JPEG/JPG (image/jpeg)

```typescript
// Doit commencer par FF D8 FF
if (bytes[0] !== 0xFF || bytes[1] !== 0xD8 || bytes[2] !== 0xFF) {
  return { valid: false, error: 'Fichier JPEG corrompu ou invalide' };
}
```

### PNG (image/png)

```typescript
// Doit commencer par 89 50 4E 47 0D 0A 1A 0A
const pngMagic = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
for (let i = 0; i < pngMagic.length; i++) {
  if (bytes[i] !== pngMagic[i]) {
    return { valid: false, error: 'Fichier PNG corrompu ou invalide' };
  }
}
```

### Erreurs possibles

| Erreur | Cause |
|--------|-------|
| "Format base64 invalide" | Document mal encodé |
| "Type non supporté (PDF, JPG, PNG uniquement)" | Mauvais format de fichier |
| "Fichier trop volumineux (max 5MB)" | Taille > 5 MB |
| "Fichier [type] corrompu ou invalide" | Magic bytes incorrects |

---

## 🌐 VALIDATION BACKEND (Edge Function)

### Validation nom praticien

```typescript
// supabase/functions/create-practitioner-account/index.ts:20-22
if (!name || name.trim().length < 2) {
  errors.push('Nom invalide (minimum 2 caractères)');
}
```

### Validation années d'expérience

```typescript
// supabase/functions/create-practitioner-account/index.ts:47-49
if (years_experience !== null && (years_experience < 0 || years_experience > 70)) {
  errors.push('Années d\'expérience invalides (0-70)');
}
```

---

## 🚫 ERREURS RÉSEAU / TIMEOUT

### Appels avec timeout (30 secondes)

| Appel | Erreur timeout | Ligne code |
|-------|---------------|------------|
| `supabase.auth.signUp()` | NetworkTimeoutError | L253-266 |
| `complete-user-registration` | NetworkTimeoutError | L405-416 |

### Messages d'erreur réseau

```typescript
// src/pages/PractitionerSignup.tsx:387-389
if (errorMessage.includes('upload') || errorMessage.includes('Wasabi') || errorMessage.includes('storage')) {
  userMessage = "Erreur lors de l'upload des documents.";
  errorDetails = "Veuillez vérifier votre connexion internet et réessayer.";
}
```

---

## 🔄 ROLLBACK & ERREURS CRITIQUES

### Échecs possibles après création du compte

1. **Échec création profil** → Compte créé MAIS pas de profil → **Bloquant**
2. **Échec upload document** → Compte créé MAIS documents non uploadés → **Bloquant**
3. **Échec création praticien** → Compte créé MAIS pas dans table `practitioners` → **Bloquant**
4. **Échec envoi notifications** → Compte créé, profil OK MAIS pas de notification → **Non bloquant**

---

## ✅ CHECKLIST INSCRIPTION COACH SPORTIF

### Étape 1 : Informations personnelles

- [ ] Prénom rempli
- [ ] Nom rempli
- [ ] Date de naissance sélectionnée
- [ ] Genre sélectionné
- [ ] Adresse remplie
- [ ] Téléphone au format international (+229...)
- [ ] Email valide et non déjà utilisé

### Étape 2 : Informations professionnelles

- [ ] Profession = "Coach sportif" sélectionné
- [ ] ⚠️ **Spécialité NON REQUISE pour coach sportif**
- [ ] Expérience (années) remplie (0-70)
- [ ] Structure/Lieu de travail rempli (optionnel)

### Étape 3 : Spécificités Coach Sportif

- [ ] ✅ **Au moins 1 type de séance coché** (Individuelle, Groupe, Domicile, Studio)
- [ ] ✅ **Zone d'intervention remplie** (min 3 caractères, ex: "Dakar, Thiès")
- [ ] ✅ **Rayon d'intervention rempli** (1-100 km)
- [ ] Certifications/Diplômes remplis (optionnel mais recommandé)

### Étape 4 : Documents

- [ ] ✅ **Pièce d'identité uploadée** (obligatoire)
- [ ] ✅ **Diplôme/Certification uploadé** (obligatoire pour coach)
- [ ] ⚠️ **Autorisation d'exercice NON REQUISE pour coach sportif**
- [ ] Photo de profil uploadée (optionnel)
- [ ] Tous les documents < 5 MB
- [ ] Tous les documents au format PDF/JPG/PNG

### Étape 5 : Sécurité

- [ ] Mot de passe ≥ 8 caractères
- [ ] Confirmation mot de passe identique
- [ ] ✅ **Charte d'engagement cochée** (obligatoire)

---

## 🛠️ TESTS DE NON-RÉGRESSION

### Test 1 : Coach sportif avec tous les champs

```
✅ Prénom: "Jean"
✅ Nom: "Dupont"
✅ Date naissance: "1990-01-01"
✅ Genre: "homme"
✅ Adresse: "123 rue de la Paix, Dakar"
✅ Téléphone: "+229612345678"
✅ Email: "jean.dupont.coach@test.com"
✅ Profession: "Coach sportif"
✅ Expérience: "5"
✅ Types séances: ["Individuelle", "Groupe"]
✅ Zone intervention: "Dakar, Thiès"
✅ Rayon: "15"
✅ Pièce identité: [Fichier PDF < 5MB]
✅ Diplôme: [Fichier PDF < 5MB]
✅ Mot de passe: "Test123456"
✅ Confirmation: "Test123456"
✅ CGU acceptées
```

**Résultat attendu** : ✅ Inscription réussie

### Test 2 : Coach sportif SANS diplôme

```
❌ Diplôme: null
```

**Résultat attendu** : 🚫 "Diplôme ou certification requis"

### Test 3 : Coach sportif SANS types de séances

```
❌ Types séances: []
```

**Résultat attendu** : 🚫 "Au moins un type de séance requis"

### Test 4 : Coach sportif SANS zone d'intervention

```
❌ Zone intervention: ""
```

**Résultat attendu** : 🚫 "Zone d'intervention requise"

### Test 5 : Coach sportif avec zone trop courte

```
❌ Zone intervention: "Da"
```

**Résultat attendu** : 🚫 "Zone d'intervention trop courte (min 3 caractères)"

### Test 6 : Coach sportif avec rayon invalide

```
❌ Rayon: "150" (> 100)
❌ Rayon: "0" (< 1)
```

**Résultat attendu** : 🚫 "Rayon entre 1 et 100 km"

### Test 7 : Document trop volumineux

```
❌ Pièce identité: [Fichier PDF 6 MB]
```

**Résultat attendu** : 🚫 "Fichier trop volumineux (max 5MB)"

### Test 8 : Document format incorrect

```
❌ Pièce identité: [Fichier .docx]
```

**Résultat attendu** : 🚫 "Type non supporté (PDF, JPG, PNG uniquement)"

### Test 9 : Email déjà utilisé

```
❌ Email: "existant@test.com"
```

**Résultat attendu** : 🚫 "Cet email est déjà associé à un compte"

### Test 10 : Mot de passe trop court

```
❌ Mot de passe: "Test123" (7 caractères)
```

**Résultat attendu** : 🚫 "Le mot de passe doit contenir au moins 8 caractères"

---

## 🔍 LOGS À SURVEILLER

### Console Frontend

```javascript
console.log('✅ Documents uploadés:', { ... });
console.log('✅ Compte praticien créé avec succès');
console.log('✅ Notification envoyée avec succès');
console.error('❌ Erreur création compte praticien:', { ... });
```

### Edge Function Backend

```javascript
console.log('🚀 Création compte praticien atomique:', userId);
console.log('✅ Profil créé');
console.log('✅ Documents uploadés');
console.log('✅ Praticien créé');
console.log('✅ Notifications KYC envoyées à X admin(s)');
console.error('❌ Erreurs validation:', validationErrors);
console.error('❌ Document invalide:', validation.error);
```

---

## 📊 RÉSUMÉ DES DIFFÉRENCES

| Critère | Coach Sportif | Autres Praticiens |
|---------|--------------|-------------------|
| **Spécialité** | ❌ Non requise | ✅ Requise |
| **Types de séances** | ✅ Requises | ❌ Non applicables |
| **Zone d'intervention** | ✅ Requise | ❌ Non applicable |
| **Rayon d'intervention** | ✅ Requis (1-100 km) | ❌ Non applicable |
| **Diplôme** | ✅ Requis | ⚠️ Optionnel |
| **Autorisation exercice** | ❌ Non requise | ✅ Requise |
| **Certifications** | ⚠️ Optionnel mais recommandé | ⚠️ Optionnel |

---

## 🎯 POINTS D'ATTENTION CRITIQUES

### ⚠️ Pour Coach Sportif

1. **Diplôme/Certification OBLIGATOIRE** → Bien visible dans le formulaire avec astérisque rouge (*)
2. **Types de séances** → Au moins 1 coché
3. **Zone d'intervention** → Minimum 3 caractères
4. **Rayon d'intervention** → Entre 1 et 100 km

### ⚠️ Pour Tous

1. **Taille documents** → Maximum 5 MB
2. **Format documents** → PDF, JPG, PNG uniquement
3. **Pièce d'identité** → TOUJOURS obligatoire
4. **Charte d'engagement** → Doit être cochée
5. **Email unique** → Vérifier qu'il n'existe pas déjà

---

## 🆘 DÉPANNAGE RAPIDE

### "Erreur de validation"

→ Vérifier la console pour voir le champ exact manquant

### "Diplôme ou certification requis"

→ Pour coach sportif : uploader un fichier dans le champ "Diplôme/Certificat"

### "Au moins un type de séance requis"

→ Pour coach sportif : cocher au moins 1 checkbox dans "Types de séances"

### "Zone d'intervention requise"

→ Pour coach sportif : remplir le champ avec au moins 3 caractères

### "Rayon entre 1 et 100 km"

→ Pour coach sportif : saisir un nombre entre 1 et 100

### "Fichier trop volumineux"

→ Compresser l'image ou le PDF pour qu'il fasse moins de 5 MB

### "Type non supporté"

→ Convertir le document en PDF, JPG ou PNG

### "Cet email est déjà associé à un compte"

→ Utiliser un autre email ou se connecter avec celui-ci

---

**Date de dernière mise à jour** : 2025-11-23
**Version** : 1.0
