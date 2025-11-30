# 🏋️ Analyse : Système de Coach Sportif et Paiement

**Date :** 30 novembre 2025
**Contexte :** Vérification de la compatibilité du système de paiement avec les coachs sportifs

---

## 📊 État des Lieux

### 1. **Types de Services des Coachs**

Les coachs sportifs proposent **2 types de services** distincts :

#### A. **Rendez-vous Individuels** (Table: `appointments`)
```sql
-- Identique aux praticiens médicaux
appointments {
  id
  patient_id
  practitioner_id  -- ID du coach
  specialty        -- "coach_sportif"
  date
  time
  status           -- awaiting_practitioner → pending_payment → confirmed
  payment_amount
}
```

**Flux de paiement :** ✅ **Compatible avec PaymentDialog en mode embarqué**
- Coach accepte → Status: `pending_payment`
- Patient paie via PaymentDialog
- Widget FedaPay embarqué (#fedapay-embed)
- Dashboard se rafraîchit automatiquement
- Status: `confirmed`

#### B. **Séances de Groupe** (Table: `group_sessions`)
```sql
group_sessions {
  id
  coach_id
  session_name
  scheduled_date
  start_time
  end_time
  location
  max_participants
  current_participants
  price_per_person
  status              -- planifiee → confirmee → terminee
}

group_session_participants {
  id
  session_id
  patient_id
  payment_status     -- pending → paid
  registered_at
}
```

**Flux de paiement :** ❌ **DIFFÉRENT - Redirection externe**
- Patient s'inscrit à la séance
- Edge function `register-group-session` crée le paiement FedaPay
- Redirection vers URL FedaPay externe : `window.location.href = data.paymentUrl`
- **PAS de mode embarqué**
- **PAS de PaymentDialog**

---

## ✅ Ce Qui Fonctionne

### 1. **Rendez-vous Individuels - Coachs** ✅

```typescript
// Dans PatientDashboard.tsx
<PaymentDialog
  open={paymentDialogOpen}
  appointmentId={appointmentIdForPayment}
  amount={paymentAmount}
  onSuccess={handlePaymentSuccess}  // Rafraîchit le dashboard
  onComplete={handlePaymentSuccess}
/>
```

**Avantages :**
- ✅ Mode embarqué (pas de popup)
- ✅ Mise à jour automatique du dashboard
- ✅ Génération de reçu PDF
- ✅ Méthodes de paiement sauvegardées
- ✅ Validation des doublons de RDV

**Fonctionnement identique** pour :
- Médecins
- Infirmiers
- Kinésithérapeutes
- **Coachs sportifs** (rendez-vous individuels)

### 2. **Commission et Revenus**

```typescript
// CoachDashboard.tsx ligne 34
import { COACH_REVENUE_RATE } from '@/lib/session-validation';

// Calcul du revenu
totalRevenue = prix * participants * COACH_REVENUE_RATE  // 95% pour le coach
appointmentsRevenue = montant * COACH_REVENUE_RATE       // 95% pour le coach
```

**Commission :**
- Plateforme : 5%
- Coach : 95%

---

## ❌ Ce Qui Pose Problème

### 1. **Séances de Groupe - Paiement Non Embarqué**

**Code actuel** (`useGroupSessionRegistration.ts:54-56`) :
```typescript
// ❌ Redirection vers URL externe
if (data.paymentUrl) {
  window.location.href = data.paymentUrl;
}
```

**Problèmes :**
- ❌ Redirection externe (mauvaise UX)
- ❌ Popup potentiellement bloquée
- ❌ Pas de retour automatique au dashboard
- ❌ Pas de génération de reçu PDF automatique
- ❌ Pas de sauvegarde de méthode de paiement
- ❌ Incohérence avec le flux des RDV individuels

### 2. **Validation des Doublons - Incomplète**

**Code actuel** (`useAppointments.ts:138-164`) :
```typescript
// ✅ Vérifie uniquement les appointments
const { data: existingAppointments } = await supabase
  .from('appointments')
  .select('id, practitioner_name, time, status')
  .eq('patient_id', patientId)
  .eq('practitioner_id', data.practitionerId)
  .eq('date', appointmentDate)
  .not('status', 'in', '(cancelled,rejected,completed)');
```

**Problèmes :**
- ❌ Ne vérifie PAS les séances de groupe
- ❌ Un patient pourrait théoriquement s'inscrire 2 fois à la même séance (si pas de contrainte DB)
- ❌ Aucune vérification de double inscription

---

## 🔍 Analyse Détaillée

### Comparaison des Flux de Paiement

| Aspect | Rendez-vous Individuels | Séances de Groupe |
|--------|------------------------|-------------------|
| **Méthode de paiement** | PaymentDialog embarqué ✅ | Redirection externe ❌ |
| **Widget FedaPay** | Mode `container` | Mode `window.open` |
| **UX** | Fluide, dans la page | Rupture, nouvelle page |
| **Retour auto** | Oui ✅ | Non ❌ |
| **Dashboard refresh** | Automatique ✅ | Manuel ❌ |
| **Reçu PDF** | Oui ✅ | Non ❌ |
| **Méthodes sauvegardées** | Oui ✅ | Non ❌ |
| **Validation doublon** | Oui ✅ | Non ❌ |

### Structure de Données - Séances de Groupe

**Inscription + Paiement atomique :**
```
1. reserve_group_session_spot() → Vérifie places disponibles
2. INSERT group_session_participants → payment_status: 'pending'
3. Edge function 'register-group-session' → Crée paiement FedaPay
4. Redirection → window.location.href = paymentUrl
5. Webhook FedaPay → Met à jour payment_status: 'paid'
```

**Problème :** L'étape 4 sort de l'application, pas de contrôle sur le retour.

---

## 💡 Recommandations

### Option 1 : **Uniformiser avec PaymentDialog** ⭐ (Recommandé)

Créer un nouveau composant `GroupSessionPaymentDialog` similaire à `PaymentDialog` :

```typescript
// Nouveau composant
<GroupSessionPaymentDialog
  open={paymentDialogOpen}
  sessionId={selectedSessionId}
  amount={session.price_per_person}
  onSuccess={() => {
    // Rafraîchir liste des séances
    queryClient.invalidateQueries(['group-sessions']);
    queryClient.invalidateQueries(['patient-group-sessions']);
  }}
/>
```

**Avantages :**
- ✅ Cohérence UX avec RDV individuels
- ✅ Mode embarqué FedaPay
- ✅ Dashboard auto-refresh
- ✅ Génération reçu PDF possible
- ✅ Méthodes de paiement sauvegardées

**Modifications requises :**
1. Créer `GroupSessionPaymentDialog.tsx`
2. Modifier `useGroupSessionRegistration` pour ne pas rediriger
3. Modifier `register-group-session` edge function pour retourner transactionId
4. Ajouter validation doublon inscription

### Option 2 : **Garder la Redirection** (Plus simple, moins optimal)

Si on garde la redirection externe :

**Améliorations minimales :**
1. Ajouter une page de retour après paiement
2. Implémenter un polling pour détecter le paiement
3. Ajouter validation doublon inscription
4. Générer reçu PDF après confirmation webhook

**Inconvénients :**
- ❌ UX toujours fragmentée
- ❌ Risque de popup bloquée
- ❌ Pas de cohérence avec le reste

### Option 3 : **Validation Doublon Seulement** (Minimum viable)

Ajouter uniquement la validation des doublons :

```typescript
// Dans useGroupSessionRegistration
const { data: existingParticipation } = await supabase
  .from('group_session_participants')
  .select('id')
  .eq('session_id', params.sessionId)
  .eq('patient_id', user.id)
  .not('payment_status', 'eq', 'cancelled')
  .maybeSingle();

if (existingParticipation) {
  throw new Error('Vous êtes déjà inscrit à cette séance');
}
```

---

## 📋 Plan d'Action Recommandé

### Phase 1 : **Validation Immédiate** (Urgent)

```
[ ] Ajouter validation doublon pour séances de groupe
[ ] Empêcher double inscription d'un patient
[ ] Message d'erreur clair
```

### Phase 2 : **Harmonisation UX** (Court terme)

```
[ ] Créer GroupSessionPaymentDialog
[ ] Implémenter mode embarqué pour séances de groupe
[ ] Adapter edge function register-group-session
[ ] Tester le flux complet
```

### Phase 3 : **Optimisation** (Moyen terme)

```
[ ] Génération reçu PDF pour séances de groupe
[ ] Réutilisation méthodes de paiement sauvegardées
[ ] Dashboard unifié patient (RDV + Séances)
[ ] Analytics et reporting coach
```

---

## 🎯 Conclusion

### État Actuel

| Service | Paiement | Status |
|---------|----------|--------|
| Rendez-vous individuels (tous praticiens + coachs) | Mode embarqué ✅ | **OPTIMAL** |
| Séances de groupe (coachs uniquement) | Redirection externe ❌ | **À AMÉLIORER** |

### Réponse à la Question

**"L'implémentation est-elle valide pour les coachs sportifs ?"**

✅ **OUI** pour les **rendez-vous individuels**
- Fonctionne parfaitement
- Mode embarqué
- Validation doublon active
- Dashboard auto-refresh

⚠️ **PARTIELLEMENT** pour les **séances de groupe**
- Fonctionne mais UX non optimale
- Redirection externe
- Pas de validation doublon
- Incohérence avec le reste

### Recommandation Finale

**Implémenter l'Option 1** (Uniformiser avec PaymentDialog) pour :
1. Cohérence UX sur toute la plateforme
2. Meilleure expérience utilisateur
3. Fonctionnalités avancées (reçu PDF, méthodes sauvegardées)
4. Facilité de maintenance (un seul système de paiement)

**Minimum viable :** Option 3 (validation doublon) à implémenter **immédiatement**.

---

**Prochaine étape :** Décider quelle option implémenter et prioriser le développement.
