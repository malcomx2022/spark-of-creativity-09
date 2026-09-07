# 🚨 ANALYSE COMPLÈTE : Blocages possibles inscription Coach Sportif

**Date d'analyse :** 26 novembre 2025  
**Fichier analysé :** `src/pages/PractitionerSignup.tsx`  
**Edge function :** `supabase/functions/create-practitioner-account/index.ts`

---

## ❌ PROBLÈMES CRITIQUES IDENTIFIÉS

### 🔴 CRITIQUE #1 : Coordonnées GPS manquantes

**Localisation :** `PractitionerSignup.tsx` ligne 641-647

**Problème :**
```typescript
<AddressSearchInput
  label="Adresse complète"
  value={formData.address}
  onChange={(location) => setFormData(prev => ({ ...prev, address: location.address }))}
  // ❌ Ne récupère QUE l'adresse textuelle, PAS les coordonnées GPS
/>
```

**Impact :**
- Le praticien est enregistré SANS `latitude` et `longitude`
- Dans `find-available-practitioner/index.ts` ligne 142-143 :
  ```typescript
  .not('latitude', 'is', null)
  .not('longitude', 'is', null)
  ```
- **RÉSULTAT : Le praticien ne sera JAMAIS trouvé dans les recherches automatiques**

**Solution requise :**
```typescript
onChange={(location) => setFormData(prev => ({ 
  ...prev, 
  address: location.address,
  latitude: location.latitude,   // À ajouter
  longitude: location.longitude  // À ajouter
}))}
```

---

### 🟡 PROBLÈME #2 : Specialty non remplie pour Coach sportif

**Localisation :** `PractitionerSignup.tsx` ligne 705-722

**Problème :**
- Le champ `specialty` est **caché** pour les coachs sportifs (ligne 705)
- La colonne `specialty` dans la DB est **NOT NULL**
- Le code fait un fallback : `specialty: formData.specialty || formData.profession` (ligne 437)
- Cela met "Coach sportif" comme specialty

**Impact :**
- Fonctionnel actuellement grâce au fallback
- **MAIS** : "Coach sportif" n'est pas une spécialité pertinente
- Devrait être plutôt : "Fitness", "Musculation", "Cardio", "Yoga", etc.

**Solution recommandée :**
Ajouter un champ spécifique pour les coachs sportifs :
```typescript
<Select>
  <SelectItem value="Fitness">Fitness</SelectItem>
  <SelectItem value="Musculation">Musculation</SelectItem>
  <SelectItem value="Cardio">Cardio-training</SelectItem>
  <SelectItem value="Yoga">Yoga</SelectItem>
  <SelectItem value="Pilates">Pilates</SelectItem>
  <SelectItem value="CrossFit">CrossFit</SelectItem>
</Select>
```

---

## ⚠️ ERREURS DE VALIDATION POSSIBLES

### Champs obligatoires Coach Sportif

#### ✅ Informations personnelles
1. **Prénom** : 2-50 caractères, lettres uniquement
2. **Nom** : 2-50 caractères, lettres uniquement
3. **Date de naissance** : 18-100 ans
4. **Genre** : homme/femme
5. **Adresse** : 5-200 caractères
6. **Téléphone** : +229XXXXXXXX (8-15 chiffres)
7. **Email** : format valide, max 255 caractères

#### ✅ Informations professionnelles
8. **Profession** : "Coach sportif" sélectionné
9. **Expérience** : 0-70 ans (requis)

#### ✅ Informations spécifiques Coach
10. **Types de séances** : Au moins 1 requis (individuelle/duo/groupe)
11. **Zone d'intervention** : 3-200 caractères (requis)
12. **Rayon d'intervention** : 1-100 km (requis)
13. **Certifications** : Optionnel, max 500 caractères

#### ✅ Documents
14. **Pièce d'identité** : OBLIGATOIRE (PDF/JPG/PNG, max 5MB)
15. **Diplôme/Certificat** : OBLIGATOIRE pour coach (PDF/JPG/PNG, max 5MB)
16. **Autorisation d'exercice** : NON requis pour coach

#### ✅ Sécurité
17. **Mot de passe** : 8-100 caractères
18. **Confirmation mot de passe** : Doit correspondre
19. **Acceptation CGU** : Obligatoire

---

## 📋 ERREURS POSSIBLES PAR CATÉGORIE

### 1️⃣ Erreurs de validation frontend

