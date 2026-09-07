# Workflow Complet - Système de Rendez-vous et Paiement

## Vue d'ensemble

Ce document décrit les workflows complets du système, de la prise de rendez-vous jusqu'au paiement et au déblocage des fonds.

## 1. Workflow Patient - Prise de Rendez-vous

### Étape 1 : Demande de Rendez-vous
**Page:** PatientDashboard → Onglet "Rendez-vous"

1. Le patient clique sur "Nouveau Rendez-vous"
2. Remplit le formulaire :
   - Spécialité
   - Date et heure
   - Raison de la consultation
   - Niveau d'urgence
   - Localisation (GPS ou manuelle)

### Étape 2 : Recherche Automatique de Praticien
**Edge Function:** `find-available-practitioner`

1. Le système recherche un praticien disponible:
   - Dans un rayon de 15km
   - Avec la spécialité demandée
   - Disponible à la date/heure
   - Vérifie les disponibilités et exceptions

2. Si praticien trouvé:
   - Affiche les informations du praticien
   - Distance
   - Note

### Étape 3 : Création Atomique RDV + Paiement
**Edge Function:** `create-appointment-with-payment`

1. **Transaction atomique:**
   ```
   a) Création du rendez-vous (status: awaiting_practitioner)
   b) Création du paiement initial (status: initiated)
   c) Si échec → rollback automatique
   ```

2. **Notifications envoyées:**
   - ✅ Praticien: "Nouvelle demande de rendez-vous" (email/SMS/push)
   - ✅ Patient: "Demande envoyée, réponse sous 30min" (email/push)

3. **Statuts initiaux:**
   - `appointments.status = 'awaiting_practitioner'`
   - `payments.status = 'initiated'`
   - `payments.payout_status = 'pending'`

### Étape 4 : Attente Réponse Praticien
**Interface Patient:**

1. Carte de rendez-vous affiche:
   - Badge "En attente praticien" (orange)
   - Message: "Le praticien répondra sous 30 minutes"
   - Détails du rendez-vous
   - Informations du praticien

2. Le patient reçoit une notification quand le praticien répond

---

## 2. Workflow Praticien - Acceptation/Refus

### Étape 1 : Réception Notification
**Notifications:**
- Email
- SMS
- Push notification
- Badge dans l'interface

### Étape 2 : Consultation de la Demande
**Page:** PractitionerDashboard → Onglet "Rendez-vous"

1. Le praticien voit la carte du rendez-vous:
   - Badge "En attente praticien" (orange)
   - Informations patient
   - Date, heure, adresse
   - Raison de la consultation
   - Niveau d'urgence

2. Deux boutons disponibles:
   - ✅ "Accepter"
   - ❌ "Refuser"

### Étape 3A : Acceptation du Rendez-vous
**Edge Function:** `handle-appointment-response`

1. **Mise à jour du rendez-vous:**
   ```
   appointments.status: awaiting_practitioner → confirmed
   ```

2. **Mise à jour du paiement:**
   ```
   payments.status: initiated → pending
   payments.payout_status: pending → held
   payments.hold_until: now() + 2 jours
   ```

3. **Notifications:**
   - ✅ Patient: "Rendez-vous confirmé, veuillez payer" (email/SMS/push)
   - Lien vers page de paiement

### Étape 3B : Refus du Rendez-vous
**Edge Function:** `handle-appointment-response`

1. **Mise à jour du rendez-vous:**
   ```
   appointments.status: awaiting_practitioner → rejected
   ```

2. **Annulation du paiement:**
   ```
   payments.status: initiated → canceled
   ```

3. **Notifications:**
   - ✅ Patient: "Rendez-vous refusé, nouvelle recherche..." (email/push)
   - Déclenchement automatique recherche nouveau praticien

---

## 3. Workflow Patient - Paiement

### Étape 1 : Notification de Confirmation
**Déclencheur:** Acceptation du praticien

1. Patient reçoit notification:
   - "Rendez-vous confirmé"
   - "Veuillez effectuer le paiement"
   - Lien vers paiement

### Étape 2 : Accès Page de Paiement
**Interface Patient:**

1. Carte de rendez-vous affiche:
   - Badge "Paiement requis" (amber)
   - Bouton "Payer" bien visible
   - Montant à payer
   - Délai de paiement

### Étape 3 : Processus de Paiement
**Component:** PaymentDialog

1. **Choix du mode de paiement:**
   - Mobile Money (MTN, Moov, etc.)
   - Carte bancaire
   - Méthode sauvegardée

2. **Saisie coordonnées:**
   - Numéro de téléphone
   - Validation format

3. **Soumission:**
   - Affichage loader
   - "Traitement du paiement..."

### Étape 4 : Traitement FedaPay
**Edge Function:** `create-payment`

1. **Initialisation transaction:**
   ```
   - Création transaction FedaPay
   - Calcul frais et commission
   - Génération URL de paiement
   - Retour URL au client
   ```

2. **Calcul automatique:**
   ```
   Commission Plateforme = Montant × 5%
   Frais Passerelle = Montant × 2% (payé par plateforme)
   Montant Net Praticien = Montant - Commission
   ```

### Étape 5 : Paiement FedaPay
**Redirection:** Page FedaPay

1. Patient saisit ses informations
2. Confirme le paiement
3. FedaPay traite la transaction

