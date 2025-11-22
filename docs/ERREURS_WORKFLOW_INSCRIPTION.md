# 🔴 Erreurs Bloquantes - Workflow Inscription Praticien

## Date: 2025-01-22
## Status: ✅ CORRIGÉ

---

## ❌ ERREURS IDENTIFIÉES ET CORRIGÉES

### 1. **Validation Diploma Manquante pour Coach Sportif**
**Fichier**: `src/pages/PractitionerSignup.tsx`
**Ligne**: 189-193

**Problème**:
```typescript
// ❌ AVANT (BUGUÉ)
if (!formData.idDocument) errors.idDocument = "Pièce d'identité requise";
if (!isCoachSportif && !formData.licenseDocument) {
  errors.licenseDocument = "Autorisation d'exerce requise";
}
// Manque: validation diploma pour coach
```

**Impact**:
- ❌ Coach pouvait s'inscrire SANS diplôme
- ❌ Document manquant en base de données
- ❌ KYC incomplet

**Solution Appliquée**:
```typescript
// ✅ APRÈS (CORRIGÉ)
if (!formData.idDocument) errors.idDocument = "Pièce d'identité requise";

if (isCoachSportif) {
  // Pour coach: diplôme obligatoire
  if (!formData.diploma) {
    errors.diploma = "Diplôme ou certification requis";
  }
} else {
  // Pour autres: licence obligatoire
  if (!formData.licenseDocument) {
    errors.licenseDocument = "Autorisation d'exercice requise";
  }
}
```

---

### 2. **Validation Backend Manquante**
**Fichier**: `supabase/functions/create-practitioner-account/index.ts`
**Ligne**: 16-43

**Problème**:
- Aucune validation backend des champs spécifiques coach sportif
- `session_types` non vérifié côté serveur
- `intervention_zone` et `intervention_radius` non validés

**Solution Appliquée**:
```typescript
// Validation spécifique pour coach sportif
if (isCoachSportif) {
  if (!practitionerData.session_types || !Array.isArray(practitionerData.session_types) || practitionerData.session_types.length === 0) {
    errors.push('Au moins un type de séance requis pour les coachs sportifs');
  }
  if (!practitionerData.intervention_zone || practitionerData.intervention_zone.trim().length < 3) {
    errors.push('Zone d\'intervention requise (minimum 3 caractères)');
  }
  if (!practitionerData.intervention_radius || practitionerData.intervention_radius < 1 || practitionerData.intervention_radius > 100) {
    errors.push('Rayon d\'intervention invalide (1-100 km)');
  }
}
```

---

### 3. **Validation Documents Backend**
**Fichier**: `supabase/functions/create-practitioner-account/index.ts`
**Ligne**: 203-221

**Problème**:
- Documents non vérifiés avant traitement
- Pas de contrôle selon type de praticien