```
❌ Prénom requis
❌ Le prénom doit contenir au moins 2 caractères
❌ Le prénom ne peut pas dépasser 50 caractères
❌ Le prénom contient des caractères invalides

❌ Nom requis
❌ Le nom doit contenir au moins 2 caractères
❌ Le nom ne peut pas dépasser 50 caractères
❌ Le nom contient des caractères invalides

❌ Date de naissance requise
❌ Vous devez avoir entre 18 et 100 ans

❌ Genre requis

❌ Adresse requise
❌ L'adresse doit contenir au moins 5 caractères
❌ L'adresse ne peut pas dépasser 200 caractères

❌ Téléphone requis
❌ Numéro de téléphone invalide (format: +229XXXXXXXX)

❌ Email requis
❌ Format d'email invalide
❌ L'email ne peut pas dépasser 255 caractères

❌ Mot de passe requis
❌ Le mot de passe doit contenir au moins 8 caractères
❌ Le mot de passe ne peut pas dépasser 100 caractères
❌ Les mots de passe ne correspondent pas

❌ Profession requise

❌ Expérience requise
❌ L'expérience doit être entre 0 et 70 ans

❌ Au moins un type de séance requis
❌ Zone d'intervention requise
❌ Zone d'intervention trop courte (min 3 caractères)
❌ Zone d'intervention ne peut pas dépasser 200 caractères
❌ Rayon d'intervention requis
❌ Rayon entre 1 et 100 km
❌ Les certifications ne peuvent pas dépasser 500 caractères

❌ Pièce d'identité requise
❌ Diplôme ou certification requis
❌ Fichier trop volumineux (max 5MB)
❌ Format non supporté (PDF, JPG, PNG)

❌ Vous devez accepter la charte d'engagement
```

### 2️⃣ Erreurs d'authentification Supabase

```
❌ Cet email est déjà associé à un compte
❌ Le mot de passe doit contenir au moins 8 caractères
❌ Échec de création du compte
```

### 3️⃣ Erreurs edge function (backend)

**Validation des données :**
```
❌ Nom requis
❌ Nom invalide (minimum 2 caractères)
❌ Nom trop long (maximum 100 caractères)
❌ Nom contient des caractères invalides

❌ Numéro de téléphone requis
❌ Numéro de téléphone invalide (format: +229XXXXXXXX)

❌ Types de séances requis pour les coachs sportifs
❌ Au moins un type de séance requis pour les coachs sportifs
❌ Trop de types de séances sélectionnés (maximum 10)

❌ Zone d'intervention requise pour les coachs sportifs
❌ Zone d'intervention trop courte (minimum 3 caractères)
❌ Zone d'intervention trop longue (maximum 200 caractères)

❌ Rayon d'intervention requis pour les coachs sportifs
❌ Rayon d'intervention invalide (doit être entre 1 et 100 km)

❌ Années d'expérience invalides (doit être entre 0 et 70)
❌ Adresse trop longue (maximum 200 caractères)
❌ Trop de certifications (maximum 20)
```

**Validation documents :**
```
❌ Pièce d'identité requise
❌ Diplôme ou certification requis pour les coachs sportifs
❌ Format base64 invalide
❌ Type non supporté (PDF, JPG, PNG uniquement)
❌ Fichier trop volumineux (max 5MB)
❌ Fichier PDF corrompu ou invalide
❌ Fichier JPEG corrompu ou invalide
❌ Fichier PNG corrompu ou invalide
❌ Impossible de valider le contenu du fichier
```

**Erreurs upload Wasabi :**
```
❌ Invalid base64 data
❌ Échec upload [documentType]
❌ Échec upload Wasabi
```

**Erreurs base de données :**
```
❌ Échec création profil: [détails]
❌ Échec création praticien: [détails]
```

### 4️⃣ Erreurs réseau/timeout

```
❌ Délai de connexion dépassé (>30 secondes)
❌ Vérifiez votre connexion internet et réessayez
```

---

## 🔍 SCÉNARIOS DE BLOCAGE SPÉCIFIQUES

### Scénario 1 : Coach sportif inscrit SANS GPS
**Étapes :**
1. Coach remplit tout le formulaire correctement
2. Sélectionne adresse via AddressSearchInput
3. Inscription réussie ✅
4. **MAIS** : `latitude` et `longitude` = NULL dans la DB
5. **CONSÉQUENCE** : Praticien INVISIBLE dans les recherches

**Preuve :**
- `find-available-practitioner` ligne 142-143 filtre sur `not('latitude', 'is', null)`
- Aucun praticien sans GPS ne sera retourné

### Scénario 2 : Documents invalides
**Étapes :**
1. Coach télécharge fichier > 5MB → ❌ Rejeté
2. Coach télécharge fichier .docx → ❌ Type non supporté
3. Coach renomme .docx en .pdf → ❌ Magic bytes invalides, détecté comme corrompu

### Scénario 3 : Session types non cochés
**Étapes :**
1. Coach oublie de cocher au moins 1 type de séance
2. Validation frontend : ❌ "Au moins un type de séance requis"
3. Validation backend : ❌ "Types de séances requis pour les coachs sportifs"

