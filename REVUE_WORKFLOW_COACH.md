# Revue Fonctionnelle - Workflow Coach Sportif

**Date:** 2026-01-27
**Version:** 1.0

---

## 1. Architecture du Workflow

### 1.1 Vue d'ensemble

Le workflow coach sportif comprend deux volets principaux:
1. **Séances de groupe** - Création, inscription, paiement et gestion
2. **Rendez-vous individuels** - Réutilisation du workflow praticien standard

### 1.2 Workflow Séances de Groupe - Côté Coach

```
PHASE 1: CREATION SEANCE (CreateGroupSessionDialog.tsx)
    |
    v
[Validation Zod] --> [Check conflit horaire] --> [Insert group_sessions]
    |
    v
PHASE 2: GESTION SEANCE (CoachDashboard.tsx / SessionsTab.tsx)
    |
    v
[Voir inscriptions] --> [Confirmer séance] --> [Annuler si besoin]
    |
    v
PHASE 3: APRES SEANCE
    |
    v
[Marquer terminée] --> [Revenus calculés automatiquement]
```

### 1.3 Workflow Séances de Groupe - Côté Patient

```
PHASE 1: RECHERCHE (CoachSearch.tsx)
    |
    v
[Liste séances disponibles] --> [Clic "S'inscrire"]
    |
    v
PHASE 2: INSCRIPTION (RegisterSessionDialog.tsx → GroupSessionPaymentWidget.tsx)
    |
    v
[Pré-vérifications:                    ]
[  - KYC coach                          ]
[  - Séance non passée                  ]
[  - Places disponibles                 ]
[  - Patient pas déjà inscrit           ]
    |
    v
[Sélection méthode paiement] --> [register-group-session edge function]
    |                                      |
    v                                      v
[Réservation atomique place]        [Création payment FedaPay]
    |                                      |
    v                                      v
[Insert group_session_participants] [Widget FedaPay affiché]
    |
    v
PHASE 3: PAIEMENT
    |
    v
[Patient paie via Mobile Money] --> [payment-webhook]
    |                                      |
    v                                      v
[onComplete FedaPay]              [Update payment status]
    |                                      |
    v                                      v
[Afficher succès]                 [Update participant status → 'paid']
    |
    v
PHASE 4: SUIVI (PatientGroupSessionsSection.tsx)
    |
    v
[Voir séances: En attente paiement | À venir | Historique]
    |
    v
[Retry paiement si échec] (RetryGroupSessionPaymentWidget.tsx)
```

### 1.4 Workflow Rendez-vous Individuels

Identique au workflow praticien standard:
```
[Patient demande RDV] --> [Coach accepte/refuse] --> [Patient paie] --> [RDV confirmé]
```

### 1.5 Tables de données

| Table | Rôle |
|-------|------|
| `group_sessions` | Séances de groupe créées par les coachs |
| `group_session_participants` | Inscriptions des patients aux séances |
| `payments` | Paiements (appointment_id format: `group_session_{sessionId}_{participantId}`) |
| `appointments` | Rendez-vous individuels |
| `practitioners` | Profil coach (practitioner_type = 'coach_sportif') |

### 1.6 Statuts des séances

| Statut | Description | Actions possibles |
|--------|-------------|-------------------|
| `planifiee` | Séance créée, en attente inscriptions | Confirmer, Annuler, Modifier |
| `confirmee` | Séance confirmée par le coach | Annuler |
| `terminee` | Séance passée | Aucune |
| `annulee` | Séance annulée | Aucune |

### 1.7 Statuts paiement participant

| Statut | Description |
|--------|-------------|
| `pending` | Inscription créée, paiement en attente |
| `paid` | Paiement confirmé |
| `failed` | Paiement échoué (peut retry) |
| `cancelled` | Inscription annulée |

### 1.8 Fichiers impliqués