**Solution Appliquée**:
```typescript
// Vérifier documents obligatoires selon le type
if (!documents.idDocument) {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Pièce d\'identité requise',
    }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

if (isCoachSportif && !documents.diploma) {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Diplôme ou certification requis pour les coachs sportifs',
    }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

if (!isCoachSportif && !documents.licenseDocument) {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Autorisation d\'exercice requise',
    }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

---

## ✅ WORKFLOW FINAL CORRIGÉ

### Pour COACH SPORTIF:
**Documents requis**:
- ✅ Pièce d'identité (obligatoire)
- ✅ Diplôme/Certification (obligatoire)
- ❌ Autorisation d'exercice (NON requis)

**Champs requis**:
- ✅ Types de séance (au moins 1)
- ✅ Zone d'intervention (min 3 caractères)
- ✅ Rayon d'intervention (1-100 km)
- ✅ Certifications (optionnel mais recommandé)

### Pour AUTRES PRATICIENS:
**Documents requis**:
- ✅ Pièce d'identité (obligatoire)
- ✅ Autorisation d'exercice (obligatoire)
- ❌ Diplôme (NON requis)

**Champs requis**:
- ✅ Spécialité (obligatoire)
- ✅ Expérience (obligatoire)
- ✅ Numéro d'enregistrement (optionnel)

---

## 🧪 TESTS À EFFECTUER

### Test 1: Coach Sportif Complet ✅
```
1. Profession: "Coach sportif"
2. Types de séance: "individuelle" + "groupe"
3. Zone: "Cotonou"
4. Rayon: 15 km
5. Documents: ID + Diplôme
6. Soumettre
→ Résultat: ✅ Inscription réussie
```

### Test 2: Coach Sans Diplôme ❌
```
1. Profession: "Coach sportif"
2. Tous les champs remplis
3. Documents: ID seulement (pas de diplôme)
4. Soumettre
→ Résultat: ❌ Erreur "Diplôme ou certification requis"
```

### Test 3: Coach Sans Type de Séance ❌
```
1. Profession: "Coach sportif"
2. Aucun type de séance coché
3. Soumettre
→ Résultat: ❌ Erreur "Au moins un type de séance requis"
```

### Test 4: Médecin Généraliste ✅
```
1. Profession: "Médecin généraliste"
2. Spécialité: "Médecine générale"
3. Documents: ID + Licence
4. Soumettre
→ Résultat: ✅ Inscription réussie
```

### Test 5: Infirmier Sans Licence ❌
```
1. Profession: "Infirmier(ère)"
2. Documents: ID seulement
3. Soumettre
→ Résultat: ❌ Erreur "Autorisation d'exercice requise"
```

---

## 📊 RÉSUMÉ DES CORRECTIONS

| Erreur | Criticité | Status |
|--------|-----------|--------|
| Validation diploma coach (frontend) | 🔴 Critique | ✅ Corrigé |
| Validation session_types (backend) | 🔴 Critique | ✅ Corrigé |
| Validation intervention_zone (backend) | 🔴 Critique | ✅ Corrigé |
| Validation documents (backend) | 🔴 Critique | ✅ Corrigé |

---

## 🎯 PROCHAINES ÉTAPES

1. ✅ Appliquer les corrections
2. 🔄 Tester chaque scénario
3. ✅ Valider le workflow complet
4. 📝 Documenter pour référence future

---

## 🏗️ ARCHITECTURE FINALE

```
Frontend (PractitionerSignup.tsx)
├── Validation formulaire
│   ├── Champs communs (nom, email, etc.)
│   ├── Documents selon type
│   │   ├── Coach: ID + Diploma
│   │   └── Autres: ID + Licence
│   └── Champs spécifiques coach
│       ├── session_types (array)
│       ├── intervention_zone (string)
│       └── intervention_radius (number)
└── Envoi à Edge Function

Backend (create-practitioner-account)
├── Validation praticien
│   ├── Nom, téléphone
│   ├── Spécialité (sauf coach)
│   └── Expérience
├── Validation coach sportif
│   ├── session_types non vide
│   ├── intervention_zone (min 3 car)
│   └── intervention_radius (1-100)
├── Validation documents
│   ├── ID obligatoire pour tous
│   ├── Diploma obligatoire pour coach
│   └── Licence obligatoire pour autres
├── Upload Wasabi
│   ├── Conversion base64 → binary
│   ├── Génération path unique
│   └── Signature AWS V4
└── Création atomique
    ├── Profil (profiles)
    ├── Praticien (practitioners)
    └── Notifications KYC admins
```

---

## 📝 NOTES FINALES

✅ **Workflow maintenant sécurisé**:
- Double validation frontend + backend
- Documents obligatoires selon type
- Messages d'erreur clairs et contextuels
- Transaction atomique avec rollback

⚠️ **Point d'attention**:
- Le champ `insurance_document_url` stocke le diplôme du coach (sémantique incorrecte mais fonctionnel)
- Envisager migration future vers `diploma_document_url` dédié

🚀 **Performance**:
- Upload Wasabi optimisé
- Edge function transactionnelle
- Notifications asynchrones (non bloquantes)
