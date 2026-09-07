# Résumé des Corrections du Workflow

## Problèmes Identifiés

### 1. Page d'Accueil ✅
**Problème:** L'utilisateur signale que la page par défaut n'est plus la page d'accueil.
**Solution:** Le routing est correct. Route "/" → Index.tsx qui redirige automatiquement les utilisateurs connectés vers leur dashboard approprié.

### 2. Champ payment_amount Manquant ✅
**Problème:** La table `appointments` n'avait pas de colonne `payment_amount`.
**Solution:** Migration ajoutée pour créer la colonne `payment_amount integer`.

### 3. Workflow Complet Documenté ✅
**Solution:** Document `WORKFLOW_COMPLETE.md` créé avec tous les détails du workflow de A à Z.

## Workflow Correct (Résumé)

### Côté Patient

#### 1. Création Demande de Rendez-vous
```
Status: pending → awaiting_practitioner
```
- Formulaire rempli (spécialité, date, heure, raison)
- Recherche automatique praticien disponible
- Création atomique RDV + Paiement initial
- Notifications: Praticien (email/SMS/push) + Patient (email/push)

#### 2. Attente Acceptation Praticien
```
Status: awaiting_practitioner
Badge: Orange "En attente praticien"
```
- Carte affiche message: "Le praticien répondra sous 30 minutes"
- Patient reçoit notification quand praticien répond

#### 3. Après Acceptation → Paiement
```
Status: confirmed
Badge: Amber "Paiement requis"
```
- Notification reçue: "Rendez-vous confirmé, veuillez payer"
- Bouton "Payer" visible
- Dialogue de paiement avec choix Mobile Money/Carte

#### 4. Après Paiement Réussi
```
Status: in-progress
Badge: Bleu "En cours"
```
- Notification: "Paiement réussi, rendez-vous confirmé"
- Patient attend la consultation

#### 5. Après Consultation
```
Status: completed
Badge: Gris "Terminé"
```
- Notification: "Consultation terminée"
- Invitation à laisser un avis

### Côté Praticien

#### 1. Réception Demande
```
Status: awaiting_practitioner
Badge: Orange "En attente praticien"
```
- Notification reçue (email/SMS/push)
- Carte affiche détails patient
- 2 boutons: "Accepter" / "Refuser"

#### 2A. Acceptation
```
Status: awaiting_practitioner → confirmed
Payment: initiated → pending (held)
```
- Patient notifié pour payer
- Praticien voit "Paiement requis" sur sa carte
- Fonds seront bloqués 2 jours après paiement

#### 2B. Refus
```
Status: awaiting_practitioner → rejected
Payment: initiated → canceled
```
- Patient notifié du refus
- Nouvelle recherche de praticien déclenchée

#### 3. Après Paiement Patient
```
Status: confirmed → in-progress
Badge: Bleu "En cours"
```
- Notification: "Paiement reçu, patient confirmé"
- Praticien peut voir détails consultation
- Bouton "Terminer" disponible

#### 4. Finalisation Consultation
```
Status: in-progress → completed
Payout: held → ready (après 2 jours)
```
- Clic "Terminer"
- Patient notifié
- Fonds déblo

qués après 2 jours automatiquement

## Flux de Paiement

### États des Paiements

```
Création RDV:
  payments.status = 'initiated'
  payments.payout_status = 'pending'

Acceptation praticien:
  payments.status = 'pending'
  payments.payout_status = 'held'
  payments.hold_until = NOW() + 2 jours

Paiement réussi:
  payments.status = 'paid'
  payments.payout_status = 'held' (reste bloqué)
  
Déblocage automatique (après hold_until):
  payments.payout_status = 'ready'
  practitioner_balances.balance_available += net_amount
```

### Calcul des Montants

```
Montant Total = 10,000 XOF (exemple)
Commission Plateforme (5%) = 500 XOF
Frais Passerelle (2%) = 200 XOF (payé par plateforme)
Montant Net Praticien = 9,500 XOF
```

## Statuts AppointmentCard

```typescript
'pending' → 'En attente paiement' (yellow)
'awaiting_practitioner' → 'En attente praticien' (orange)
'confirmed' → 'Paiement requis' (amber)
'in-progress' → 'En cours' (blue)
'completed' → 'Terminé' (gray)
'cancelled' → 'Annulé' (red)
'rejected' → 'Refusé' (red)
```

## Actions Disponibles par Statut

### Patient
- `awaiting_practitioner`: Voir détails, Annuler, Contacter
- `confirmed`: **Payer**, Annuler, Contacter
- `in-progress`: Voir détails, Contacter
- `completed`: Voir détails, Laisser avis, Contacter

### Praticien
- `awaiting_practitioner`: **Accepter**, **Refuser**, Contacter
- `confirmed`: Voir détails, Attendre paiement, Contacter
- `in-progress`: **Terminer**, Contacter
- `completed`: Voir détails, Contacter

## Edge Functions Utilisées

1. **find-available-practitioner** (public)
   - Recherche praticien disponible
   - Vérifie disponibilités + exceptions
   - Calcule distance

2. **create-appointment-with-payment** (authentifié)
   - Transaction atomique RDV + Paiement
   - Rollback automatique si échec
   - Notifications praticien + patient

3. **handle-appointment-response** (authentifié)
   - Acceptation/Refus praticien
   - Mise à jour statuts
   - Notifications patient

4. **create-payment** (authentifié)
   - Création transaction FedaPay
   - Calcul frais
   - Génération URL paiement

5. **payment-webhook** (public, HMAC)
   - Réception événements FedaPay
   - Vérification sécurité
   - Mise à jour statuts

6. **release-held-funds** (cron)
   - Déblocage automatique fonds
   - Après hold_until dépassé
   - Mise à jour soldes

## Points de Vérification

### ✅ Complétés
- [x] Routing page d'accueil
- [x] Colonne payment_amount ajoutée
- [x] Documentation workflow complète
- [x] Notifications praticien/patient
- [x] Statuts cohérents
- [x] Calcul automatique montants
- [x] Déblocage automatique fonds

### ⚠️ À Vérifier
- [ ] Tester workflow complet end-to-end
- [ ] Vérifier messages de confirmation
- [ ] Tester avec comptes de test
- [ ] Vérifier transitions de statuts
- [ ] Tester rollback en cas d'échec

## Comptes de Test

```
Patient: patient@test.com / Patient123!
Praticien: praticien@test.com / Praticien123!
Admin: admin@test.com / Admin123!
```

## Commandes Utiles

### Créer comptes de test
```
/create-test-accounts
```

### Vérifier logs edge functions
```
Lovable Cloud → Functions → Logs
```

### Vérifier base de données
```
Lovable Cloud → Database → Tables
```