| Fichier | Rôle |
|---------|------|
| `src/pages/CoachDashboard.tsx` | Dashboard principal coach |
| `src/pages/CoachSearch.tsx` | Recherche coachs et séances (patient) |
| `src/components/coach/CreateGroupSessionDialog.tsx` | Création séance |
| `src/components/coach/EditGroupSessionDialog.tsx` | Modification séance |
| `src/components/coach/GroupSessionForm.tsx` | Formulaire réutilisable |
| `src/components/coach/GroupSessionCard.tsx` | Carte séance |
| `src/components/coach/GroupSessionPaymentWidget.tsx` | Widget paiement inscription |
| `src/components/coach/RetryGroupSessionPaymentWidget.tsx` | Widget retry paiement |
| `src/components/dashboard/PatientGroupSessionsSection.tsx` | Vue patient séances |
| `src/components/dashboard/coach/tabs/SessionsTab.tsx` | Onglet séances coach |
| `src/components/dashboard/coach/tabs/AppointmentsTab.tsx` | Onglet RDV individuels |
| `src/components/dashboard/coach/tabs/AvailabilityTab.tsx` | Disponibilités |
| `src/hooks/useGroupSessions.ts` | CRUD séances |
| `src/hooks/useGroupSessionRegistration.ts` | Inscription séance |
| `src/hooks/usePatientGroupSessions.ts` | Séances du patient |
| `src/hooks/useRetryGroupSessionPayment.ts` | Retry paiement |
| `src/lib/session-validation.ts` | Validation Zod + constantes |
| `supabase/functions/register-group-session/index.ts` | Edge function inscription |
| `supabase/functions/retry-group-session-payment/index.ts` | Edge function retry |
| `supabase/functions/payment-webhook/index.ts` | Webhook paiement (gère group_session_) |

---

## 2. Analyse des Bugs Identifiés

### Bug #1 - CRITIQUE: Pas d'indication visuelle du statut KYC coach

**Fichiers:** `src/pages/CoachSearch.tsx`, `src/components/coach/GroupSessionCard.tsx`

**Problème:**
```typescript
// CoachSearch.tsx - Pas de vérification KYC visible
{paginatedSessions.map((session) => {
  const coach = coaches.find(c => c.id === session.coach_id);
  // Pas de vérification si coach.kyc_status === 'approved'
  return <Card>...</Card>
})}
```

Le backend vérifie le KYC dans `register-group-session`:
```typescript
if (!coach || coach.kyc_status !== 'approved') {
  throw new Error('Le coach n\'est pas encore vérifié...');
}
```

Mais l'utilisateur ne comprend pas pourquoi l'inscription échoue.

**Impact:**
- Expérience utilisateur frustrante
- Le patient voit des séances auxquelles il ne peut pas s'inscrire
- Message d'erreur peu explicite

**Correction requise:**
Ajouter un badge/indicateur de vérification et filtrer ou griser les séances des coachs non vérifiés.

---

### Bug #2 - CRITIQUE: Calcul places restantes ignore les inscriptions pending

**Fichier:** `src/pages/CoachSearch.tsx:230`

**Problème:**
```typescript
const spotsLeft = (session.max_participants || 0) - (session.current_participants || 0);
```

Le `current_participants` est mis à jour par un trigger mais peut ne pas inclure les inscriptions `pending` en temps réel, créant un risque de surbooking visuel.

**Impact:**
- L'utilisateur peut voir "5 places" alors qu'en réalité il n'y en a plus
- Frustration lors de l'échec de réservation

**Correction requise:**
La RPC `reserve_group_session_spot` gère l'atomicité côté backend, mais le frontend devrait afficher "(~X places)" ou rafraîchir après chaque inscription.

---

### Bug #3 - MOYEN: Coach ne voit pas les participants en attente de paiement

**Fichier:** `src/components/dashboard/coach/tabs/SessionsTab.tsx`

**Problème:**
Le coach voit uniquement `current_participants` (nombre total) mais pas la distinction entre:
- Participants ayant payé (`payment_status = 'paid'`)
- Participants en attente de paiement (`payment_status = 'pending'`)

**Impact:**
- Le coach ne sait pas combien de participants ont confirmé par le paiement
- Difficile de décider si confirmer ou attendre plus d'inscriptions

**Correction requise:**
Afficher dans GroupSessionCard: "X/Y participants (Z confirmés)"

---

### Bug #4 - MOYEN: Pas de notification au coach quand min_participants atteint

**Fichiers:** `supabase/functions/register-group-session/index.ts`, `payment-webhook/index.ts`

**Problème:**
Aucune notification n'est envoyée au coach quand une séance atteint son nombre minimum de participants requis.

**Impact:**
- Le coach doit vérifier manuellement
- Peut manquer le moment optimal pour confirmer la séance

