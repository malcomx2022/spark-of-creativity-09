# Revue Fonctionnelle - Workflow Praticien (Acceptation/Refus RDV)

**Date:** 2026-01-27
**Version:** 1.0

---

## 1. Architecture du Workflow

### 1.1 Phases du workflow côté praticien

```
PHASE 1: RECEPTION DEMANDE
    |
    v
[Patient crée RDV] --> [notify-appointment-request] --> [Notification SMS/Email/Push]
    |
    v
PHASE 2: DASHBOARD PRATICIEN (PractitionerDashboard.tsx)
    |
    v
[usePractitionerAppointments] --> [Affichage onglet "À traiter"]
    |
    v
[Vérification KYC] --> [can_accept_missions && kyc_status === 'approved']
    |
    v
PHASE 3: DECISION PRATICIEN
    |
    +----------------+----------------+
    |                                 |
    v                                 v
[ACCEPTER]                        [REFUSER]
    |                                 |
    v                                 v
[handle-appointment-response]     [handle-appointment-response]
    |                                 |
    v                                 v
[Vérif statut atomique]           [Marquer rejected]
    |                                 |
    v                                 v
[Calculer montant]                [Recherche praticien alternatif]
    |                                 |
    v                                 v
[Créer paiement FedaPay]          [Praticien trouvé?]
    |                                 |
    v                         +-------+-------+
[Status → pending_payment]    |               |
    |                      [OUI]           [NON]
    v                         |               |
[Notifier patient]            v               v
                     [Réassigner RDV]   [Notifier patient]
                              |           (refusé)
                              v
                     [Notifier nouveau praticien]

PHASE 4: APRES PAIEMENT PATIENT
    |
    v
[payment-webhook] --> [Status → confirmed]
    |
    v
[RDV apparaît dans "Confirmés"]
    |
    v
PHASE 5: CONSULTATION
    |
    v
[Bouton "Terminer"] --> [Status → completed]
```

### 1.2 Statuts visibles par le praticien

| Statut | Onglet Dashboard | Action possible |
|--------|------------------|-----------------|
| `awaiting_practitioner` | À traiter | Accepter / Refuser |
| `pending_payment` | **INVISIBLE** ⚠️ | Aucune |
| `confirmed` | Confirmés | Terminer / Annuler |
| `completed` | Terminés | Consulter |

### 1.3 Fichiers impliqués

| Fichier | Rôle |
|---------|------|
| `src/pages/PractitionerDashboard.tsx` | Dashboard principal praticien |
| `src/components/AppointmentCard.tsx` | Carte RDV avec boutons action |
| `src/hooks/useAppointments.ts` | Hook CRUD et temps réel |
| `supabase/functions/handle-appointment-response/index.ts` | Edge function accept/reject |
| `supabase/functions/notify-appointment-request/index.ts` | Notification nouvelle demande |
| `supabase/functions/cancel-pending-payment/index.ts` | Annulation paiement |

---

## 2. Analyse des Bugs Identifiés

### Bug #1 - CRITIQUE: Statut "pending_payment" invisible pour le praticien

**Fichier:** `src/pages/PractitionerDashboard.tsx:301-306`

**Problème:**
```typescript
const categorizedAppointments = useMemo(() => ({
  awaiting: appointments.filter(apt => apt.status === 'awaiting_practitioner'),
  pending: appointments.filter(apt => apt.status === 'pending'),
  confirmed: appointments.filter(apt => apt.status === 'confirmed'),
  completed: appointments.filter(apt => apt.status === 'completed'),
}), [appointments]);
```

Le statut `pending_payment` n'est dans aucune catégorie ! Après acceptation par le praticien, le RDV disparaît de sa vue jusqu'au paiement.

**Impact:**
- Le praticien ne sait pas si le patient a reçu la demande de paiement
- Pas de visibilité sur les RDV en attente de paiement
- Impossible de relancer le patient ou d'annuler si trop long

**Correction requise:**
```typescript
const categorizedAppointments = useMemo(() => ({
  awaiting: appointments.filter(apt => apt.status === 'awaiting_practitioner'),
  pendingPayment: appointments.filter(apt => apt.status === 'pending_payment'),
  confirmed: appointments.filter(apt => apt.status === 'confirmed'),
  completed: appointments.filter(apt => apt.status === 'completed'),
}), [appointments]);
```

---

### Bug #2 - CRITIQUE: Pas de notification au praticien après paiement

**Fichier:** `supabase/functions/payment-webhook/index.ts`

**Problème:**
Le webhook notifie uniquement le patient après paiement réussi, pas le praticien:
```typescript
// Notification envoyée au patient uniquement
await dispatchNotification({
  userId: appointment.patient_id,
  title: '✅ Paiement confirmé',
  ...
});
// Pas de notification au praticien!
```

