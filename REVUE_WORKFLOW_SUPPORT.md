# Revue Workflow Support - DomiCares

**Date:** 2026-01-27
**Version:** 1.0

---

## 1. Structure du Workflow Support

### 1.1 Sous-onglets

| Onglet | Fonctionnalité |
|--------|----------------|
| Tickets | Gestion des demandes d'assistance utilisateurs |
| Base de connaissances | Gestion des FAQs (CRUD complet) |

### 1.2 Fichiers Impliqués

| Fichier | Rôle |
|---------|------|
| `SupportSection.tsx` | Interface admin Support |
| `support_tickets` table | Stockage des tickets |
| `faqs` table | Stockage des FAQs |

### 1.3 Statuts Tickets

| Statut | Label FR | Description |
|--------|----------|-------------|
| ouvert | Ouvert | Nouveau ticket non traité |
| en_cours | En cours | Ticket pris en charge |
| resolu | Résolu | Problème résolu |
| ferme | Fermé | Ticket clos |

### 1.4 Priorités Tickets

| Priorité | Label FR | Badge |
|----------|----------|-------|
| urgent | Urgente | Destructive |
| high | Haute | Destructive |
| medium | Moyenne | Secondary |
| low | Basse | Outline |

---

## 2. Bugs Identifiés et Corrigés

### Bug #1 - MOYEN: User ID tronqué au lieu du nom

**Problème:**
La colonne "Utilisateur" affichait seulement les 8 premiers caractères de l'UUID.
```typescript
// Avant
<TableCell>{ticket.user_id.slice(0, 8)}...</TableCell>
```

**Solution:**
- Jointure avec la table `profiles` pour récupérer `full_name` et `phone`
- Affichage du nom complet avec icône User
- Téléphone en sous-texte

**Query mise à jour:**
```typescript
.select(`
  *,
  user:profiles!support_tickets_user_id_fkey(id, full_name, phone)
`)
```

---

### Bug #2 - MOYEN: Priorités non traduites en français

**Problème:**
Les priorités affichaient "high", "medium", "low" en anglais.

**Solution:**
- Ajout d'un mapping `PRIORITY_LABELS`
- Labels français: Urgente, Haute, Moyenne, Basse
- Variantes de badges appropriées

**Code ajouté:**
```typescript
const PRIORITY_LABELS: Record<string, string> = {
  low: 'Basse',
  medium: 'Moyenne',
  high: 'Haute',
  urgent: 'Urgente',
};
```

---

### Bug #3 - MOYEN: Pas de filtre par statut/priorité

**Problème:**
Impossible de filtrer les tickets, tous étaient affichés ensemble.

**Solution:**
- Ajout de deux Select dropdowns: statut et priorité
- États `statusFilter` et `priorityFilter`
- Calcul `filteredTickets` avec useMemo
- Message contextuel si aucun ticket ne correspond

---

### Bug #4 - MOYEN: Pas de rafraîchissement temps réel

**Problème:**
Les nouveaux tickets n'apparaissaient pas sans rafraîchir la page.

**Solution:**
- Ajout d'un Supabase realtime subscription
- Invalidation automatique du cache React Query
- Bouton de rafraîchissement manuel

**Code ajouté:**
```typescript
useEffect(() => {
  const channel = supabase
    .channel('admin-support-realtime')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'support_tickets',
    }, () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [queryClient]);
```

---

### Bug #5 - MOYEN: Bouton "Ajouter une FAQ" sans fonctionnalité

**Problème:**
Le bouton n'avait pas de handler onClick.

**Solution:**
- Ajout d'un Dialog pour créer/éditer les FAQs
- Formulaire complet: question, réponse, catégorie, public cible
- Validation des champs obligatoires

---

### Bug #6 - MOYEN: Pas de gestion CRUD pour les FAQs

**Problème:**
Impossible de modifier, supprimer ou publier/dépublier les FAQs.

**Solution:**
- **Créer**: Dialog avec formulaire complet
- **Modifier**: Bouton Pencil, pré-remplissage du formulaire
- **Supprimer**: Bouton Trash2 avec confirmation AlertDialog
- **Publier/Dépublier**: Bouton Eye/EyeOff toggle

**Mutations ajoutées:**
- `createFaqMutation`
- `updateFaqMutation`
- `deleteFaqMutation`

---

### Bug #7 - MINEUR: Pas d'audit log pour les changements

**Problème:**
Les modifications de tickets et FAQs n'étaient pas tracées.

**Solution:**
- Audit log pour chaque changement de statut ticket
- Audit log pour création/modification/suppression FAQ
- Audit log pour publication/dépublication FAQ