**Correction requise:**
Ajouter une vérification après paiement confirmé:
```typescript
// Dans payment-webhook après mise à jour participant
if (session.current_participants >= session.min_participants && session.status === 'planifiee') {
  await dispatchNotification({
    userId: coach.user_id,
    title: '✅ Séance viable',
    message: `Votre séance "${session.session_name}" a atteint le minimum de ${session.min_participants} participants !`
  });
}
```

---

### Bug #5 - MOYEN: Séances passées peuvent apparaître dans CoachSearch

**Fichier:** `src/pages/CoachSearch.tsx:63-68`

**Problème:**
```typescript
const availableSessions = useMemo(() =>
  allSessions.filter(s =>
    s.status === 'planifiee' || s.status === 'confirmee'
  ),
  [allSessions]
);
```

Ce filtre ne vérifie pas si `scheduled_date` est dans le futur. Une séance passée mais non marquée "terminée" apparaîtra.

**Impact:**
- Affichage de séances obsolètes
- Erreur lors de tentative d'inscription ("Séance passée")

**Correction requise:**
```typescript
const availableSessions = useMemo(() => {
  const now = new Date();
  return allSessions.filter(s => {
    const sessionDate = new Date(s.scheduled_date + 'T' + s.start_time);
    return (s.status === 'planifiee' || s.status === 'confirmee') && sessionDate > now;
  });
}, [allSessions]);
```

---

### Bug #6 - MOYEN: Protection double-clic insuffisante dans GroupSessionPaymentWidget

**Fichier:** `src/components/coach/GroupSessionPaymentWidget.tsx`

**Problème:**
La protection utilise `isRegistering` du hook mais un double-clic rapide peut créer deux requêtes:
```typescript
<Button
  type="submit"
  disabled={isRegistering || paymentStep !== 'form' || !isValidPhone}
>
```

**Impact mitigé:** L'edge function a une vérification anti-doublon via `useGroupSessionRegistration.ts`:
```typescript
const { data: existingParticipation } = await supabase
  .from('group_session_participants')
  .select(...)
  .eq('session_id', params.sessionId)
  .eq('patient_id', user.id)
  .neq('payment_status', 'cancelled')
  .maybeSingle();
```

**Amélioration suggérée:**
Ajouter un `useRef` avec timestamp comme dans `PaymentDialog.tsx` pour une protection côté client plus robuste.

---

### Bug #7 - MOYEN: Annulation séance ne rembourse pas les participants

**Fichier:** `src/hooks/useGroupSessions.ts:95-113`

**Problème:**
```typescript
cancelSession: useMutation({
  mutationFn: async (sessionId: string) => {
    const { error } = await supabase
      .from('group_sessions')
      .update({ status: 'annulee' })
      .eq('id', sessionId);
    // Pas de remboursement des paiements existants!
  },
```

Quand un coach annule une séance, les participants ayant déjà payé ne sont pas automatiquement remboursés.

**Impact:**
- Participants ont payé mais la séance est annulée
- Nécessite intervention manuelle support

**Correction requise:**
Créer une edge function `cancel-group-session` qui:
1. Met à jour le statut de la séance
2. Récupère tous les participants avec `payment_status = 'paid'`
3. Initie des remboursements FedaPay ou marque pour remboursement manuel
4. Notifie les participants

---

### Bug #8 - MOYEN: Temps réel non fonctionnel pour les séances

**Fichier:** `src/hooks/useGroupSessions.ts`

**Problème:**
Contrairement à `usePatientGroupSessions.ts` qui a une souscription temps réel, `useGroupSessions.ts` ne s'abonne pas aux changements de `group_sessions`:

```typescript
// usePatientGroupSessions.ts - A une souscription temps réel ✅
useEffect(() => {
  const channel = supabase
    .channel('patient-group-sessions-changes')
    .on('postgres_changes', ...)
    .subscribe();
  return () => supabase.removeChannel(channel);
}, [patientId]);

// useGroupSessions.ts - Pas de souscription temps réel ❌
```

**Impact:**
- Le coach ne voit pas les nouvelles inscriptions en temps réel
- Doit rafraîchir manuellement la page

**Correction requise:**
Ajouter une souscription temps réel similaire dans `useGroupSessions.ts`.

---

### Bug #9 - MINEUR: Message toast confus après confirmation séance

