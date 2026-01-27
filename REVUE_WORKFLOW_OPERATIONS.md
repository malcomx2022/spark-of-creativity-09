# Revue Workflow Operations - DomiCares

**Date:** 2026-01-27
**Version:** 1.0

---

## 1. Structure du Workflow Operations

### 1.1 Sous-onglets

| Onglet | Fonctionnalité |
|--------|----------------|
| RDV en temps réel | Suivi des RDV du jour avec filtrage |
| Modération avis | Masquer/afficher les avis clients |
| Litiges | Gestion des conflits patient/praticien |

### 1.2 Fichiers Impliqués

| Fichier | Rôle |
|---------|------|
| `OperationsSection.tsx` | Interface admin Operations |
| `ConsultationConfirmation.tsx` | Création litige par patient |
| `useReviews.ts` | Hook pour les avis |

---

## 2. Bugs Identifiés et Corrigés

### Bug #1 - MOYEN: RDV sans rafraîchissement temps réel

**Problème:**
Les RDV du jour ne se mettaient pas à jour automatiquement quand leur statut changeait.

**Solution:**
- Ajout d'un Supabase realtime subscription sur la table `appointments`
- Filtre sur la date du jour
- Invalidation automatique du cache React Query

**Code ajouté:**
```typescript
useEffect(() => {
  const channel = supabase
    .channel('admin-appointments-realtime')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'appointments',
      filter: `date=eq.${today}`,
    }, () => {
      queryClient.invalidateQueries({ queryKey: ['admin-appointments-today'] });
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [queryClient]);
```

---

### Bug #2 - MOYEN: Avis sans info praticien/patient

**Problème:**
La modération avis n'affichait que le commentaire et la note, sans identifier le patient ou le praticien.

**Solution:**
- Jointure avec tables `practitioners` et `profiles`
- Affichage du nom patient avec icône User
- Affichage du nom praticien + spécialité avec icône Stethoscope

**Query mise à jour:**
```typescript
.select(`
  *,
  practitioner:practitioners!reviews_practitioner_id_fkey(id, name, specialty),
  patient:profiles!reviews_patient_id_fkey(id, full_name)
`)
```

---

### Bug #3 - MOYEN: Litiges sans info RDV/patient/praticien

**Problème:**
Les litiges n'affichaient que le sujet et la description, sans contexte sur le RDV concerné.

**Solution:**
- Jointure avec tables `profiles` (raised_by) et `appointments`
- Nouvelles colonnes: "Signalé par" et "RDV concerné"
- Affichage des détails dans le dialog de gestion

**Query mise à jour:**
```typescript
.select(`
  *,
  raised_by_profile:profiles!disputes_raised_by_fkey(id, full_name, phone),
  appointment:appointments!disputes_appointment_id_fkey(
    id, date, time, specialty, patient_name, practitioner_name
  )
`)
```

---

### Bug #4 - MOYEN: Pas de notification admin pour nouveaux litiges

**Problème:**
Quand un patient créait un litige via `ConsultationConfirmation`, aucun admin n'était notifié.

**Solution:**
- Après création du litige, récupération des admins (super_admin, ops, support)
- Création de notifications avec lien vers `/admin?tab=operations`

**Fichier:** `ConsultationConfirmation.tsx`

---

### Bug #5 - MINEUR: Statuts RDV non traduits en français

**Problème:**
Les statuts affichaient "confirmed", "completed", "cancelled" en anglais.

**Solution:**
- Mapping des statuts vers des labels français:
  - pending → En attente
  - confirmed → Confirmé
  - completed → Terminé
  - cancelled → Annulé
  - no_show → Absence

---

### Bug #6 - MOYEN: Pas de filtre par statut pour les RDV

**Problème:**
Impossible de filtrer les RDV par statut (ex: voir uniquement les confirmés).

**Solution:**
- Ajout d'un Select avec options: Tous, En attente, Confirmés, Terminés, Annulés
- Bouton de rafraîchissement manuel
- Query dynamique selon le filtre sélectionné

---

### Bug #7 - MOYEN: Champ résolution litige non utilisé dans UI

**Problème:**
Le champ `resolution` existait dans la table `disputes` mais n'était pas utilisable depuis l'interface.