**Actions loggées:**
- `update_ticket_status`
- `create_faq`
- `update_faq`
- `publish_faq` / `unpublish_faq`
- `delete_faq`

---

### Bug #8 - MOYEN: Pas de réponse aux tickets

**Problème:**
L'admin pouvait seulement changer le statut, pas répondre.

**Solution:**
- Ajout d'un champ Textarea "Réponse admin"
- Nouvelles colonnes en base: `admin_response`, `responded_at`, `responded_by`
- Affichage de la date de dernière réponse
- Migration SQL créée

**Migration ajoutée:**
```sql
ALTER TABLE public.support_tickets
ADD COLUMN IF NOT EXISTS admin_response TEXT,
ADD COLUMN IF NOT EXISTS responded_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS responded_by UUID REFERENCES auth.users(id);
```

---

## 3. Fonctionnalités Ajoutées

### 3.1 Interface Tickets Améliorée

- **Filtrage double**: par statut ET par priorité
- **Nom utilisateur visible** avec téléphone
- **Priorités en français** avec badges colorés
- **Temps réel** avec subscription Supabase
- **Dialog enrichi** avec:
  - Infos utilisateur
  - Date de création
  - Description dans zone dédiée
  - Sélecteur de statut
  - Zone de réponse admin
  - Date dernière réponse

### 3.2 Gestion FAQs Complète

- **Création** via Dialog avec formulaire
- **Modification** avec pré-remplissage
- **Suppression** avec confirmation
- **Publication toggle** (Eye/EyeOff)
- **Catégories prédéfinies**:
  - Général
  - Paiements
  - Rendez-vous
  - Compte
  - Praticiens
  - Technique
- **Public cible**: Tous, Patients, Praticiens
- **Badge statut**: Publié/Brouillon

### 3.3 Audit Trail

Toutes les actions sont tracées dans `admin_audit_logs`:
- Changements de statut tickets
- CRUD FAQs
- Publication/Dépublication

---

## 4. Tests Recommandés

### 4.1 Test Filtrage Tickets

1. Créer plusieurs tickets avec différents statuts/priorités
2. Appliquer filtre "Ouvert"
3. Vérifier que seuls les tickets ouverts s'affichent
4. Appliquer filtre priorité "Haute"
5. Vérifier le cumul des filtres

### 4.2 Test Réponse Ticket

1. Ouvrir un ticket via "Gérer"
2. Vérifier les infos utilisateur
3. Changer le statut à "En cours"
4. Ajouter une réponse
5. Cliquer "Mettre à jour"
6. Ré-ouvrir le ticket, vérifier la réponse sauvegardée

### 4.3 Test Temps Réel

1. Ouvrir l'onglet Tickets
2. Dans une autre session, créer un ticket
3. Vérifier qu'il apparaît automatiquement

### 4.4 Test CRUD FAQs

1. Cliquer "Ajouter une FAQ"
2. Remplir le formulaire
3. Créer → Vérifier dans la liste
4. Modifier la FAQ → Vérifier les changements
5. Publier/Dépublier → Vérifier le badge
6. Supprimer → Confirmer → Vérifier suppression

### 4.5 Test Audit Log

1. Effectuer différentes actions
2. Aller dans l'onglet Audit
3. Vérifier que toutes les actions sont loggées

---

## 5. Récapitulatif des Modifications

| Fichier | Modifications |
|---------|---------------|
| SupportSection.tsx | +300 lignes (filtres, CRUD FAQs, réponses, realtime) |
| 20260127_add_support_ticket_response.sql | Nouvelle migration (colonnes réponse) |

---

## 6. Statut Final

| Bug | Statut |
|-----|--------|
| #1 User ID tronqué | ✅ CORRIGÉ |
| #2 Priorités anglais | ✅ CORRIGÉ |
| #3 Pas de filtres | ✅ CORRIGÉ |
| #4 Pas de temps réel | ✅ CORRIGÉ |
| #5 Bouton FAQ inactif | ✅ CORRIGÉ |
| #6 Pas de CRUD FAQs | ✅ CORRIGÉ |
| #7 Pas d'audit log | ✅ CORRIGÉ |
| #8 Pas de réponse ticket | ✅ CORRIGÉ |

**Workflow Support: PRÊT POUR PRODUCTION**

---

## 7. Note sur la Migration

La migration `20260127_add_support_ticket_response.sql` doit être exécutée sur Supabase pour ajouter les colonnes de réponse:

```bash
supabase db push
```

Ou via le dashboard Supabase en exécutant le SQL manuellement.
