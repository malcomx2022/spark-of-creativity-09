# Revue Workflow KYC - DomiCares

**Date:** 2026-01-27
**Version:** 1.0

---

## 1. Analyse du Workflow KYC

### 1.1 Flux de Validation

```
Inscription Praticien
        ↓
   kyc_status = 'pending'
        ↓
   Notification admins (kyc_pending)
        ↓
   Admin review dans KYCQueue
        ↓
   ┌─────────────────────────────────────┐
   │          DÉCISION ADMIN             │
   ├─────────────┬───────────┬───────────┤
   │  Approuver  │ Incomplet │  Refuser  │
   │      ↓      │     ↓     │     ↓     │
   │  approved   │incomplete │ rejected  │
   │can_accept=T │can_accept=F│can_accept=F│
   └─────────────┴───────────┴───────────┘
        ↓
   Notification praticien (email + SMS)
```

### 1.2 Fichiers Impliqués

| Fichier | Rôle |
|---------|------|
| `KYCQueue.tsx` | Interface admin pour validation |
| `DocumentsSection.tsx` | Vue praticien des documents KYC |
| `create-practitioner-account/index.ts` | Inscription praticien |
| `send-kyc-status-notification/index.ts` | Notifications email/SMS |
| `PractitionerDashboard.tsx` | Dashboard praticien |

---

## 2. Bugs Identifiés et Corrigés

### Bug #1 - CRITIQUE: Pas de re-upload documents (DocumentsSection)

**Problème:**
Quand un praticien avait son KYC marqué comme "incomplet", il ne pouvait pas téléverser de nouveaux documents depuis son dashboard.

**Solution:**
- Ajout de boutons d'upload/mise à jour pour chaque document
- Affichés uniquement si `kyc_status === 'incomplete'` ou `'rejected'`
- Upload via `uploadUserDocument()` avec validation (type, taille)
- Mise à jour automatique de la base de données

**Fichier:** `src/components/dashboard/practitioner/DocumentsSection.tsx`

---

### Bug #2 - CRITIQUE: Pas de re-soumission KYC (DocumentsSection)

**Problème:**
Après avoir complété ses documents, le praticien ne pouvait pas notifier les admins que son dossier était prêt à être réexaminé.

**Solution:**
- Ajout d'un bouton "Soumettre pour validation"
- Remet `kyc_status` à `'pending'`
- Efface le commentaire précédent
- Envoie une notification aux admins (`kyc_pending`)

**Fichier:** `src/components/dashboard/practitioner/DocumentsSection.tsx`

---

### Bug #3 - MOYEN: Type de praticien non affiché (KYCQueue)

**Problème:**
L'admin ne voyait pas si le praticien était un coach sportif ou un praticien de santé dans la file d'attente KYC.

**Solution:**
- Ajout d'un badge "Coach Sportif" sous le nom si `practitioner_type === 'coach_sportif'`
- Style bleu distinctif

**Fichier:** `src/components/admin/KYCQueue.tsx`

---

### Bug #4 - MOYEN: Index utilisé comme key (DocumentsSection)

**Problème:**
```typescript
// Avant
{practitionerData.certifications.map((cert: string, index: number) => (
  <Badge key={index} variant="outline">
```

L'utilisation de l'index comme clé React peut causer des bugs lors de réordonnancements.

**Solution:**
```typescript
// Après
{practitionerData.certifications.map((cert: string) => (
  <Badge key={cert} variant="outline">
```

**Fichier:** `src/components/dashboard/practitioner/DocumentsSection.tsx`

---

### Bug #5 - MINEUR: Numéro support placeholder (send-kyc-status-notification)

**Problème:**
Le template email de refus affichait `📱 Téléphone : +229 XX XX XX XX`.

**Solution:**
Suppression de la ligne téléphone, conservation uniquement de l'email support.

**Fichier:** `supabase/functions/send-kyc-status-notification/index.ts`

---