**Solution:**
- Ajout d'un Textarea "Commentaire de résolution"
- Obligatoire pour marquer un litige comme "Résolu"
- Enregistrement avec `resolved_at` timestamp
- Affichage de la résolution précédente si existante

---

### Bug #8 - MOYEN: Pas d'audit log pour actions litiges

**Problème:**
Les changements de statut des litiges n'étaient pas tracés dans les logs d'audit.

**Solution:**
- Ajout d'un log dans `admin_audit_logs` à chaque changement de statut
- Détails: status, resolution
- Entity type: 'dispute'

**Code ajouté:**
```typescript
await supabase.from('admin_audit_logs').insert({
  admin_id: user.id,
  action: `Dispute ${status}`,
  entity_type: 'dispute',
  entity_id: id,
  details: { status, resolution },
});
```

---

## 3. Fonctionnalités Ajoutées

### 3.1 Interface RDV Améliorée

- **Filtrage par statut** avec Select dropdown
- **Bouton rafraîchissement** manuel
- **Mise à jour temps réel** automatique
- **Statuts en français** avec badges colorés

### 3.2 Modération Avis Améliorée

- **Info patient** (nom)
- **Info praticien** (nom + spécialité)
- **Badge "Modéré"** si déjà traité
- **Icônes distinctives** User / Stethoscope

### 3.3 Gestion Litiges Complète

- **Colonnes additionnelles**: Signalé par, RDV concerné
- **Dialog enrichi** avec contexte complet:
  - Qui a signalé (nom + téléphone)
  - RDV concerné (date, heure, praticien)
  - Description du problème
- **Gestion des statuts** via boutons:
  - Prendre en charge → investigating
  - Marquer résolu → resolved (requiert commentaire)
  - Rouvrir → open
  - Fermer → closed
- **Commentaire de résolution** enregistré
- **Historique** des résolutions affichées
- **Audit trail** complet

### 3.4 Notifications Admin

Nouveau type de notification: `dispute_created`
- Envoyée aux admins (super_admin, ops, support)
- Contient le nom du praticien concerné
- Lien direct vers l'onglet Operations

---

## 4. Tests Recommandés

### 4.1 Test RDV Temps Réel

1. Ouvrir l'onglet RDV en temps réel
2. Dans une autre session, créer/modifier un RDV pour aujourd'hui
3. Vérifier que l'affichage se met à jour automatiquement

### 4.2 Test Filtrage RDV

1. Créer plusieurs RDV avec différents statuts
2. Tester chaque option de filtre
3. Vérifier que seuls les RDV correspondants s'affichent

### 4.3 Test Modération Avis

1. Créer un avis via patient
2. Vérifier que patient et praticien sont affichés
3. Masquer l'avis, vérifier le badge

### 4.4 Test Création Litige

1. Patient: Ouvrir confirmation consultation
2. Cliquer "Non, j'ai un problème"
3. Remplir description et soumettre
4. Admin: Vérifier notification reçue
5. Admin: Vérifier litige visible avec toutes les infos

### 4.5 Test Résolution Litige

1. Ouvrir un litige
2. Cliquer "Prendre en charge"
3. Ajouter commentaire de résolution
4. Cliquer "Marquer résolu"
5. Vérifier que la résolution est enregistrée
6. Vérifier l'audit log

---

## 5. Récapitulatif des Modifications

| Fichier | Modifications |
|---------|--------------|
| OperationsSection.tsx | +150 lignes (realtime, filtres, jointures, UI) |
| ConsultationConfirmation.tsx | +20 lignes (notification admin) |

---

## 6. Statut Final

| Bug | Statut |
|-----|--------|
| #1 RDV temps réel | ✅ CORRIGÉ |
| #2 Avis sans info | ✅ CORRIGÉ |
| #3 Litiges sans contexte | ✅ CORRIGÉ |
| #4 Notification admin | ✅ CORRIGÉ |
| #5 Statuts français | ✅ CORRIGÉ |
| #6 Filtre RDV | ✅ CORRIGÉ |
| #7 Résolution litige | ✅ CORRIGÉ |
| #8 Audit litiges | ✅ CORRIGÉ |

**Workflow Operations: PRÊT POUR PRODUCTION**