**Impact:**
- Le praticien ne sait pas que le paiement est fait
- Doit rafraîchir manuellement pour voir le RDV confirmé
- Peut rater des RDV urgents

**Correction requise:**
Ajouter une notification au praticien dans `payment-webhook`:
```typescript
// Notifier le praticien
await dispatchNotification({
  userId: practitioner.user_id,
  title: '💳 Paiement reçu',
  message: `${patient_name} a payé pour le RDV du ${date} à ${time}`,
  type: 'payment_received',
  channels: ['push', 'email'],
});
```

---

### Bug #3 - MOYEN: Pas de confirmation avant acceptation/refus

**Fichier:** `src/components/AppointmentCard.tsx:132-151`

**Problème:**
```typescript
<Button
  onClick={() => onConfirm(appointment.id)}
  size="sm"
  className="flex-1"
  disabled={disabled}
>
  Accepter
</Button>
<Button
  onClick={() => onReject(appointment.id)}
  ...
>
  Refuser
</Button>
```

Les boutons exécutent l'action directement sans confirmation.

**Impact:**
- Un clic accidentel peut accepter/refuser un RDV
- Action irréversible (surtout le refus)

**Correction requise:**
Ajouter un `AlertDialog` de confirmation avant l'action.

---

### Bug #4 - MOYEN: Montant du paiement non visible avant acceptation

**Fichier:** `src/components/AppointmentCard.tsx`

**Problème:**
Quand le praticien voit un RDV en `awaiting_practitioner`, le montant (`paymentAmount`) n'est pas affiché car il est calculé au moment de l'acceptation.

**Impact:**
- Le praticien ne sait pas combien le patient paiera
- Pas de transparence sur les tarifs

**Correction requise:**
- Soit pré-calculer le montant lors de la création du RDV
- Soit afficher "Tarif standard: 15 000 XOF" pour les non-coachs

---

### Bug #5 - MOYEN: Annulation par praticien ne rembourse pas automatiquement

**Fichier:** `src/pages/PractitionerDashboard.tsx:230-298`

**Problème:**
Quand le praticien annule un RDV confirmé:
```typescript
if (status === 'cancelled') {
  await supabase.functions.invoke('cancel-pending-payment', {
    body: { appointmentId: id }
  });
}
```

`cancel-pending-payment` annule les paiements en **attente**, mais pas les paiements **complétés**. Si le patient a déjà payé, le paiement n'est pas remboursé.

**Impact:**
- Patient paie mais praticien annule → pas de remboursement automatique
- Nécessite intervention manuelle support

**Correction requise:**
Créer une edge function `refund-payment` pour les annulations post-paiement.

---

### Bug #6 - MOYEN: Race condition possible sur double-clic accept/reject

**Fichier:** `src/pages/PractitionerDashboard.tsx:95-158`

**Problème:**
La protection anti-double-clic utilise `processingAppointment`:
```typescript
if (processingAppointment === appointmentId) return;
setProcessingAppointment(appointmentId);
```

Mais si l'utilisateur clique très rapidement avant que `setProcessingAppointment` soit appliqué, deux requêtes peuvent partir.

**Impact mitigé:** L'edge function a une protection atomique avec `eq('status', 'awaiting_practitioner')`, donc la seconde requête échouera. Mais génère une erreur inutile.

**Amélioration possible:**
Utiliser un `useRef` avec timestamp comme dans `PaymentDialog.tsx`.

---

### Bug #7 - MINEUR: Pas de filtre par date dans les onglets

**Fichier:** `src/pages/PractitionerDashboard.tsx`

**Problème:**
Les RDV "À traiter" incluent tous les RDV passés et futurs en `awaiting_practitioner`. Un vieux RDV non traité reste visible.

**Correction suggérée:**
Filtrer pour n'afficher que les RDV futurs ou des dernières 24h.

---

### Bug #8 - MINEUR: Temps réel ne déclenche pas de notification visuelle

**Fichier:** `src/hooks/useAppointments.ts:170-199`

**Problème:**
Le temps réel invalide la query mais ne montre pas de notification à l'utilisateur:
```typescript
.on('postgres_changes', ..., (payload) => {
  queryClient.invalidateQueries({ ... });
  // Pas de toast ou notification visuelle
})
```

**Impact:**
- Le praticien ne remarque pas les nouveaux RDV sans regarder activement
- Peut rater des demandes urgentes

---

### Bug #9 - MINEUR: Mauvais message toast après refus avec réassignation

**Fichier:** `src/pages/PractitionerDashboard.tsx:210-215`

