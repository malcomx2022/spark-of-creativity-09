# 📘 Logique de Paiement Patient-Praticien

## Vue d'ensemble

Ce document détaille la logique complète du système de paiement entre patients et praticiens dans l'application DomiCares.

---

## 🔄 Flux Complet du Rendez-vous et Paiement

### 1. **Création du Rendez-vous (Patient)**

```
Patient → Sélectionne praticien + date + heure
       → Validation automatique : pas de doublon à la même date
       → Rendez-vous créé avec status: "awaiting_practitioner"
```

**Règle de validation :**
- ✅ Un patient **PEUT** avoir plusieurs rendez-vous avec le même praticien
- ✅ Les rendez-vous **DOIVENT** être à des dates différentes
- ❌ Si tentative de créer un rendez-vous à une date où il en existe déjà un actif avec ce praticien :
  ```
  Message d'erreur : "Vous avez déjà un rendez-vous avec Dr. X
  le [date] à [heure]. Veuillez choisir une autre date."
  ```

### 2. **Réponse du Praticien**

Le praticien a 3 options :

#### Option A : Accepter ✅
```
Status: awaiting_practitioner → pending_payment
- Le patient reçoit une notification
- Le montant est calculé automatiquement
- Le bouton "Payer maintenant" s'affiche
```

#### Option B : Refuser ❌
```
Status: awaiting_practitioner → rejected
- Le rendez-vous est marqué comme refusé
- Aucun paiement n'est possible
- Le patient peut créer un nouveau rendez-vous
```

#### Option C : Pas de réponse ⏰
```
Status reste: awaiting_practitioner
- Le patient peut annuler
- Après 24h, notification de rappel au praticien
```

### 3. **Processus de Paiement (Mode Embarqué)**

#### Étape 1 : Ouverture du Dialog de Paiement
```typescript
Patient clique "Payer maintenant"
→ PaymentDialog s'ouvre
→ Vérification : existe-t-il un paiement en cours ?
  ├─ OUI : Réutilise le paiement existant (< 10 min)
  └─ NON : Permet de créer un nouveau paiement
```

#### Étape 2 : Initialisation FedaPay
```typescript
Patient remplit le formulaire :
- Nom complet ✅
- Email (optionnel)
- Numéro Mobile Money (MTN/MOOV)
- Accepte de sauvegarder la méthode (optionnel)

→ Appel Edge Function "create-payment"
→ Création transaction FedaPay
→ Récupération transactionId
```

#### Étape 3 : Affichage du Widget Embarqué
```typescript
Widget FedaPay s'affiche dans le conteneur #fedapay-embed
- Mode : Embarqué (pas de popup)
- Container : <div id="fedapay-embed" className="w-full min-h-[420px]" />
- Configuration :
  {
    public_key: config.publicKey,
    environment: 'sandbox' | 'live',
    transaction: { id: transactionId, amount, description },
    customer: { phone_number: { number, country: 'bj' } },
    currency: { iso: 'XOF' },
    locale: 'fr',
    container: '#fedapay-embed' ✅
  }
```

#### Étape 4 : Paiement Mobile Money
```
Patient → Reçoit requête USSD sur son mobile
       → Entre son code PIN Mobile Money
       → Transaction FedaPay traitée
       → Webhook envoyé par FedaPay
```

#### Étape 5 : Mise à Jour Automatique
```typescript
onComplete callback appelé
→ payload.reason === CHECKOUT_COMPLETED
→ setPaymentStatus('success')
→ onSuccess() appelé
→ Invalidation des queries React Query :
  - queryClient.invalidateQueries(['appointments', 'patient', patientId])
  - queryClient.invalidateQueries(['payments', patientId])
→ Dashboard se rafraîchit automatiquement ✅
→ Historique des paiements mis à jour ✅
→ Status rendez-vous : pending_payment → confirmed ✅
```

---

## 💳 Statuts de Paiement

| Statut | Description | Action Patient | Action Praticien |
|--------|-------------|----------------|------------------|
| `initiated` | Paiement créé | Compléter le paiement | Attendre |
| `pending` | En attente confirmation | Vérifier USSD mobile | Attendre |
| `paid` | Paiement réussi ✅ | Rendez-vous confirmé | Préparer intervention |
| `failed` | Paiement échoué ❌ | Réessayer | Attendre |
| `canceled` | Paiement annulé | Recommencer | - |
| `refunded` | Remboursé | Montant retourné | - |

---

## 📊 Logique de Commission et Payout