**Fichier:** `src/hooks/useGroupSessions.ts:115-125`

**Problème:**
```typescript
confirmSession: useMutation({
  onSuccess: () => {
    toast({
      title: 'Séance confirmée',
      description: 'La séance a été confirmée avec succès.'
    });
  },
```

Le message ne mentionne pas que les participants seront notifiés.

**Correction suggérée:**
```typescript
description: 'La séance a été confirmée. Les participants inscrits ont été notifiés.'
```

---

### Bug #10 - MINEUR: Pas de confirmation avant annulation inscription patient

**Fichier:** `src/components/dashboard/PatientGroupSessionsSection.tsx`

**Problème:**
Il n'existe pas de bouton/fonctionnalité permettant au patient d'annuler son inscription à une séance.

**Impact:**
- Patient ne peut pas se désinscrire
- Doit contacter le support

**Correction suggérée:**
Ajouter un bouton "Se désinscrire" avec AlertDialog de confirmation, mais uniquement pour les inscriptions `pending` (pas encore payées) ou avec conditions de remboursement claires.

---

### Bug #11 - MINEUR: Type de séance non affiché côté patient

**Fichiers:** `src/pages/CoachSearch.tsx`, `src/components/dashboard/PatientGroupSessionsSection.tsx`

**Problème:**
Le `session_type` (individuelle, duo, groupe) n'est pas affiché au patient, bien qu'il soit stocké.

**Impact:**
- Le patient ne sait pas si c'est une vraie séance de groupe ou un duo

**Correction suggérée:**
Ajouter un badge indiquant le type de séance.

---

## 3. Points Positifs du Workflow Actuel

1. **Réservation atomique** - RPC `reserve_group_session_spot` empêche le surbooking au niveau base de données
2. **Validation Zod complète** - `session-validation.ts` valide toutes les entrées
3. **Anti-doublon inscription** - Vérification existante dans `useGroupSessionRegistration.ts`
4. **Timeout sur edge functions** - `invokeWithTimeout` dans `register-group-session`
5. **Rollback en cas d'échec paiement** - Suppression participation si création paiement échoue
6. **Webhook robuste** - Gère correctement les paiements `group_session_` prefixés
7. **Retry paiement** - Widget dédié `RetryGroupSessionPaymentWidget` pour les paiements échoués
8. **Vérification KYC backend** - Edge function vérifie le statut KYC du coach
9. **Notifications non-bloquantes** - Les notifications n'empêchent pas le flux principal

---

## 4. Comparaison avec Workflow Patient (RDV standard)

| Aspect | Séances Groupe | RDV Standard | Alignement |
|--------|----------------|--------------|------------|
| Vérification KYC frontend | ❌ Non visible | ⚠️ Partiel | **À corriger** |
| Protection double-clic | ⚠️ État seul | ✅ Ref + timestamp | Améliorer |
| Temps réel | ❌ Pas pour coach | ✅ Supabase channels | **À corriger** |
| Notification paiement praticien | ✅ Dans webhook | ✅ Dans webhook | OK |
| Retry paiement | ✅ Widget dédié | ✅ Widget dédié | OK |
| Annulation avec remboursement | ❌ Pas automatique | ❌ Pas automatique | À faire |
| Confirmation avant action | ✅ AlertDialog cancel | ✅ AlertDialog | OK |

---

## 5. Plan de Correction

### Priorité 1 - Critiques

| Bug | Fichier | Action | Statut |
|-----|---------|--------|--------|
| #1 | CoachSearch.tsx, GroupSessionCard.tsx | Afficher badge KYC, filtrer coachs non vérifiés | ⚠️ Non requis - usePractitioners filtre déjà par kyc_status=approved |
| #2 | CoachSearch.tsx | Ajouter indicateur approximatif ou refresh | ⚠️ Mitigé - temps réel ajouté (Bug #8) |

### Priorité 2 - Moyens

| Bug | Fichier | Action | Statut |
|-----|---------|--------|--------|
| #3 | SessionsTab.tsx, GroupSessionCard.tsx | Afficher participants confirmés vs pending | ✅ CORRIGÉ |
| #4 | payment-webhook/index.ts | Notifier coach quand min_participants atteint | À faire |
| #5 | CoachSearch.tsx | Filtrer séances passées par date | ✅ CORRIGÉ |
| #6 | GroupSessionPaymentWidget.tsx | Ajouter protection useRef | À faire |
| #7 | Nouvelle edge function | Créer cancel-group-session avec remboursement | À faire |
| #8 | useGroupSessions.ts | Ajouter souscription temps réel | ✅ CORRIGÉ |