### Bug #6 - MOYEN: Pas d'alerte documents expirés (KYCQueue)

**Problème:**
L'admin pouvait approuver un praticien ayant des documents expirés sans avertissement.

**Solution:**
- Ajout d'une vérification des dates d'expiration dans le dialog d'approbation
- Affiche un warning rouge si documents expirés:
  - Pièce d'identité
  - Autorisation d'exercice
  - Assurance
- L'admin peut toujours approuver mais est averti

**Fichier:** `src/components/admin/KYCQueue.tsx`

---

### Bug #7 - MINEUR: Commentaire KYC précédent non visible (KYCQueue)

**Problème:**
Quand un dossier revenait en 'incomplete', l'admin ne voyait pas facilement le commentaire précédent dans la file.

**Solution:**
- Affichage du commentaire précédent (tronqué à 50 caractères) sous la spécialité
- Style orange italic pour différencier

**Fichier:** `src/components/admin/KYCQueue.tsx`

---

## 3. Fonctionnalités Ajoutées

### 3.1 Interface Re-upload Documents

```typescript
// Nouveau flux praticien
1. Praticien reçoit notification "KYC incomplet"
2. Va sur Dashboard > Profil > Documents KYC
3. Voit message orange avec commentaire admin
4. Clique sur bouton upload/mise à jour sur chaque document
5. Téléverse nouveau document (PDF, JPG, PNG - max 5Mo)
6. Document mis à jour dans Wasabi + DB
7. Clique "Soumettre pour validation"
8. Status → 'pending', notification envoyée aux admins
```

### 3.2 Validation Upload Frontend

- Types acceptés: PDF, JPG, JPEG, PNG
- Taille max: 5 Mo
- Feedback utilisateur (loading, succès, erreur)
- Rafraîchissement automatique de l'affichage

### 3.3 Alerte Documents Expirés Admin

- Vérification automatique des 3 dates d'expiration
- Warning visuel rouge dans dialog approbation
- Liste des documents problématiques
- Demande de confirmation

---

## 4. Tests Recommandés

### 4.1 Scénario: Re-upload Document

1. Créer un praticien avec KYC pending
2. Admin marque comme incomplet avec commentaire
3. Vérifier notification praticien (email/SMS)
4. Praticien voit message orange sur dashboard
5. Praticien upload nouveau document
6. Vérifier que document est dans Wasabi
7. Praticien clique "Soumettre pour validation"
8. Vérifier status → pending
9. Vérifier notification admin

### 4.2 Scénario: Approbation avec Documents Expirés

1. Créer praticien avec document expiré (date passée)
2. Admin ouvre dialog approbation
3. Vérifier warning rouge affiché
4. Approuver quand même
5. Vérifier que l'approbation fonctionne

### 4.3 Scénario: Affichage Coach Sportif

1. Créer praticien type coach_sportif
2. Vérifier badge bleu dans KYCQueue
3. Vérifier documents spécifiques affichés (diplôme vs licence)

---

## 5. Récapitulatif des Modifications

| Fichier | Lignes modifiées | Type |
|---------|-----------------|------|
| DocumentsSection.tsx | +200 lignes | Feature + Bugfix |
| KYCQueue.tsx | +50 lignes | Feature + Bugfix |
| send-kyc-status-notification | -1 ligne | Bugfix |

---

## 6. Statut Final

| Bug | Statut |
|-----|--------|
| #1 Re-upload documents | ✅ CORRIGÉ |
| #2 Re-soumission KYC | ✅ CORRIGÉ |
| #3 Type praticien KYCQueue | ✅ CORRIGÉ |
| #4 Key certifications | ✅ CORRIGÉ |
| #5 Numéro placeholder | ✅ CORRIGÉ |
| #6 Alerte documents expirés | ✅ CORRIGÉ |
| #7 Commentaire précédent | ✅ CORRIGÉ |

**Workflow KYC: PRÊT POUR PRODUCTION**