### Scénario 4 : Zone/Rayon vides
**Étapes :**
1. Coach ne remplit pas "Zone d'intervention"
2. Validation frontend : ❌ "Zone d'intervention requise"
3. Validation backend : ❌ "Zone d'intervention requise pour les coachs sportifs"

### Scénario 5 : Upload Wasabi échoue
**Étapes :**
1. Tous les champs valides
2. Documents valides
3. Upload Wasabi échoue (connexion, credentials, quota)
4. **Rollback automatique** : Suppression du profil
5. Message à l'utilisateur : "Erreur lors de l'upload des documents"

---

## 📊 STATISTIQUES DE VALIDATION

### Validation Frontend (19 champs obligatoires)
| Catégorie | Champs | Validations |
|-----------|--------|-------------|
| Personnel | 7 | Format, longueur, âge |
| Professionnel | 1 | Expérience 0-70 ans |
| Coach spécifique | 3 | Types séances, zone, rayon |
| Documents | 2 | Format, taille, magic bytes |
| Sécurité | 3 | Mot de passe, confirmation, CGU |

### Validation Backend (Edge Function)
- **12 validations strictes** de données
- **Validation magic bytes** pour intégrité fichiers
- **Rollback automatique** en cas d'échec

---

## ✅ RECOMMENDATIONS POUR CORRIGER

### PRIORITÉ 1 : Ajouter coordonnées GPS
```typescript
// Dans PractitionerSignup.tsx
const [formData, setFormData] = useState({
  // ... autres champs
  latitude: null as number | null,
  longitude: null as number | null,
});

<AddressSearchInput
  onChange={(location) => setFormData(prev => ({ 
    ...prev, 
    address: location.address,
    latitude: location.latitude,   // ✅ AJOUTER
    longitude: location.longitude  // ✅ AJOUTER
  }))}
/>

// Dans l'edge function payload
const practitionerData = {
  // ... autres champs
  latitude: formData.latitude,    // ✅ INCLURE
  longitude: formData.longitude,  // ✅ INCLURE
};
```

### PRIORITÉ 2 : Ajouter champ spécialité coach
```typescript
// Ajouter dans le formulaire Coach sportif
<Label>Spécialité sportive *</Label>
<Select value={formData.specialty} onValueChange={...}>
  <SelectItem value="Fitness">Fitness</SelectItem>
  <SelectItem value="Musculation">Musculation</SelectItem>
  <SelectItem value="Cardio">Cardio-training</SelectItem>
  <SelectItem value="Yoga">Yoga</SelectItem>
  <SelectItem value="Pilates">Pilates</SelectItem>
  <SelectItem value="CrossFit">CrossFit</SelectItem>
  <SelectItem value="Sport santé">Sport santé</SelectItem>
  <SelectItem value="Préparation physique">Préparation physique</SelectItem>
</Select>
```

### PRIORITÉ 3 : Améliorer messages d'erreur
- Ajouter indicateurs visuels pour chaque étape de validation
- Afficher progression upload documents (1/3, 2/3, 3/3)
- Messages plus explicites pour échecs GPS/upload

---

## 🧪 TESTS À EFFECTUER

### Test 1 : Inscription complète réussie
- ✅ Remplir tous les champs correctement
- ✅ Télécharger documents valides
- ✅ Vérifier présence GPS dans DB
- ✅ Vérifier praticien trouve dans recherche

### Test 2 : Documents invalides
- ⚠️ Fichier > 5MB → Doit être rejeté
- ⚠️ Format .docx → Doit être rejeté
- ⚠️ Fichier corrompu → Doit être rejeté

### Test 3 : Champs manquants
- ⚠️ Type séance non coché → Doit bloquer
- ⚠️ Zone vide → Doit bloquer
- ⚠️ Rayon vide → Doit bloquer

### Test 4 : Rollback
- ⚠️ Provoquer échec après création profil
- ⚠️ Vérifier suppression profil (rollback)
- ⚠️ Vérifier pas de données orphelines

---

## 📝 RÉSUMÉ EXÉCUTIF

### Blocages actuels confirmés :
1. 🔴 **CRITIQUE** : Pas de coordonnées GPS → Praticien invisible dans recherches
2. 🟡 **Moyen** : Spécialité générique peu pertinente
3. 🟢 **Mineur** : Messages d'erreur pourraient être plus explicites

### Validations fonctionnelles :
- ✅ Tous les champs obligatoires validés
- ✅ Validation stricte documents (format, taille, magic bytes)
- ✅ Rollback automatique en cas d'échec
- ✅ Notifications KYC aux admins

### Actions immédiates requises :
1. **Corriger AddressSearchInput** pour capturer GPS
2. Ajouter champ spécialité sportive
3. Tester workflow complet inscription → recherche → booking

### Estimation impact :
- **Sans GPS** : 100% des coachs inscrits ne seront pas trouvables
- **Avec corrections** : Workflow fonctionnel à 100%