**Problème:**
```typescript
toast({
  title: 'Rendez-vous refusé',
  description: response?.practitioner
    ? `Le rendez-vous a été réassigné à ${response.practitioner.name}.`
    : 'Le système recherche un praticien alternatif pour le patient.'
});
```

Le message "Le système recherche..." implique une action en cours, mais en réalité la recherche est déjà terminée à ce moment et aucun praticien n'a été trouvé.

**Correction:**
```typescript
: 'Aucun praticien alternatif n\'a été trouvé. Le patient a été notifié.'
```

---

## 3. Comparaison avec Workflow Patient

| Aspect | Workflow Patient | Workflow Praticien | Alignement |
|--------|------------------|--------------------| -----------|
| Visibilité `pending_payment` | ✅ Affiché avec alerte | ❌ Invisible | **À corriger** |
| Notification paiement | ✅ Reçoit notification | ❌ Pas de notification | **À corriger** |
| Protection double-clic | ✅ Ref + timestamp | ⚠️ État seul | Améliorer |
| Confirmation action | N/A | ❌ Pas de confirmation | **À corriger** |
| Montant visible | ✅ Après acceptation | ❌ Pas avant acceptation | Améliorer |
| Temps réel | ✅ Avec polling backup | ✅ Temps réel Supabase | OK |
| Récupération erreur | ✅ localStorage + orphan | ❌ Pas de récupération | À considérer |

---

## 4. Plan de Correction

### Priorité 1 - Critiques

| Bug | Fichier | Action | Statut |
|-----|---------|--------|--------|
| #1 | PractitionerDashboard.tsx | Ajouter onglet/catégorie `pending_payment` | ✅ CORRIGÉ |
| #2 | payment-webhook/index.ts | Ajouter notification praticien après paiement | ✅ DÉJÀ FAIT |

### Priorité 2 - Moyens

| Bug | Fichier | Action | Statut |
|-----|---------|--------|--------|
| #3 | AppointmentCard.tsx | Ajouter AlertDialog confirmation | ✅ CORRIGÉ |
| #4 | AppointmentCard.tsx | Afficher montant estimé | À faire |
| #5 | Nouvelle edge function | Créer refund-payment pour annulations | À faire |
| #6 | PractitionerDashboard.tsx | Améliorer protection double-clic | À faire |

### Priorité 3 - Mineurs

| Bug | Fichier | Action | Statut |
|-----|---------|--------|--------|
| #7 | PractitionerDashboard.tsx | Filtrer RDV par date | À faire |
| #8 | useAppointments.ts | Ajouter toast sur nouveau RDV | À faire |
| #9 | PractitionerDashboard.tsx | Corriger message toast refus | ✅ CORRIGÉ |

---

## 5. Tests Recommandés

### Scénario 1: Acceptation normale
1. Patient crée RDV
2. Praticien voit dans "À traiter"
3. Praticien accepte
4. Vérifier: RDV visible dans nouvel onglet "En attente paiement"
5. Patient paie
6. Vérifier: Praticien reçoit notification
7. RDV passe dans "Confirmés"

### Scénario 2: Refus avec réassignation
1. Patient crée RDV
2. Praticien #1 refuse
3. Vérifier: Recherche praticien alternatif
4. Si trouvé: Praticien #2 reçoit notification
5. Vérifier: Message toast correct

### Scénario 3: Annulation après paiement
1. Patient crée et paie RDV
2. Praticien annule
3. Vérifier: Paiement marqué pour remboursement (ou notification support)

### Scénario 4: Double-clic rapide
1. Praticien double-clique "Accepter" très vite
2. Vérifier: Une seule acceptation, pas d'erreur

### Scénario 5: KYC non validé
1. Praticien avec KYC pending
2. Essaie d'accepter RDV
3. Vérifier: Message d'erreur clair, boutons désactivés

---

## 6. Conclusion

Le workflow d'acceptation/refus par le praticien fonctionne et a été amélioré.

### Bugs corrigés (2026-01-27)

- ✅ **Bug #1**: Nouvel onglet "💳 Paiement" ajouté pour les RDV en `pending_payment`
- ✅ **Bug #2**: La notification au praticien après paiement existait déjà dans payment-webhook
- ✅ **Bug #3**: Dialogues de confirmation avant acceptation/refus ajoutés
- ✅ **Bug #9**: Message toast corrigé pour refus sans réassignation

### Bugs restants à traiter

- **Bug #4** (Moyen): Afficher montant estimé avant acceptation
- **Bug #5** (Moyen): Créer edge function refund-payment
- **Bug #6** (Moyen): Améliorer protection double-clic
- **Bug #7-8** (Mineurs): Filtrage date et notification temps réel

Le workflow praticien est maintenant aligné avec le workflow patient concernant la visibilité des statuts et la confirmation des actions.