### Commission Plateforme
```
Montant total paiement : 100%
├─ Commission plateforme : X% (configurable)
├─ Frais FedaPay : Y% (selon contrat)
└─ Montant net praticien : 100% - X% - Y%
```

### Statuts de Payout (Praticien)

| Statut | Description | Timing |
|--------|-------------|--------|
| `pending` | En attente du payout | Après confirmation rendez-vous |
| `processing` | Payout en cours | Traitement manuel admin |
| `completed` | Payout effectué ✅ | Fonds transférés au praticien |
| `failed` | Échec du payout | Nécessite intervention admin |

---

## 🔐 Méthodes de Paiement Sauvegardées

### Fonctionnalités
- ✅ Chiffrement AES-256-GCM des numéros de téléphone
- ✅ Stockage sécurisé dans `saved_payment_methods`
- ✅ Option "Par défaut" pour sélection automatique
- ✅ Masquage partiel : `+229 XX XX XX 01`

### Flux de Sauvegarde
```typescript
Patient coche "Enregistrer cette méthode"
→ Après paiement réussi :
  - Numéro chiffré avec clé unique par utilisateur
  - Stocké en base de données
  - Utilisable pour paiements futurs
```

---

## 📄 Génération de Reçu PDF

### Contenu du Reçu
```
┌─────────────────────────────────────┐
│      REÇU DE PAIEMENT                │
│   DomiCares - Soins à domicile       │
├─────────────────────────────────────┤
│ Numéro facture : PAY-XXXXXXXX       │
│ Date paiement  : 15 janvier 2025     │
│ Méthode        : MTN MOBILE MONEY    │
│ Statut         : Payé ✅             │
│ Transaction FedaPay : 123456         │
├─────────────────────────────────────┤
│ DÉTAILS DU PAIEMENT                  │
│                                      │
│ Montant total      : 10,000 XOF      │
│ Commission (5%)    : -500 XOF        │
│ Frais transaction  : -200 XOF        │
│ ────────────────────────────────     │
│ Montant net        : 9,300 XOF       │
└─────────────────────────────────────┘

Généré le : 15/01/2025 à 14:30
```

### Téléchargement
```typescript
Bouton "Télécharger le reçu (PDF)"
→ handleDownloadPDF()
→ Génération avec jsPDF + jspdf-autotable
→ Fichier : Recu_PAY-XXXXXXXX_15_janvier_2025.pdf
→ Toast de confirmation ✅
```

---

## 🚨 Gestion des Erreurs

### Paiement en Double (409)
```
Erreur détectée : Un paiement existe déjà pour ce rendez-vous
→ Toast avec bouton "Annuler et réessayer"
→ Appel à cancel-pending-payment
→ Nouveau paiement possible
```

### Webhook FedaPay Échoué
```
Paiement marqué "paid" côté FedaPay
Mais statut non mis à jour en DB
→ Système de retry automatique (3x)
→ Logs dans audit_logs
→ Notification admin si échec persistant
```

### Expiration du Paiement
```
Paiement créé > 10 minutes
→ Marqué comme expiré
→ Suppression automatique
→ Patient peut créer un nouveau paiement
```

---

## 📱 Modes de Test (Sandbox)

### Numéros de Test FedaPay Bénin
```
✅ Succès MTN  : +229 66 00 00 01
✅ Succès MOOV : +229 64 00 00 01
❌ Échec simulé: +229 66 00 00 00
```

### Affichage Automatique
```typescript
{fedapayConfig?.environment === 'sandbox' && (
  <Alert>
    Mode Test - Utilisez ces numéros :
    - MTN succès : +229 66 00 00 01
    - MOOV succès : +229 64 00 00 01
  </Alert>
)}
```

---

## ✅ Checklist de Validation

Avant de déployer en production :

- [ ] Clé API FedaPay Live configurée
- [ ] Domaine autorisé dans FedaPay dashboard
- [ ] Webhook URL configurée et testée
- [ ] Montants de commission validés
- [ ] Génération de reçu testée
- [ ] Flow de payout praticien testé
- [ ] Validation rendez-vous en double activée
- [ ] Logs d'audit activés
- [ ] Tests de charge effectués

---

## 📞 Support

En cas de problème :
1. Vérifier les logs dans `audit_logs`
2. Consulter le dashboard admin > Payment Flows
3. Utiliser le sandbox tester pour reproduire
4. Contacter l'équipe technique DomiCares

---

**Dernière mise à jour :** 30 novembre 2025
**Version :** 2.0
**Auteur :** Équipe Technique DomiCares