### Priorité 3 - Mineurs

| Bug | Fichier | Action | Statut |
|-----|---------|--------|--------|
| #9 | useGroupSessions.ts | Améliorer message toast | ✅ CORRIGÉ |
| #10 | PatientGroupSessionsSection.tsx | Ajouter bouton désinscrire | À considérer |
| #11 | CoachSearch.tsx, PatientGroupSessionsSection.tsx | Afficher session_type | ✅ CORRIGÉ

---

## 6. Tests Recommandés

### Scénario 1: Inscription séance normale
1. Patient se connecte
2. Cherche une séance sur CoachSearch
3. Clique "S'inscrire"
4. Sélectionne méthode paiement, entre numéro
5. Vérifier: Pré-checks passent (KYC, places, date)
6. Widget FedaPay s'affiche
7. Paie via Mobile Money
8. Vérifier: Inscription confirmée, coach notifié
9. Séance visible dans PatientGroupSessionsSection

### Scénario 2: Coach sans KYC
1. Coach crée une séance (sans KYC approuvé)
2. Patient tente de s'inscrire
3. Vérifier: Message d'erreur explicite côté frontend (après correction Bug #1)

### Scénario 3: Séance complète
1. Séance avec max_participants = 2
2. Deux patients s'inscrivent et paient
3. Troisième patient tente de s'inscrire
4. Vérifier: Bouton désactivé ou message "Complet"

### Scénario 4: Paiement échoué + retry
1. Patient s'inscrit
2. Paiement échoue (timeout ou annulation)
3. Inscription visible dans PatientGroupSessionsSection avec statut "En attente"
4. Cliquer "Finaliser le paiement"
5. Vérifier: RetryGroupSessionPaymentWidget fonctionne
6. Compléter le paiement

### Scénario 5: Double-clic rapide
1. Patient clique rapidement deux fois sur "S'inscrire"
2. Vérifier: Une seule inscription créée

### Scénario 6: Annulation séance par coach
1. Coach crée une séance
2. Patients s'inscrivent et paient
3. Coach annule la séance
4. Vérifier: Participants notifiés (après correction Bug #7: remboursement initié)

### Scénario 7: RDV individuel coach
1. Patient demande RDV individuel avec coach
2. Coach accepte dans AppointmentsTab
3. Patient paie
4. Vérifier: Workflow identique aux praticiens standards

### Scénario 8: Minimum participants atteint
1. Séance avec min_participants = 3
2. Trois patients s'inscrivent et paient
3. Vérifier: Coach reçoit notification "Séance viable" (après correction Bug #4)

---

## 7. Conclusion

Le workflow coach sportif est fonctionnel dans son ensemble avec une bonne gestion des paiements et des inscriptions atomiques.

### Corrections effectuées (2026-01-27)

- ✅ **Bug #3**: Ajout affichage distinction participants payés vs en attente dans GroupSessionCard
- ✅ **Bug #5**: Filtrage des séances passées par date dans CoachSearch
- ✅ **Bug #8**: Ajout souscription temps réel pour les séances de groupe (coach voit inscriptions en direct)
- ✅ **Bug #9**: Amélioration message toast confirmation séance
- ✅ **Bug #11**: Ajout affichage du type de séance (individuelle/duo/groupe) côté patient

### Notes sur bugs "critiques" réévalués

- **Bug #1 (KYC)**: Non requis - `usePractitioners` filtre déjà par `kyc_status = 'approved'` pour les utilisateurs connectés
- **Bug #2 (Places restantes)**: Mitigé par l'ajout du temps réel (Bug #8) + la RPC atomique backend

### Améliorations futures recommandées
- Système de remboursement automatique lors d'annulation séance (Bug #7)
- Notification automatique quand seuil minimum atteint (Bug #4)
- Protection double-clic améliorée avec useRef (Bug #6)
- Possibilité pour le patient de se désinscrire (Bug #10)

Le workflow s'aligne maintenant mieux avec le workflow de prise de rendez-vous patient standard, avec les mêmes mécanismes de paiement FedaPay, notifications et temps réel.
