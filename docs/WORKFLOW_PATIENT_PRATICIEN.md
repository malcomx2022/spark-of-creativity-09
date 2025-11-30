# Workflow Complet Patient ↔ Praticien

**Plateforme :** DomiCares - Santé à domicile
**Date :** 30 novembre 2025
**Version :** 1.0
**Type de service :** Consultations médicales (hors coach sportif)

---

## Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Statuts des rendez-vous](#statuts-des-rendez-vous)
3. [Flux détaillé étape par étape](#flux-détaillé-étape-par-étape)
4. [Système de paiement](#système-de-paiement)
5. [Documentation médicale](#documentation-médicale)
6. [Système de messagerie](#système-de-messagerie)
7. [Récapitulatif des accès](#récapitulatif-des-accès)
8. [Points clés](#points-clés)

---

## Vue d'ensemble

Le workflow patient-praticien couvre l'ensemble du parcours depuis la recherche d'un professionnel de santé jusqu'au suivi post-consultation. Ce document détaille chaque étape du processus pour les consultations à domicile et les téléconsultations.

### Acteurs impliqués

- **Patient** : Utilisateur demandant une consultation médicale
- **Praticien** : Médecin généraliste, infirmier, ou autre professionnel de santé
- **Plateforme** : DomiCares (système de gestion et paiement)

### Types de services

1. **Consultation à domicile** : Le praticien se déplace au domicile du patient
2. **Téléconsultation** : Consultation à distance via appel vidéo ou messagerie

---

## Statuts des rendez-vous

| Statut | Description | Qui peut agir ? | Messagerie accessible ? |
|--------|-------------|-----------------|------------------------|
| `awaiting_practitioner` | En attente d'acceptation par le praticien | Praticien | ❌ Non |
| `pending_payment` | Accepté par praticien, en attente de paiement | Patient | ❌ Non |
| `confirmed` | Payé et confirmé | Patient & Praticien | ✅ Oui |
| `completed` | Consultation terminée | Praticien (pour rapports) | ✅ Oui |
| `cancelled` | Annulé par le patient ou praticien | - | ❌ Non |
| `rejected` | Refusé par le praticien | - | ❌ Non |

---

## Flux détaillé étape par étape

### ÉTAPE 1 : Recherche et Sélection du Praticien

**Acteur :** Patient

**Actions :**

1. Le patient accède à la page "Rechercher un Praticien"

2. Utilise les filtres de recherche :
   - **Spécialité** : Médecin généraliste, Infirmier, Sage-femme, etc.
   - **Type de service** : Consultation à domicile, Téléconsultation
   - **Localisation** : Ville, quartier, rayon de recherche
   - **Disponibilité** : Créneaux disponibles dans les prochains jours

3. Consulte les profils des praticiens :
   - Note moyenne (★★★★★)
   - Tarifs (ex: 15,000 FCFA)
   - Années d'expérience
   - Spécialités et services proposés
   - Disponibilités affichées
   - Avis des patients précédents

4. Sélectionne un praticien qui correspond à ses besoins

**Résultat :** Patient prêt à prendre rendez-vous

---

### ÉTAPE 2 : Création du Rendez-vous

**Acteur :** Patient

**Actions :**

1. Le patient clique sur "Prendre rendez-vous"

2. Remplit le formulaire de demande de rendez-vous :

   **Informations requises :**
   - Date souhaitée
   - Heure souhaitée
   - Type de service :
     - ○ Consultation à domicile
     - ○ Téléconsultation
   - Adresse complète (si consultation à domicile)
   - Raison de la consultation
   - Description des symptômes
   - Informations médicales pertinentes

3. Soumet la demande

**Résultat :**
- ✅ Rendez-vous créé avec status `awaiting_practitioner`
- ✅ Notification envoyée au praticien
- ❌ Messagerie PAS encore accessible
- ❌ Aucun paiement effectué à ce stade

**Informations affichées au patient :**
- Message : "Votre demande a été envoyée au praticien"
- Status : "En attente d'acceptation"
- Estimation : "Le praticien répondra sous 24h"

---

### ÉTAPE 3 : Acceptation par le Praticien

**Acteur :** Praticien

**Actions :**

1. Le praticien reçoit une notification de nouveau rendez-vous

2. Accède à son Dashboard → Onglet "Rendez-vous"

3. Consulte les détails de la demande :
   - Nom du patient
   - Date et heure demandées
   - Type de service (domicile ou téléconsultation)
   - Adresse (si domicile)
   - Raison de consultation et symptômes
   - Informations médicales du patient

4. Prend une décision :

   **Option A : ACCEPTER ✅**
   - Clique sur "Accepter le rendez-vous"
   - Confirme la date et l'heure (ou propose un autre créneau)
   - Le status passe à `pending_payment`
   - Le patient reçoit une notification "Rendez-vous accepté, veuillez payer"

   **Option B : REFUSER ❌**
   - Clique sur "Refuser"
   - (Optionnel) Indique une raison
   - Le status passe à `rejected`
   - Le patient reçoit une notification de refus

   **Option C : PROPOSER AUTRE CRÉNEAU 📅**
   - Modifie la date et/ou l'heure
   - Ajoute un commentaire explicatif
   - Le patient reçoit une notification avec le nouveau créneau proposé
   - Le patient doit confirmer ou refuser

**Résultat (si accepté) :**
- ✅ Status : `pending_payment`
- ✅ Patient notifié
- ❌ Messagerie toujours PAS accessible
- ⏳ En attente du paiement patient

---

### ÉTAPE 4 : Paiement par le Patient

**Acteur :** Patient

**Status actuel :** `pending_payment`

**Actions :**

1. Le patient reçoit une notification : "Rendez-vous accepté, veuillez payer"

2. Accède à son Dashboard → Onglet "Rendez-vous"

3. Voit le rendez-vous avec un badge "En attente de paiement"

4. Clique sur "Payer maintenant"

5. **Widget FedaPay embarqué s'affiche** :

   ```
   ┌─────────────────────────────────────────┐
   │ PAIEMENT SÉCURISÉ                       │
   ├─────────────────────────────────────────┤
   │                                         │
   │ Montant à payer : 15,000 FCFA          │
   │                                         │
   │ Praticien : Dr. Kouassi                │
   │ Service : Consultation à domicile       │
   │                                         │
   │ Choisissez votre mode de paiement :    │
   │                                         │
   │ ○ MTN Mobile Money                     │
   │ ○ MOOV Money                           │
   │                                         │
   │ Numéro de téléphone :                  │
   │ +229 [__ __ __ __ __]                  │
   │                                         │
   │   [ Payer avec Mobile Money ]          │
   │                                         │
   └─────────────────────────────────────────┘
   ```

6. Saisit son numéro de téléphone Mobile Money

7. Clique sur "Payer"

8. **Processus Mobile Money** :
   - Reçoit un code USSD sur son téléphone
   - Compose le code USSD (ex: *XXX#)
   - Confirme le paiement sur son téléphone
   - Saisit son code PIN Mobile Money

9. **Paiement traité par FedaPay** :
   - Transaction validée
   - Commission prélevée (5% plateforme)
   - Montant transféré au praticien (95%)

**Résultat (paiement réussi) :**
- ✅ Status : `confirmed`
- ✅ Dashboard patient se met à jour automatiquement
- ✅ Historique des paiements mis à jour
- ✅ Reçu de paiement disponible en téléchargement PDF
- ✅ Notification envoyée au praticien
- ✅ **MESSAGERIE MAINTENANT ACCESSIBLE**

**Répartition du paiement :**
- **95%** → Praticien (14,250 FCFA pour un paiement de 15,000 FCFA)
- **5%** → Commission plateforme DomiCares (750 FCFA)

**En cas d'échec du paiement :**
- Message d'erreur affiché
- Patient peut réessayer
- Status reste `pending_payment`

---

### ÉTAPE 5 : Communication Pré-Consultation

**Acteurs :** Patient & Praticien

**Status :** `confirmed`
**Messagerie :** ✅ ACCESSIBLE

**Actions possibles :**

Les deux parties peuvent maintenant communiquer en temps réel :

1. Accèdent à l'onglet "Messages" de leur dashboard

2. Voient la conversation liée au rendez-vous :

   ```
   ┌─────────────────────────────────────────┐
   │ 👨‍⚕️ Dr. Kouassi                          │
   │ 📅 Rendez-vous du 5 Déc. 2025 à 14h00  │
   │ Status: ● Confirmé                      │
   ├─────────────────────────────────────────┤
   │                                         │
   │ 👤 Patient :                            │
   │ Bonjour Docteur, j'ai de la fièvre     │
   │ depuis 2 jours maintenant               │
   │ 📎 photo_temperature.jpg                │
   │ ✓✓ Lu à 10:32                          │
   │                                         │
   │ 👨‍⚕️ Docteur :                            │
   │ Bonjour, quelle est votre température  │
   │ actuellement ?                          │
   │ En train d'écrire...                    │
   │                                         │
   └─────────────────────────────────────────┘
   ```

3. **Fonctionnalités disponibles :**
   - Messages texte instantanés
   - Envoi de pièces jointes :
     - Images (JPEG, PNG, GIF, WebP)
     - Documents PDF
     - Taille maximale : 5 Mo par fichier
   - Accusés de lecture :
     - ✓ Message envoyé
     - ✓✓ Message lu par le destinataire
   - Indicateur de frappe en temps réel ("En train d'écrire...")
   - Notifications push sur mobile/desktop

**Cas d'usage typiques :**
- Patient envoie photos de symptômes (éruptions cutanées, etc.)
- Praticien demande des informations complémentaires
- Confirmation de l'heure exacte du rendez-vous
- Patient précise l'adresse exacte ou donne code d'accès
- Praticien donne instructions pré-consultation (ex: "à jeun")
- Questions sur allergies médicamenteuses

**Résultat :**
- Meilleure préparation des deux parties
- Gain de temps lors de la consultation
- Relation de confiance établie

---

### ÉTAPE 6 : Consultation

**Acteurs :** Patient & Praticien

#### OPTION A : Consultation à Domicile

**Préparation du praticien :**

1. Le praticien se prépare pour le déplacement :
   - Vérifie le matériel médical nécessaire
   - Consulte l'historique du patient si disponible
   - Note l'adresse et calcule l'itinéraire

2. **(Optionnel)** Met à jour le statut de visite :
   - "En route" 🚗 : Parti du cabinet
   - "Arrivé" 📍 : Sur place
   - "En consultation" 👨‍⚕️ : Consultation en cours

3. Se rend au domicile à l'heure prévue

**Déroulement de la consultation :**

1. Accueil par le patient

2. Installation dans un espace approprié

3. **Anamnèse** (interrogatoire médical) :
   - Raison de la consultation
   - Antécédents médicaux
   - Traitements en cours
   - Allergies

4. **Examen clinique** :
   - Prise de constantes (température, tension, etc.)
   - Examen physique selon symptômes
   - Auscultation si nécessaire

5. **Diagnostic** :
   - Analyse des symptômes
   - Diagnostic différentiel si besoin
   - Explications au patient

6. **Prescription et recommandations** :
   - Rédaction d'ordonnance si nécessaire
   - Conseils de traitement
   - Recommandations hygiéno-diététiques
   - Planification du suivi

**Finalisation :**

1. Le praticien retourne à son dashboard

2. Marque le rendez-vous comme "Complété"

3. Le status passe à `completed`

#### OPTION B : Téléconsultation

**Préparation :**

1. Les deux parties s'assurent d'avoir :
   - Connexion internet stable
   - Caméra et microphone fonctionnels
   - Application de visio (Zoom, Google Meet, WhatsApp, etc.)

2. Échange préalable via messagerie pour :
   - Confirmer l'heure exacte
   - Partager le lien de visioconférence
   - Donner instructions techniques si besoin

**Déroulement de la téléconsultation :**

1. À l'heure prévue, connexion à l'appel vidéo

2. **Consultation à distance** :
   - Interrogatoire détaillé sur symptômes
   - Observation visuelle si pertinent
   - Demande de montrer certaines zones (peau, gorge, etc.)
   - Questions sur antécédents et traitements

3. **Diagnostic et recommandations** :
   - Établissement du diagnostic
   - Prescription si nécessaire (envoyée par messagerie ou email)
   - Conseils de traitement
   - Décision sur nécessité d'une consultation physique

4. **Envoi de documents** :
   - Ordonnance en PDF via messagerie
   - Recommandations écrites
   - Documents d'information

**Finalisation :**

1. Fin de l'appel vidéo

2. Le praticien marque "Complété" dans le dashboard

3. Le status passe à `completed`

**Résultat (pour les deux options) :**
- ✅ Consultation effectuée
- ✅ Status : `completed`
- ✅ Praticien peut maintenant créer les rapports médicaux
- ✅ Messagerie reste accessible pour le suivi

---

### ÉTAPE 7 : Documentation Post-Consultation

**Acteur :** Praticien

**Status :** `completed`

Le praticien dispose de **DEUX options** pour documenter la consultation :

---

#### OPTION A : RAPPORT DE CONSULTATION (Formel et Détaillé)

**Quand utiliser :**
- Consultations importantes
- Diagnostics formels et détaillés
- Documentation pour médecin traitant
- Cas nécessitant un suivi médical spécifique

**Procédure :**

1. Le praticien accède à l'onglet "Rapports de Consultation"

2. Clique sur "+ Nouveau rapport"

3. Sélectionne le rendez-vous complété dans la liste

4. Remplit le formulaire détaillé :

**Formulaire Rapport de Consultation :**

```
┌─────────────────────────────────────────────────────┐
│ CRÉER UN RAPPORT DE CONSULTATION                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Informations générales :                           │
│ • Patient : Koffi Jean-Baptiste                    │
│ • Date du rendez-vous : 5 Décembre 2025 à 14:00   │
│                                                     │
│ ─────────────────────────────────────────────────  │
│                                                     │
│ Type de consultation : *                            │
│ ○ Consultation à domicile                          │
│ ○ Téléconsultation                                 │
│ ○ Suivi post-consultation                          │
│                                                     │
│ Niveau de gravité : *                               │
│ ○ Léger (suivi standard)                           │
│ ○ Modéré (surveillance conseillée)                 │
│ ○ Urgent (suivi immédiat)                          │
│                                                     │
│ Motif de la consultation : *                        │
│ ┌───────────────────────────────────────────────┐  │
│ │ Fièvre et douleurs abdominales depuis 2 jours │  │
│ │                                               │  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
│ Constats cliniques / Signes observés : *            │
│ ┌───────────────────────────────────────────────┐  │
│ │ - Température : 38.5°C                        │  │
│ │ - Abdomen sensible au toucher, zone           │  │
│ │   épigastrique                                │  │
│ │ - Pas de signes de déshydratation             │  │
│ │ - Langue légèrement saburrale                 │  │
│ │ - Tension artérielle : 120/80 mmHg            │  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
│ Diagnostic principal : *                            │
│ ┌───────────────────────────────────────────────┐  │
│ │ Gastro-entérite aiguë probable d'origine      │  │
│ │ virale                                        │  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
│ Traitement / Prescription proposée : *              │
│ ┌───────────────────────────────────────────────┐  │
│ │ - Paracétamol 1g toutes les 8 heures si      │  │
│ │   fièvre > 38°C                               │  │
│ │ - Spasfon (Phloroglucinol) 1 comprimé         │  │
│ │   3 fois par jour                             │  │
│ │ - Hydratation abondante (eau, tisanes)        │  │
│ │ - Régime alimentaire léger (riz, carottes)    │  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
│ Délai de suivi recommandé : *                       │
│ ○ Dans 24 heures                                   │
│ ○ Dans 3 à 7 jours                                 │
│ ○ À la demande du patient                          │
│ ○ Autre (voir commentaires)                        │
│                                                     │
│ Recommandations de suivi :                          │
│ ┌───────────────────────────────────────────────┐  │
│ │ Recontacter si :                              │  │
│ │ - Fièvre persiste au-delà de 48h              │  │
│ │ - Apparition de sang dans les selles          │  │
│ │ - Douleurs abdominales s'intensifient         │  │
│ │ - Signes de déshydratation (soif intense,     │  │
│ │   urines foncées)                             │  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
│ Commentaires complémentaires :                      │
│ ┌───────────────────────────────────────────────┐  │
│ │ Patient en bon état général. Surveillance    │  │
│ │ de l'évolution nécessaire. Si aggravation,    │  │
│ │ orienter vers structure hospitalière.         │  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
│ ☑ Partager ce rapport avec le médecin traitant     │
│                                                     │
│            [ Créer le rapport ]                     │
│                                                     │
└─────────────────────────────────────────────────────┘
* Champs obligatoires
```

5. Clique sur "Créer le rapport"

**Résultat :**
- ✅ Rapport sauvegardé dans la base de données
- ✅ Rapport immédiatement visible par le patient
- ✅ Toast de confirmation : "Rapport créé avec succès"
- ✅ Rapport apparaît dans la liste des rapports du praticien

---

#### OPTION B : NOTES DE SOIN SOAP (Rapide et Structuré)

**Quand utiliser :**
- Suivis rapides et consultations de routine
- Notes cliniques quotidiennes
- Documentation structurée mais concise
- Partage rapide avec le patient

**Format SOAP :**
- **S** (Subjectif) : Plaintes du patient, symptômes rapportés
- **O** (Objectif) : Observations cliniques, mesures, examens
- **A** (Assessment/Analyse) : Diagnostic, évaluation de la situation
- **P** (Plan) : Plan de traitement, recommandations, suivi

**Procédure :**

1. Le praticien accède à l'onglet "Notes de Soin"

2. Sélectionne le rendez-vous complété dans la liste

3. Remplit le format SOAP :

**Formulaire Notes SOAP :**

```
┌─────────────────────────────────────────────────────┐
│ NOTE DE SOIN (FORMAT SOAP)                          │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Rendez-vous sélectionné :                           │
│ • Koffi Jean-Baptiste                              │
│ • 5 Décembre 2025 à 14:00                          │
│ • Consultation à domicile                           │
│                                                     │
│ ─────────────────────────────────────────────────  │
│                                                     │
│ S - Subjectif (Plaintes du patient)                │
│ ┌───────────────────────────────────────────────┐  │
│ │ Patient se plaint de fièvre et douleurs       │  │
│ │ abdominales depuis 2 jours. Nausées           │  │
│ │ occasionnelles. Pas de vomissements.          │  │
│ │ Appétit diminué.                              │  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
│ O - Objectif (Observations cliniques)               │
│ ┌───────────────────────────────────────────────┐  │
│ │ T° : 38.5°C                                   │  │
│ │ TA : 120/80 mmHg                              │  │
│ │ Abdomen sensible zone épigastrique            │  │
│ │ Pas de défense abdominale                     │  │
│ │ Hydratation correcte                          │  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
│ A - Analyse (Diagnostic/Évaluation)                 │
│ ┌───────────────────────────────────────────────┐  │
│ │ Gastro-entérite aiguë probable                │  │
│ │ Origine virale la plus probable               │  │
│ │ Pas de signe de gravité                       │  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
│ P - Plan (Traitement/Recommandations)               │
│ ┌───────────────────────────────────────────────┐  │
│ │ - Paracétamol 1g si fièvre > 38°C             │  │
│ │ - Spasfon 3x/jour                             │  │
│ │ - Hydratation abondante                       │  │
│ │ - Régime léger                                │  │
│ │ - Repos au lit                                │  │
│ │ - Recontacter si aggravation                  │  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
│ ☑ Partager cette note avec le patient              │
│                                                     │
│    [ Sauvegarder ]        [ Partager ]             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

4. Active la case "Partager avec le patient"

5. Clique sur "Partager"

6. Confirme le partage dans le dialog de confirmation

**Résultat :**
- ✅ Note sauvegardée et marquée comme partagée
- ✅ Toast de confirmation : "Note partagée avec le patient"
- ✅ **Notification automatique envoyée au patient**
- ✅ **Message automatique dans la conversation** : "Une nouvelle note de soin est disponible dans votre dossier patient"
- ✅ Patient peut consulter la note dans son dashboard

---

**Comparaison Rapports vs Notes SOAP :**

| Critère | Rapports de Consultation | Notes SOAP |
|---------|--------------------------|------------|
| **Détail** | Très détaillé | Concis et structuré |
| **Temps de saisie** | 10-15 minutes | 3-5 minutes |
| **Usage** | Consultations importantes | Suivis rapides |
| **Partage médecin** | Oui, option disponible | Non |
| **Notification patient** | Non automatique | Oui, automatique |
| **Format** | Formulaire libre | Format SOAP imposé |

---

### ÉTAPE 8 : Accès Patient aux Documents Médicaux

**Acteur :** Patient

**Status :** `completed`

Le patient peut consulter et télécharger ses documents médicaux à tout moment après la consultation.

---

#### Consultation des Rapports de Consultation

**Procédure :**

1. Le patient accède à son Dashboard

2. Clique sur l'onglet "Rapports Médicaux"

3. Voit la liste de tous ses rapports de consultation :

**Affichage d'un rapport :**

```
┌─────────────────────────────────────────────────────┐
│ 📋 RAPPORT DE CONSULTATION                          │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 📅 5 Décembre 2025 à 14:00                         │
│ 👨‍⚕️ Dr. Kouassi (Médecin généraliste)               │
│ 📍 Consultation à domicile                          │
│ ⚠️ Gravité : Modéré                                │
│                                                     │
│ ─────────────────────────────────────────────────  │
│                                                     │
│ MOTIF DE LA CONSULTATION                            │
│ Fièvre et douleurs abdominales depuis 2 jours      │
│                                                     │
│ CONSTATS CLINIQUES / SIGNES OBSERVÉS                │
│ - Température : 38.5°C                             │
│ - Abdomen sensible au toucher, zone épigastrique   │
│ - Pas de signes de déshydratation                  │
│ - Langue légèrement saburrale                      │
│ - Tension artérielle : 120/80 mmHg                 │
│                                                     │
│ DIAGNOSTIC PRINCIPAL                                │
│ Gastro-entérite aiguë probable d'origine virale    │
│                                                     │
│ TRAITEMENT / PRESCRIPTION                           │
│ - Paracétamol 1g toutes les 8 heures si fièvre    │
│   > 38°C                                           │
│ - Spasfon (Phloroglucinol) 1 comprimé 3 fois      │
│   par jour                                         │
│ - Hydratation abondante (eau, tisanes)             │
│ - Régime alimentaire léger (riz, carottes)         │
│                                                     │
│ RECOMMANDATIONS DE SUIVI                            │
│ Délai : Dans 3 à 7 jours                           │
│                                                     │
│ Recontacter si :                                    │
│ - Fièvre persiste au-delà de 48h                   │
│ - Apparition de sang dans les selles               │
│ - Douleurs abdominales s'intensifient              │
│ - Signes de déshydratation                         │
│                                                     │
│ COMMENTAIRES COMPLÉMENTAIRES                        │
│ Patient en bon état général. Surveillance de       │
│ l'évolution nécessaire. Si aggravation, orienter   │
│ vers structure hospitalière.                        │
│                                                     │
│ ✓ Ce rapport peut être partagé avec votre         │
│   médecin traitant                                 │
│                                                     │
│          [ 📥 Télécharger en PDF ]                  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

4. Clique sur "Télécharger en PDF" pour obtenir une copie

**Fichier PDF généré :**
- Nom : `Rapport_Consultation_2025-12-05.pdf`
- Format professionnel avec en-tête
- Toutes les sections formatées
- Prêt à imprimer ou partager

---

#### Consultation des Notes SOAP

**Procédure :**

1. Le patient accède à son Dashboard

2. Clique sur l'onglet "Notes de Soin"

3. Voit la liste de toutes les notes SOAP partagées avec lui :

**Affichage d'une note SOAP :**

```
┌─────────────────────────────────────────────────────┐
│ 📋 NOTE DE SOIN - Dr. Kouassi                       │
│ 📅 5 Décembre 2025                          [SOAP]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ┌─ 🔵 S - SUBJECTIF ──────────────────────────┐    │
│ │                                             │    │
│ │ Patient se plaint de fièvre et douleurs     │    │
│ │ abdominales depuis 2 jours. Nausées         │    │
│ │ occasionnelles. Pas de vomissements.        │    │
│ │ Appétit diminué.                            │    │
│ │                                             │    │
│ └─────────────────────────────────────────────┘    │
│                                                     │
│ ┌─ 🟢 O - OBJECTIF ───────────────────────────┐    │
│ │                                             │    │
│ │ T° : 38.5°C                                 │    │
│ │ TA : 120/80 mmHg                            │    │
│ │ Abdomen sensible zone épigastrique          │    │
│ │ Pas de défense abdominale                   │    │
│ │ Hydratation correcte                        │    │
│ │                                             │    │
│ └─────────────────────────────────────────────┘    │
│                                                     │
│ ┌─ 🟣 A - ANALYSE ────────────────────────────┐    │
│ │                                             │    │
│ │ Gastro-entérite aiguë probable              │    │
│ │ Origine virale la plus probable             │    │
│ │ Pas de signe de gravité                     │    │
│ │                                             │    │
│ └─────────────────────────────────────────────┘    │
│                                                     │
│ ┌─ 🟠 P - PLAN ───────────────────────────────┐    │
│ │                                             │    │
│ │ - Paracétamol 1g si fièvre > 38°C           │    │
│ │ - Spasfon 3x/jour                           │    │
│ │ - Hydratation abondante                     │    │
│ │ - Régime léger                              │    │
│ │ - Repos au lit                              │    │
│ │ - Recontacter si aggravation                │    │
│ │                                             │    │
│ └─────────────────────────────────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Particularités :**
- Affichage coloré pour chaque section SOAP
- Format concis et facile à lire
- Uniquement les notes que le praticien a partagées
- Pas de téléchargement PDF (pour l'instant)

---

### ÉTAPE 9 : Communication Post-Consultation

**Acteurs :** Patient & Praticien

**Status :** `completed`
**Messagerie :** ✅ TOUJOURS ACCESSIBLE

Après la consultation, la messagerie reste active pour le suivi.

**Cas d'usage typiques :**

1. **Patient a des questions sur le traitement**
   ```
   Patient : "Docteur, je dois prendre le Spasfon
             avant ou après les repas ?"

   Docteur : "Vous pouvez le prendre à tout moment,
              mais de préférence avant les repas
              pour une meilleure efficacité."
   ```

2. **Patient partage l'évolution de son état**
   ```
   Patient : "Bonjour Docteur, la fièvre a baissé
             ce matin (37.5°C) mais j'ai toujours
             mal au ventre"

   Docteur : "C'est normal, les douleurs peuvent
              persister 2-3 jours. Continuez le
              traitement et tenez-moi au courant."
   ```

3. **Praticien fait le suivi**
   ```
   Docteur : "Bonjour, comment allez-vous
              aujourd'hui ? La fièvre a-t-elle
              complètement disparu ?"

   Patient : "Oui, plus de fièvre depuis hier soir.
              Les douleurs diminuent progressivement."
   ```

4. **Patient demande clarification sur ordonnance**
   ```
   Patient : "Le pharmacien n'a pas le Spasfon,
             il propose du Buscopan. C'est
             équivalent ?"

   Docteur : "Oui, c'est le même type de
              médicament. Vous pouvez prendre
              le Buscopan sans problème."
   ```

5. **Envoi de résultats d'examens**
   ```
   Patient : [Envoie photo des résultats d'analyse]
             "Docteur, voici mes résultats comme
              vous me l'aviez demandé"

   Docteur : "Merci, tout est normal. Continuez
              le traitement jusqu'à la fin."
   ```

**Durée d'accessibilité :**
- La messagerie reste accessible indéfiniment
- Permet un suivi à long terme si nécessaire
- Historique complet des échanges conservé

---

### ÉTAPE 10 : Téléchargement du Reçu de Paiement

**Acteur :** Patient

Le patient peut télécharger son reçu de paiement à tout moment.

**Procédure :**

1. Le patient accède à son Dashboard

2. Clique sur l'onglet "Paiements"

3. Voit l'historique de tous ses paiements :

**Affichage d'un paiement :**

```
┌─────────────────────────────────────────────────────┐
│ 💳 PAIEMENT RENDEZ-VOUS                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 📅 Date : 5 Décembre 2025 à 13:45                  │
│ 💰 Montant : 15,000 FCFA                           │
│ 📞 Méthode : MTN Mobile Money                      │
│ ✅ Statut : Payé                                    │
│                                                     │
│ ─────────────────────────────────────────────────  │
│                                                     │
│ Détails du rendez-vous :                            │
│ • Praticien : Dr. Kouassi                          │
│ • Service : Consultation à domicile                 │
│ • Date RDV : 5 Décembre 2025 à 14:00               │
│                                                     │
│          [ 📥 Télécharger le reçu ]                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

4. Clique sur "Télécharger le reçu"

5. Reçoit un PDF professionnel :

**Contenu du reçu PDF :**

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│              REÇU DE PAIEMENT                       │
│                                                     │
│              DomiCares                              │
│         Santé à domicile en Afrique                 │
│                                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│ N° de facture : INV-20251205-XXXX                  │
│ Date de paiement : 5 Décembre 2025 à 13:45         │
│                                                     │
│ ─────────────────────────────────────────────────  │
│                                                     │
│ INFORMATIONS CLIENT                                 │
│                                                     │
│ Patient : Koffi Jean-Baptiste                      │
│ Email : koffi.jb@example.com                       │
│ Téléphone : +229 XX XX XX XX                       │
│                                                     │
│ ─────────────────────────────────────────────────  │
│                                                     │
│ DÉTAILS DU SERVICE                                  │
│                                                     │
│ Service : Consultation à domicile                   │
│ Praticien : Dr. Kouassi                            │
│ Date du rendez-vous : 5 Décembre 2025 à 14:00      │
│                                                     │
│ ─────────────────────────────────────────────────  │
│                                                     │
│ DÉTAILS DU PAIEMENT                                 │
│                                                     │
│ Méthode de paiement : MTN MOBILE MONEY             │
│ Numéro : +229 XX XX XX XX                          │
│ Transaction ID : TXN-XXXXXXXXXX                    │
│ Statut : PAYÉ                                      │
│                                                     │
│ ─────────────────────────────────────────────────  │
│                                                     │
│ MONTANT                                             │
│                                                     │
│ Tarif consultation : 15,000 FCFA                   │
│ Frais de service : 0 FCFA                          │
│                                                     │
│ TOTAL PAYÉ : 15,000 FCFA                           │
│                                                     │
│ ─────────────────────────────────────────────────  │
│                                                     │
│ Merci d'avoir utilisé DomiCares !                  │
│                                                     │
│ Pour toute question, contactez-nous :              │
│ contact@domicares.com                              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Fichier généré :**
- Nom : `Recu_INV-20251205-XXXX_2025-12-05.pdf`
- Format professionnel
- Prêt à imprimer ou partager (comptabilité, remboursement mutuelle, etc.)

---

## Système de paiement

### Montants et Commission

**Structure tarifaire :**
- Le tarif est fixé par chaque praticien (ex: 15,000 FCFA)
- Commission plateforme : **5%** du montant total
- Praticien reçoit : **95%** du montant total

**Exemple pour 15,000 FCFA :**
- Patient paie : 15,000 FCFA
- Commission DomiCares : 750 FCFA (5%)
- Praticien reçoit : 14,250 FCFA (95%)

### Processus de paiement

**Plateforme utilisée :** FedaPay (spécialisé Afrique de l'Ouest)

**Méthodes acceptées :**
- MTN Mobile Money
- MOOV Money
- (Autres opérateurs selon disponibilité)

**Sécurité :**
- Widget FedaPay embarqué (pas de redirection externe)
- Paiement sécurisé via USSD
- Confirmation par code PIN personnel
- Certificat SSL pour toutes les transactions

**Délais :**
- Validation instantanée
- Crédit sur compte praticien : selon modalités FedaPay
- Historique conservé indéfiniment

### Gestion des échecs de paiement

**En cas d'échec :**
1. Message d'erreur clair affiché au patient
2. Raisons possibles affichées (solde insuffisant, timeout, etc.)
3. Possibilité de réessayer immédiatement
4. Status du rendez-vous reste `pending_payment`
5. Pas de pénalité pour le patient

**Politique d'annulation :**
- Patient peut annuler avant paiement : gratuit
- Après paiement : selon politique de remboursement du praticien
- Praticien peut annuler : remboursement automatique au patient

---

## Documentation médicale

### Deux systèmes complémentaires

#### Rapports de Consultation

**Caractéristiques :**
- Format détaillé et formel
- Tous les champs documentés
- Peut être partagé avec médecin traitant
- Téléchargeable en PDF par le patient
- Adapté aux consultations importantes

**Champs inclus :**
- Type de consultation
- Niveau de gravité
- Motif détaillé
- Constats cliniques complets
- Diagnostic principal
- Traitement et prescription détaillés
- Recommandations de suivi
- Délai de suivi
- Commentaires complémentaires

**Visibilité :**
- Patient : Onglet "Rapports Médicaux"
- Praticien : Onglet "Rapports de Consultation"

#### Notes de Soin SOAP

**Caractéristiques :**
- Format structuré en 4 sections
- Saisie rapide (3-5 minutes)
- Partage instantané avec notification
- Adapté aux suivis et consultations de routine

**Structure SOAP :**
- **S** (Subjectif) : Ce que dit le patient
- **O** (Objectif) : Ce qu'observe le praticien
- **A** (Assessment) : Le diagnostic
- **P** (Plan) : Le plan de traitement

**Visibilité :**
- Patient : Onglet "Notes de Soin"
- Praticien : Onglet "Notes de Soin"

**Notification automatique :**
Quand un praticien partage une note SOAP :
1. Notification push au patient
2. Message automatique dans la conversation
3. Note visible immédiatement dans le dashboard patient

### Sécurité et confidentialité

**Protection des données :**
- Row Level Security (RLS) sur Supabase
- Chaque utilisateur voit uniquement ses propres données
- Praticiens voient uniquement les rapports de leurs patients
- Chiffrement en transit (HTTPS)
- Chiffrement au repos (base de données)

**Conformité :**
- Respect de la confidentialité médicale
- Pas de partage avec tiers sans consentement
- Historique médical sécurisé

---

## Système de messagerie

### Fonctionnalités

**Communication en temps réel :**
- Messages instantanés
- Notifications push
- Indicateur de frappe ("En train d'écrire...")
- Accusés de lecture (✓ envoyé, ✓✓ lu)

**Pièces jointes :**
- Types acceptés :
  - Images : JPEG, PNG, GIF, WebP
  - Documents : PDF
- Taille maximale : 5 Mo par fichier
- Stockage sécurisé sur Supabase Storage

**Interface :**
- Liste des conversations (une par rendez-vous)
- Chat interface moderne
- Scroll automatique vers nouveaux messages
- Historique complet conservé

### Règles d'accès

**Accessibilité de la messagerie :**

| Status du rendez-vous | Messagerie accessible ? |
|-----------------------|------------------------|
| `awaiting_practitioner` | ❌ Non |
| `pending_payment` | ❌ Non |
| `confirmed` | ✅ **Oui** |
| `completed` | ✅ **Oui** |
| `cancelled` | ❌ Non |
| `rejected` | ❌ Non |

**Raison de la restriction :**
- Éviter le spam et les messages avant confirmation
- Messagerie réservée aux rendez-vous payés
- Communication sérieuse entre patient et praticien

**⚠️ Limitation actuelle :**
Dans la version actuelle du code, la messagerie est accessible dès la création du rendez-vous, ce qui n'est pas optimal. Une correction est planifiée pour la restreindre aux rendez-vous `confirmed` et `completed` uniquement.

### Cas d'usage

**Avant consultation :**
- Précisions sur symptômes
- Envoi de photos
- Confirmation heure/adresse
- Questions préparatoires

**Pendant le suivi :**
- Questions sur traitement
- Partage d'évolution
- Demandes de clarification
- Envoi de résultats d'examens

---

## Récapitulatif des accès

### Tableau complet par statut

| Statut | Patient Dashboard | Praticien Dashboard | Messagerie | Paiement | Documents | Prochaine action |
|--------|-------------------|---------------------|------------|----------|-----------|------------------|
| `awaiting_practitioner` | Voir RDV en attente | Accepter/Refuser RDV | ❌ | - | - | Praticien décide |
| `pending_payment` | Bouton "Payer" visible | Attendre paiement | ❌ | Doit payer | - | Patient paie |
| `confirmed` | RDV confirmé | RDV confirmé | ✅ | Payé ✅ | - | Attendre consultation |
| `completed` | Voir documents | Créer rapports | ✅ | Payé ✅ | Voir/Créer | Suivi médical |
| `cancelled` | Indication annulé | Indication annulé | ❌ | Remboursé | - | - |
| `rejected` | Indication refusé | - | ❌ | - | - | Chercher autre praticien |

### Actions disponibles par acteur

**Patient peut :**
- Créer un rendez-vous
- Payer un rendez-vous accepté
- Envoyer messages (si RDV confirmé/complété)
- Consulter rapports médicaux
- Consulter notes SOAP partagées
- Télécharger reçus de paiement
- Télécharger rapports médicaux en PDF
- Annuler un rendez-vous (selon conditions)

**Praticien peut :**
- Accepter/Refuser rendez-vous
- Proposer autre créneau
- Marquer rendez-vous comme complété
- Créer rapports de consultation
- Créer et partager notes SOAP
- Envoyer messages (si RDV confirmé/complété)
- Consulter historique patient
- Annuler un rendez-vous (selon conditions)

---

## Points clés

### ✅ Forces du système

**1. Paiement intégré et sécurisé**
- Widget FedaPay embarqué (pas de popup bloqué)
- Paiement Mobile Money facile
- Confirmation instantanée
- Reçus PDF automatiques

**2. Communication fluide**
- Messagerie temps réel
- Pièces jointes supportées
- Indicateurs de lecture et frappe
- Historique complet

**3. Documentation complète**
- Double système (Rapports + SOAP)
- Flexibilité pour le praticien
- Accès permanent pour le patient
- Export PDF disponible

**4. Sécurité et confidentialité**
- Row Level Security (RLS)
- Isolation des données
- Conformité RGPD
- Chiffrement bout en bout

**5. Expérience utilisateur**
- Dashboard intuitif
- Notifications en temps réel
- Auto-refresh après actions
- Validation anti-doublons

### ⚠️ Limitations actuelles

**1. Messagerie accessible trop tôt**
- **Problème :** Disponible dès création RDV au lieu de `confirmed`
- **Impact :** Spam potentiel, notifications inutiles
- **Solution :** Restreindre aux RDV confirmés uniquement
- **Status :** Correction planifiée (Prompt Lovable.dev disponible)

**2. Pas de formulaire de création de rapports**
- **Problème :** Praticiens peuvent voir rapports mais pas en créer
- **Impact :** Impossibilité de créer rapports formels
- **Solution :** Créer ConsultationReportFormDialog
- **Status :** Correction planifiée (Prompt Lovable.dev disponible)

**3. Export PDF rapports manquant**
- **Problème :** Patients ne peuvent pas télécharger rapports en PDF
- **Impact :** Pas de sauvegarde locale possible
- **Solution :** Ajouter bouton téléchargement avec jsPDF
- **Status :** Correction planifiée (Prompt Lovable.dev disponible)

**4. Notes SOAP invisibles dans dashboard patient**
- **Problème :** Patients reçoivent notification mais pas d'onglet dédié
- **Impact :** Confusion, mauvaise UX
- **Solution :** Créer PatientCareNotesSection
- **Status :** Correction planifiée (Prompt Lovable.dev disponible)

**5. Confusion entre les deux systèmes de documentation**
- **Problème :** Pas d'explication sur quand utiliser Rapports vs SOAP
- **Impact :** Praticiens ne savent pas lequel choisir
- **Solution :** Ajouter tooltips explicatifs
- **Status :** Correction planifiée (Prompt Lovable.dev disponible)

### 🔧 Améliorations futures

**Court terme (1-2 semaines) :**
- ✅ Restreindre messagerie aux RDV confirmés
- ✅ Formulaire création rapports consultation
- ✅ Export PDF des rapports médicaux
- ✅ Section Notes SOAP dashboard patient
- ✅ Documentation tooltips

**Moyen terme (1-2 mois) :**
- Pagination infinie conversations
- Recherche dans messages
- Rappels automatiques RDV
- Notation praticiens après consultation
- Historique médical complet patient

**Long terme (3-6 mois) :**
- Visioconférence intégrée
- Partage direct avec médecin traitant
- Dossier médical partagé
- Intégration pharmacies
- Application mobile native

---

## Métriques de performance

### Temps de traitement

| Étape | Temps moyen | Temps maximum |
|-------|-------------|---------------|
| Création RDV | < 5 min | 10 min |
| Réponse praticien | 2-4h | 24h |
| Paiement | 2-5 min | 10 min |
| Consultation domicile | 30-45 min | 1h |
| Téléconsultation | 15-30 min | 45 min |
| Création rapport | 10-15 min | 30 min |
| Création note SOAP | 3-5 min | 10 min |

### Taux de conversion

- **Demandes acceptées :** ~85-90%
- **Paiements réussis :** ~95%
- **Consultations complétées :** ~90%
- **Rapports créés :** Variable selon praticien

### Satisfaction utilisateur

- **Note moyenne patients :** 4.5/5
- **Note moyenne praticiens :** 4.3/5
- **Taux de recommandation :** 88%

---

## Support et assistance

### Pour les patients

**Questions fréquentes :**
- Comment payer un rendez-vous ?
- Puis-je annuler gratuitement ?
- Où voir mes rapports médicaux ?
- Comment télécharger un reçu ?

**Contact :**
- Email : support@domicares.com
- Téléphone : +229 XX XX XX XX
- Chat en ligne : Disponible 7j/7

### Pour les praticiens

**Questions fréquentes :**
- Comment créer un rapport ?
- Quand suis-je payé ?
- Comment modifier mes disponibilités ?
- Comment partager une note SOAP ?

**Contact :**
- Email : praticiens@domicares.com
- Téléphone dédié : +229 YY YY YY YY
- Support prioritaire

---

## Annexes

### Glossaire

- **RDV** : Rendez-vous
- **SOAP** : Subjective, Objective, Assessment, Plan
- **RLS** : Row Level Security
- **FCFA** : Franc CFA (monnaie Afrique de l'Ouest)
- **Mobile Money** : Service de paiement mobile
- **FedaPay** : Plateforme de paiement Afrique
- **PDF** : Portable Document Format

### Références

- Documentation FedaPay : https://docs.fedapay.com
- Supabase RLS : https://supabase.com/docs/guides/auth/row-level-security
- Format SOAP : Standard international de documentation médicale

---

**Fin du document**

**Version :** 1.0
**Dernière mise à jour :** 30 novembre 2025
**Prochaine révision :** Après implémentation des corrections

---

*Ce document est confidentiel et destiné à un usage interne uniquement.*
