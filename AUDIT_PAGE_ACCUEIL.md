# 🏠 AUDIT PAGE D'ACCUEIL - PROMPTS LOVABLE.DEV

**Date:** 2025-11-29
**Fichiers analysés:** Index.tsx, Header.tsx, Footer.tsx, UserTypeCard.tsx
**Total erreurs:** 22 erreurs identifiées

---

## 🔴 ERREURS CRITIQUES - VUE (8 prompts)

### PROMPT #1 - Stats hardcodées et fausses ⚠️ BLOQUANT
**Fichier:** Index.tsx lignes 114-127
**Problème:** Les stats "500+ praticiens", "98% satisfaction" sont inventées et hardcodées
**Impact:** Tromperie utilisateur, problèmes légaux potentiels

### PROMPT #2 - getDashboardPathForUser sans gestion erreur ⚠️ BLOQUANT
**Fichier:** Index.tsx ligne 58-61
**Problème:** Fonction async sans try/catch, peut crasher si échec
**Impact:** Application bloque pour utilisateur connecté

### PROMPT #3 - localStorage.clear() trop agressif ⚠️ BLOQUANT
**Fichier:** Header.tsx lignes 20-26
**Problème:** Efface TOUT le localStorage, même d'autres apps
**Impact:** Perte de données utilisateur d'autres sites

### PROMPT #4 - Navigation dashboards non authentifiés
**Fichier:** Header.tsx lignes 58-68, 162-172
**Problème:** Liens vers dashboards accessibles même non connecté
**Impact:** Utilisateur confus, redirections inutiles

### PROMPT #5 - Menu mobile ne se ferme pas
**Fichier:** Header.tsx lignes 144-229
**Problème:** Après clic sur un lien, le menu reste ouvert
**Impact:** Mauvaise UX mobile

### PROMPT #6 - Images sans lazy loading
**Fichier:** Index.tsx ligne 132-136
**Problème:** Hero image chargée immédiatement
**Impact:** Performance page lente

### PROMPT #7 - Pas de SEO metadata
**Fichier:** Index.tsx
**Problème:** Aucun title, description, og:image pour SEO
**Impact:** Mauvais référencement Google

### PROMPT #8 - Query isPractitioner dans Footer
**Fichier:** Footer.tsx lignes 12-24
**Problème:** Query exécutée dans chaque render du footer
**Impact:** Performance, queries inutiles

---

## 🟠 ERREURS HAUTES - LOGIQUE (7 prompts)

### PROMPT #9 - Features hardcodées non vérifiées
**Fichier:** Index.tsx lignes 16-30
**Problème:** Features listées sans vérifier si elles existent vraiment
**Impact:** Promesses non tenues

### PROMPT #10 - Routes hardcodées
**Fichier:** Index.tsx lignes 247, 270
**Problème:** /search-practitioners et /search-coaches en dur
**Impact:** Maintenance difficile si routes changent

### PROMPT #11 - Pas de vérification image heroImage
**Fichier:** Index.tsx ligne 8
**Problème:** Import sans fallback si image manquante
**Impact:** Page cassée si image supprimée

### PROMPT #12 - Boutons désactivés sans explication
**Fichier:** Footer.tsx lignes 80-104
**Problème:** Boutons grisés mais pas de tooltip expliquant pourquoi
**Impact:** Utilisateur confus

### PROMPT #13 - hover:scale-105 trop agressif
**Fichier:** UserTypeCard.tsx ligne 25
**Problème:** Agrandissement de 5% au hover peut casser le layout
**Impact:** Cards qui se superposent

### PROMPT #14 - Pas de loading state getDashboardPathForUser
**Fichier:** Index.tsx ligne 58-61
**Problème:** Bouton "Mon tableau de bord" sans indicateur de chargement
**Impact:** Utilisateur clique plusieurs fois

### PROMPT #15 - Pas de gestion erreur isPractitioner query
**Fichier:** Footer.tsx ligne 12-24
**Problème:** Query sans onError
**Impact:** Footer peut crasher

---

## 🟡 ERREURS MOYENNES - UX (7 prompts)

### PROMPT #16 - Pas de StructuredData JSON-LD
**Fichier:** Index.tsx
**Problème:** Pas de données structurées pour Google
**Impact:** Rich snippets non affichés

### PROMPT #17 - Bouton urgence 112 sans vérification
**Fichier:** Header.tsx ligne 92-97
**Problème:** tel:112 peut ne pas fonctionner sur tous les appareils
**Impact:** Utilisateur ne peut pas appeler

### PROMPT #18 - Section "How it Works" trop générique
**Fichier:** Index.tsx lignes 196-229
**Problème:** Textes génériques, pas de personnalisation
**Impact:** Peu engageant

### PROMPT #19 - CTA dupliqué
**Fichier:** Index.tsx lignes 68-87 et 364-377
**Problème:** Bouton "Je suis patient" répété 2 fois
**Impact:** Redondant

### PROMPT #20 - Pas de scroll smooth vers sections
**Fichier:** Index.tsx
**Problème:** Liens vers #services, #how-it-works ne scrollent pas smooth
**Impact:** Navigation saccadée

### PROMPT #21 - Année hardcodée dans footer
**Fichier:** Footer.tsx ligne 133
**Problème:** "© 2024" en dur, devrait être dynamique
**Impact:** Obsolète chaque année

### PROMPT #22 - Hero image pas optimisée
**Fichier:** Index.tsx ligne 132-136
**Problème:** Image JPG sans srcset responsive
**Impact:** Taille non adaptée mobile/desktop