### Étape 6 : Webhook FedaPay
**Edge Function:** `payment-webhook`

1. **Réception événement:**
   - Vérification signature HMAC
   - Validation timestamp (< 5 min)
   - Vérification idempotence

2. **Si paiement réussi:**
   ```
   payments.status: pending → paid
   payments.payout_status: held → held (reste bloqué)
   payments.hold_until: maintenu à +2 jours
   appointments.status: confirmed → in-progress
   ```

3. **Notifications:**
   - ✅ Patient: "Paiement réussi, rendez-vous confirmé"
   - ✅ Praticien: "Paiement reçu, patient confirmé"

4. **Si paiement échoué:**
   ```
   payments.status: pending → failed
   appointments.status: confirmed → cancelled
   ```

---

## 4. Workflow Praticien - Consultation et Finalisation

### Étape 1 : Préparation Consultation
**Interface Praticien:**

1. Rendez-vous visible avec:
   - Badge "En cours" (bleu)
   - Informations patient
   - Adresse intervention
   - Bouton "Terminer"

### Étape 2 : Réalisation Consultation
**Actions praticien:**
- Navigation vers patient
- Réalisation soins
- Rédaction notes de soin (optionnel)

### Étape 3 : Finalisation
**Interface Praticien:**

1. Clic sur "Terminer"
2. Confirmation action
3. **Mise à jour:**
   ```
   appointments.status: in-progress → completed
   ```

4. **Notifications:**
   - ✅ Patient: "Consultation terminée, merci"
   - Invitation à laisser un avis

---

## 5. Système de Déblocage Automatique des Fonds

### Période de Rétention
**Configuration:** 2 jours après paiement

```
payments.hold_until = payment_date + 2 jours
```

### Déblocage Automatique
**Déclencheur:** Atteinte de `hold_until`

1. **Vérification conditions:**
   ```sql
   - payout_status = 'held'
   - hold_until <= NOW()
   - status = 'paid'
   - appointment.status = 'completed' OU hold_until dépassé
   ```

2. **Transition automatique:**
   ```
   payments.payout_status: held → ready
   ```

3. **Mise à jour soldes:**
   ```
   practitioner_balances.balance_on_hold -= net_amount
   practitioner_balances.balance_available += net_amount
   ```

4. **Notification:**
   - ✅ Praticien: "Fonds disponibles pour retrait"

---

## 6. Workflow Praticien - Retrait des Fonds

### Étape 1 : Consultation Solde
**Page:** PractitionerDashboard → Onglet "Reversements"

1. Affichage:
   - Solde disponible
   - Solde bloqué
   - Solde en attente
   - Historique retraits

### Étape 2 : Configuration Coordonnées
**Page:** PractitionerDashboard → Onglet "Coordonnées paiement"

1. Choix méthode:
   - Mobile Money
   - Virement bancaire

2. Saisie informations:
   - Numéro/IBAN
   - Nom titulaire
   - Vérification optionnelle

### Étape 3 : Demande de Retrait
**Interface:**

1. Montant à retirer (limité au disponible)
2. Confirmation
3. **Création payout:**
   ```
   payouts.status = 'pending'
   practitioner_balances.balance_available -= amount
   ```

### Étape 4 : Traitement Admin
**Page Admin:** AdminDashboard → Section "Paiements praticiens"

1. Validation manuelle ou automatique
2. Exécution virement
3. **Mise à jour:**
   ```
   payouts.status: pending → completed
   ```

---

## Schéma de Statuts

### Appointments
```
pending → awaiting_practitioner → confirmed → in-progress → completed
                                    ↓              ↓
                                rejected      cancelled
```

### Payments
```
initiated → pending → paid → refunded
              ↓        ↓
           failed   canceled
```

### Payout Status
```
pending → held → ready → processing → completed
                  ↓
               failed
```

---

## Points Critiques de Sécurité

### 1. Atomicité des Transactions
- ✅ Rollback automatique si échec création RDV/paiement
- ✅ Vérification idempotence webhooks
- ✅ Protection contre double traitement

### 2. Vérifications de Sécurité
- ✅ Signature HMAC webhooks FedaPay
- ✅ Validation timestamp événements (< 5 min)
- ✅ RLS policies strictes
- ✅ Service role key pour opérations sensibles

### 3. Gestion d'Erreurs
- ✅ Rollback automatique
- ✅ Notifications échecs
- ✅ Logs détaillés
- ✅ Retry automatique (edge-function-retry)

---

## Configuration Requise

### Secrets
```
FEDAPAY_PUBLIC_KEY
FEDAPAY_SECRET_KEY
FEDAPAY_WEBHOOK_SECRET
PLATFORM_WALLET_ID
TWILIO_* (notifications SMS)
RESEND_API_KEY (notifications email)
WEB_PUSH_* (notifications push)
```

### Edge Functions Déployées
```
✅ find-available-practitioner (public)
✅ create-appointment-with-payment (authentifié)
✅ handle-appointment-response (authentifié)
✅ create-payment (authentifié)
✅ payment-webhook (public, HMAC)
✅ release-held-funds (cron/admin)
```

### Cron Jobs
```
- Déblocage automatique fonds: Toutes les heures
- Nettoyage paiements expirés: Quotidien
- Rappels paiement: Toutes les 6h
```
