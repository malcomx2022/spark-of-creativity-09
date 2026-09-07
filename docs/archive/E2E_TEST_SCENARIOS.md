# Scénarios de tests E2E - DomiCares

Ce document liste les scénarios de test bout en bout pour identifier les erreurs bloquantes de l'application. Chaque scénario peut être automatisé avec Playwright ou exécuté manuellement.

## 📋 Légende des alertes à surveiller

- 🔴 **Erreur console** : Messages d'erreur JavaScript dans la console
- 🌐 **Requête réseau en échec** : Status code 4xx ou 5xx
- ⏸️ **Écran figé** : Pas de réponse UI après 5 secondes
- 🚫 **Navigation impossible** : Redirection bloquée ou route incorrecte
- ⚠️ **Données manquantes** : Champs vides ou null non gérés

---

## 1. Tests d'authentification

### 1.1 Inscription patient
**Page de départ** : `/signup/patient`

**Actions** :
1. Remplir le formulaire avec email valide et mot de passe fort
2. Accepter les conditions d'utilisation
3. Cliquer sur "S'inscrire"
4. Vérifier la redirection vers le profil ou tableau de bord

**Alertes à surveiller** :
- 🔴 Erreurs console lors de la soumission du formulaire
- 🌐 Requête POST `/auth/v1/signup` en échec
- 🚫 Pas de redirection après inscription réussie
- ⏸️ Bouton "S'inscrire" reste en état "loading" indéfiniment

### 1.2 Inscription praticien
**Page de départ** : `/signup/practitioner`

**Actions** :
1. Remplir formulaire complet (nom, email, téléphone, spécialité, etc.)
2. Upload des documents KYC (diplôme, licence, assurance)
3. Accepter les CGV
4. Soumettre le formulaire
5. Vérifier message de succès et redirection

**Alertes à surveiller** :
- 🔴 Erreurs console sur upload de fichiers
- 🌐 Requête edge function `create-practitioner-account` en échec
- 🌐 Requête upload vers Wasabi/Storage en échec
- ⏸️ Upload figé sans feedback
- 🚫 Redirection vers mauvaise page

### 1.3 Connexion par téléphone (OTP)
**Page de départ** : `/login-otp`

**Actions** :
1. Entrer numéro de téléphone valide (+229...)
2. Cliquer sur "Envoyer le code"
3. Attendre réception du code OTP
4. Entrer le code reçu
5. Vérifier connexion et redirection

**Alertes à surveiller** :
- 🔴 Erreurs console lors de l'envoi du téléphone
- 🌐 Edge function `send-otp` en échec
- ⏸️ Pas de retour après envoi du code
- 🌐 Edge function `verify-otp` en échec
- 🚫 Pas de redirection après vérification OTP réussie

### 1.4 Connexion par email
**Page de départ** : `/login`

**Actions** :
1. Entrer email et mot de passe
2. Cliquer sur "Se connecter"
3. Vérifier redirection vers dashboard approprié

**Alertes à surveiller** :
- 🔴 Erreurs console lors de la soumission
- 🌐 Requête POST `/auth/v1/token` en échec
- 🚫 Mauvaise redirection (patient vs praticien vs coach vs admin)
- ⚠️ Session non persistée après rechargement

---

## 2. Tests de recherche et réservation

### 2.1 Recherche de praticiens médicaux
**Page de départ** : `/search-practitioners`

**Actions** :
1. Autoriser géolocalisation ou entrer adresse
2. Sélectionner spécialité dans le filtre
3. Ajuster le rayon de recherche
4. Vérifier affichage carte + liste
5. Cliquer sur un praticien dans la liste
6. Vérifier détails du profil

**Alertes à surveiller** :
- 🔴 Erreurs console de géolocalisation
- 🌐 Requête GET `/rest/v1/practitioners` en échec
- 🌐 Token Mapbox non chargé (carte vide)
- ⏸️ Carte ne s'affiche jamais
- ⚠️ Praticiens sans coordonnées GPS affichés incorrectement
- 🚫 Clic sur praticien n'ouvre pas le dialog

### 2.2 Voir profil praticien depuis la carte
**Page de départ** : `/search-practitioners` (carte affichée)

**Actions** :
1. Cliquer sur un marker de la carte
2. Cliquer sur "Voir le profil" dans le popup
3. Vérifier ouverture du dialog avec infos complètes
4. Cliquer sur "Itinéraire"
5. Vérifier ouverture de Google Maps

**Alertes à surveiller** :
- 🔴 Erreurs console au clic sur marker
- 🚫 Dialog ne s'ouvre pas
- ⚠️ Données praticien manquantes (image, téléphone, etc.)
- 🚫 Bouton "Itinéraire" n'ouvre pas Google Maps
- ⚠️ Coordonnées GPS null empêchent l'itinéraire

### 2.3 Demande de rendez-vous praticien médical
**Page de départ** : `/search-practitioners` (utilisateur connecté)

**Actions** :
1. Cliquer sur "Demander un rendez-vous" depuis profil praticien
2. Remplir formulaire (date, heure, adresse, raison)
3. Soumettre la demande
4. Vérifier confirmation et notification

**Alertes à surveiller** :
- 🔴 Erreurs console lors ouverture dialog de rendez-vous
- 🌐 Requête POST `/rest/v1/appointments` en échec
- ⏸️ Formulaire figé après soumission
- 🚫 Utilisateur non connecté non redirigé vers login
- ⚠️ Notification de succès non affichée

### 2.4 Recherche de coachs sportifs
**Page de départ** : `/search-coaches`

**Actions** :
1. Autoriser géolocalisation
2. Filtrer par type de session (groupe/individuel)
3. Voir les coachs sur la carte
4. Cliquer sur un coach
5. Demander un rendez-vous

**Alertes à surveiller** :
- 🔴 Erreurs console
- 🌐 Requête `practitioners?practitioner_type=eq.coach_sportif` en échec
- ⏸️ Carte ne charge pas
- 🚫 Clic sur coach n'ouvre rien
- 🚫 Utilisateur non connecté peut accéder au formulaire de rdv (devrait rediriger)

---

## 3. Tests du tableau de bord patient

### 3.1 Consultation du profil patient
**Page de départ** : `/dashboard/patient` > onglet "Profil"

**Actions** :
1. Se connecter en tant que patient
2. Accéder à l'onglet "Profil"
3. Modifier nom, téléphone, avatar
4. Enregistrer les modifications
5. Recharger la page et vérifier persistance

**Alertes à surveiller** :
- 🔴 Erreurs console au chargement du profil
- 🌐 Requête GET `/rest/v1/profiles` en échec
- 🌐 Requête PATCH `/rest/v1/profiles` en échec
- ⏸️ Bouton "Enregistrer" reste en loading
- ⚠️ Modifications non persistées après rechargement

### 3.2 Gestion du profil médical
**Page de départ** : `/dashboard/patient` > onglet "Profil médical"

**Actions** :
1. Compléter groupe sanguin, allergies, maladies chroniques
2. Ajouter médicaments actuels
3. Cocher "Partager avec les praticiens"
4. Sauvegarder
5. Vérifier sauvegarde

**Alertes à surveiller** :
- 🔴 Erreurs console
- 🌐 Requête POST/PATCH `/rest/v1/medical_profiles` en échec
- ⚠️ Case à cocher "Partager" ne fonctionne pas
- ⏸️ Sauvegarde bloquée

### 3.3 Visualisation des rendez-vous
**Page de départ** : `/dashboard/patient` > onglet par défaut

**Actions** :
1. Vérifier affichage des rendez-vous à venir
2. Vérifier affichage de l'historique
3. Cliquer sur "Voir les détails" d'un rendez-vous
4. Vérifier suivi GPS si rendez-vous en cours

**Alertes à surveiller** :
- 🔴 Erreurs console
- 🌐 Requête GET `/rest/v1/appointments` en échec
- ⚠️ Rendez-vous affichés avec des données manquantes
- ⏸️ Carte GPS ne charge pas
- 🌐 Mise à jour temps réel GPS non fonctionnelle

### 3.4 Inscription à une séance de groupe
**Page de départ** : `/dashboard/patient` > onglet "Séances de groupe"

**Actions** :
1. Parcourir les séances disponibles
2. Cliquer sur "S'inscrire" pour une séance
3. Confirmer l'inscription
4. Déclencher le paiement
5. Vérifier inscription réussie

**Alertes à surveiller** :
- 🔴 Erreurs console
- 🌐 Requête GET `/rest/v1/group_sessions` en échec
- 🌐 Edge function `register-group-session` en échec
- ⏸️ Modal de paiement ne s'ouvre pas
- 🚫 Paiement ne se déclenche pas

---

## 4. Tests du tableau de bord praticien/coach

### 4.1 Gestion des disponibilités
**Page de départ** : `/dashboard/practitioner` > onglet "Disponibilités"

**Actions** :
1. Se connecter en tant que praticien
2. Ajouter une nouvelle plage horaire (jour, début, fin)
3. Ajouter une exception (jour férié)
4. Désactiver une disponibilité
5. Sauvegarder et recharger

**Alertes à surveiller** :
- 🔴 Erreurs console
- 🌐 Requête POST `/rest/v1/practitioner_availability` en échec
- 🌐 Requête POST `/rest/v1/practitioner_exceptions` en échec
- ⏸️ Formulaire ne répond pas
- ⚠️ Disponibilités non persistées

### 4.2 Accepter/Refuser un rendez-vous
**Page de départ** : `/dashboard/practitioner` (rendez-vous en attente)

**Actions** :
1. Voir liste des demandes de rendez-vous
2. Cliquer sur "Accepter" pour un rendez-vous
3. Vérifier déclenchement du paiement patient
4. Vérifier notification envoyée au patient

**Alertes à surveiller** :
- 🔴 Erreurs console
- 🌐 Edge function `handle-appointment-response` en échec
- 🌐 Création du paiement échoue
- ⚠️ Notification non envoyée au patient
- 🚫 Statut du rendez-vous non mis à jour

### 4.3 Activer/Désactiver statut en ligne
**Page de départ** : `/dashboard/practitioner`

**Actions** :
1. Cliquer sur le bouton "Passer hors ligne"
2. Vérifier que le statut change visuellement
3. Vérifier que le praticien disparaît de la recherche
4. Repasser en ligne
5. Vérifier réapparition dans la recherche

**Alertes à surveiller** :
- 🔴 Erreurs console
- 🌐 Requête PATCH `/rest/v1/practitioners` en échec
- ⚠️ Changement visuel sans persistance en BDD
- 🚫 Praticien toujours visible en recherche alors qu'hors ligne

### 4.4 Créer une séance de groupe (coach)
**Page de départ** : `/dashboard/coach` > "Séances de groupe"

**Actions** :
1. Se connecter en tant que coach sportif
2. Cliquer sur "Créer une séance"
3. Remplir formulaire (nom, type, date, lieu, prix, participants min/max)
4. Créer la séance
5. Vérifier affichage dans la liste

**Alertes à surveiller** :
- 🔴 Erreurs console
- 🌐 Requête POST `/rest/v1/group_sessions` en échec
- ⏸️ Formulaire reste bloqué
- ⚠️ Séance créée mais non visible
- ⚠️ Champs requis non validés

### 4.5 Compléter un rapport de consultation
**Page de départ** : `/dashboard/practitioner` (rendez-vous terminé)

**Actions** :
1. Cliquer sur "Terminer la consultation" pour un rdv confirmé
2. Remplir le rapport (diagnostic, traitement, suivi)
3. Soumettre le rapport
4. Vérifier statut du rdv passe à "terminé"
5. Vérifier patient peut voir le rapport

**Alertes à surveiller** :
- 🔴 Erreurs console
- 🌐 Requête POST `/rest/v1/consultation_reports` en échec
- 🌐 Requête PATCH `/rest/v1/appointments` en échec
- ⏸️ Formulaire figé
- ⚠️ Rapport non visible côté patient

---

## 5. Tests de paiement

### 5.1 Paiement rendez-vous par Mobile Money
**Page de départ** : Modal de paiement (après acceptation rdv par praticien)

**Actions** :
1. Patient reçoit demande de paiement
2. Sélectionner Mobile Money
3. Entrer numéro de téléphone
4. Confirmer le paiement
5. Simuler validation depuis mobile
6. Vérifier rdv confirmé

**Alertes à surveiller** :
- 🔴 Erreurs console
- 🌐 Edge function `create-payment` en échec
- 🌐 Webhook FedaPay non reçu
- ⏸️ Attente infinie de confirmation
- ⚠️ Paiement réussi mais statut rdv non mis à jour
- 🌐 Requête POST `/rest/v1/payments` en échec

### 5.2 Enregistrer un moyen de paiement
**Page de départ** : `/dashboard/patient` > onglet "Paiements"

**Actions** :
1. Cliquer sur "Ajouter un moyen de paiement"
2. Entrer numéro Mobile Money
3. Cocher "Définir par défaut"
4. Accepter le consentement
5. Enregistrer
6. Vérifier sauvegarde

**Alertes à surveiller** :
- 🔴 Erreurs console
- 🌐 Requête POST `/rest/v1/saved_payment_methods` en échec
- ⏸️ Formulaire bloqué
- ⚠️ Numéro non chiffré côté serveur
- ⚠️ Consentement non enregistré

### 5.3 Historique des paiements patient
**Page de départ** : `/dashboard/patient` > onglet "Paiements"

**Actions** :
1. Vérifier affichage de l'historique complet
2. Filtrer par statut (réussi, en attente, échoué)
3. Cliquer sur "Voir le reçu"
4. Télécharger le reçu PDF

**Alertes à surveiller** :
- 🔴 Erreurs console
- 🌐 Requête GET `/rest/v1/payments` en échec
- ⚠️ Paiements affichés sans montant ou date
- 🚫 Clic "Voir le reçu" n'ouvre rien
- 🔴 Génération PDF échoue

---

## 6. Tests administration

### 6.1 Validation KYC praticien
**Page de départ** : `/admin` > "File KYC"

**Actions** :
1. Se connecter en tant qu'admin
2. Voir liste des praticiens en attente
3. Cliquer sur un praticien
4. Vérifier documents (diplômes, licence, assurance)
5. Valider ou rejeter avec commentaire
6. Vérifier notification envoyée au praticien

**Alertes à surveiller** :
- 🔴 Erreurs console
- 🌐 Requête GET `/rest/v1/practitioners?kyc_status=eq.pending` en échec
- ⏸️ Documents ne chargent pas
- 🌐 Edge function `send-kyc-status-notification` en échec
- 🚫 Statut non mis à jour après validation

### 6.2 Gestion des versements praticiens
**Page de départ** : `/admin` > "Versements"

**Actions** :
1. Voir liste des praticiens avec solde disponible
2. Créer un lot de paiement
3. Marquer le lot comme traité
4. Vérifier mise à jour des soldes praticiens

**Alertes à surveiller** :
- 🔴 Erreurs console
- 🌐 Requête GET `/rest/v1/practitioner_balances` en échec
- 🌐 Edge function `create-payout-batch` en échec
- ⚠️ Soldes non mis à jour après versement
- ⚠️ Calcul de commission incorrect

### 6.3 Réconciliation FedaPay
**Page de départ** : `/admin` > "Réconciliation"

**Actions** :
1. Sélectionner période (date début/fin)
2. Lancer la réconciliation
3. Voir rapport des anomalies
4. Vérifier correspondance paiements BDD vs FedaPay

**Alertes à surveiller** :
- 🔴 Erreurs console
- 🌐 Edge function `reconcile-fedapay` en échec
- ⏸️ Réconciliation ne se termine jamais
- ⚠️ Rapport affiche des faux positifs
- 🌐 Échec récupération transactions FedaPay

---

## 7. Tests du support et conformité

### 7.1 Créer un ticket de support
**Page de départ** : `/dashboard/patient` > onglet "Support"

**Actions** :
1. Cliquer sur "Nouveau ticket"
2. Remplir sujet, priorité, description
3. Soumettre le ticket
4. Vérifier confirmation et affichage dans la liste

**Alertes à surveiller** :
- 🔴 Erreurs console
- 🌐 Requête POST `/rest/v1/support_tickets` en échec
- ⏸️ Formulaire bloqué après soumission
- ⚠️ Ticket créé mais non visible dans la liste
- 🚫 Toast de confirmation non affiché

### 7.2 Export des données utilisateur (RGPD)
**Page de départ** : `/dashboard/patient` > onglet "Support" > "Export de mes données"

**Actions** :
1. Cliquer sur "Export de mes données"
2. Attendre génération du fichier JSON
3. Vérifier téléchargement automatique
4. Ouvrir le JSON et vérifier contenu (profil, rdv, paiements)

**Alertes à surveiller** :
- 🔴 Erreurs console lors du clic
- 🌐 Requêtes GET (profiles, appointments, medical_profiles) en échec
- ⏸️ Export bloqué sans retour
- ⚠️ Fichier JSON incomplet ou corrompu
- 🚫 Téléchargement ne démarre pas

### 7.3 Navigation vers CGU/Politique de confidentialité
**Page de départ** : `/dashboard/patient` > onglet "Support"

**Actions** :
1. Cliquer sur "Conditions générales d'utilisation"
2. Vérifier redirection vers `/terms-of-service`
3. Revenir et cliquer sur "Politique de confidentialité"
4. Vérifier redirection vers `/privacy-policy`

**Alertes à surveiller** :
- 🔴 Erreurs console
- 🚫 Clic ne déclenche aucune navigation
- 🚫 Pages CGU/Privacy introuvables (404)
- ⚠️ Retour arrière casse le dashboard

---

## 8. Tests des boutons d'urgence

### 8.1 Bouton urgence 112 (header desktop)
**Page de départ** : N'importe quelle page (desktop)

**Actions** :
1. Cliquer sur le bouton "Urgence 112" dans le header
2. Vérifier qu'un appel téléphonique se déclenche
3. Vérifier numéro composé : tel:112

**Alertes à surveiller** :
- 🔴 Erreurs console au clic
- 🚫 Clic ne déclenche rien
- ⚠️ Mauvais numéro composé
- ⚠️ Lien `tel:` non fonctionnel sur l'appareil

### 8.2 Bouton urgence 112 (menu mobile)
**Page de départ** : N'importe quelle page (mobile)

**Actions** :
1. Ouvrir le menu hamburger
2. Cliquer sur "Urgence 112"
3. Vérifier déclenchement de l'appel

**Alertes à surveiller** :
- 🔴 Erreurs console
- 🚫 Clic sans effet
- ⚠️ Appel ne démarre pas

---

## 9. Tests de navigation et routing

### 9.1 Navigation page d'accueil → Services
**Page de départ** : `/`

**Actions** :
1. Cliquer sur "En savoir plus" dans le CTA
2. Vérifier redirection vers `/services`
3. Vérifier chargement complet de la page

**Alertes à surveiller** :
- 🔴 Erreurs console
- 🚫 Clic ne redirige pas
- 🚫 Page 404 ou rechargement complet de l'app
- ⚠️ Utilisation de `<a>` au lieu de `<Link>` (reload complet)

### 9.2 Redirection auto selon rôle utilisateur
**Page de départ** : `/` (utilisateur connecté)

**Actions** :
1. Patient connecté → cliquer sur "Mon tableau de bord"
2. Vérifier redirection vers `/dashboard/patient`
3. Praticien connecté → cliquer sur "Mon tableau de bord"
4. Vérifier redirection vers `/dashboard/practitioner`
5. Coach connecté → vérifier redirection vers `/dashboard/coach`

**Alertes à surveiller** :
- 🔴 Erreurs console
- 🚫 Mauvaise redirection (tous vers patient par ex.)
- 🌐 Requête pour déterminer le rôle en échec
- ⏸️ Redirection bloquée indéfiniment

---

## 10. Tests de performance et stabilité

### 10.1 Rechargement de page sans perte de session
**Page de départ** : N'importe quel dashboard (utilisateur connecté)

**Actions** :
1. Se connecter
2. Recharger la page (F5)
3. Vérifier que l'utilisateur reste connecté
4. Vérifier que le bon dashboard s'affiche

**Alertes à surveiller** :
- 🔴 Erreurs console au rechargement
- 🚫 Déconnexion automatique
- 🚫 Redirection vers login
- ⚠️ Données session perdues (localStorage/sessionStorage vides)

### 10.2 Navigation avec connexion lente
**Page de départ** : N'importe quelle page

**Actions** :
1. Simuler connexion 3G lente
2. Naviguer entre les pages
3. Vérifier affichage des loaders/skeletons
4. Vérifier que l'UI ne freeze pas

**Alertes à surveiller** :
- ⏸️ UI complètement figée sans retour
- ⚠️ Pas de feedback visuel de chargement
- 🔴 Timeout des requêtes sans gestion d'erreur
- ⚠️ Données partielles affichées incorrectement

### 10.3 Gestion des erreurs réseau
**Page de départ** : N'importe quelle page avec requêtes API

**Actions** :
1. Couper la connexion internet
2. Tenter une action (charger profil, créer rdv, etc.)
3. Vérifier affichage d'un message d'erreur
4. Rétablir la connexion
5. Vérifier retry automatique ou manuel

**Alertes à surveiller** :
- 🔴 Crash de l'app sans gestion d'erreur
- ⏸️ Requête bloquée sans timeout
- ⚠️ Aucun message d'erreur à l'utilisateur
- ⚠️ Pas d'option pour réessayer

---

## 📊 Checklist globale de validation

Avant tout déploiement en production, s'assurer que :

- [ ] Tous les boutons de header/footer sont fonctionnels
- [ ] Toutes les routes existent et ne renvoient pas de 404
- [ ] Les utilisateurs non connectés sont redirigés vers login pour les actions protégées
- [ ] Les rôles utilisateurs (patient/praticien/coach/admin) ont accès uniquement à leurs dashboards respectifs
- [ ] Tous les formulaires valident correctement les champs requis
- [ ] Les uploads de fichiers fonctionnent (KYC, avatars, etc.)
- [ ] Les paiements déclenchent correctement les webhooks et mettent à jour les statuts
- [ ] Les notifications sont envoyées aux bonnes personnes
- [ ] Le système de géolocalisation fonctionne (autorisations demandées, carte affichée)
- [ ] Les liens externes (Google Maps, tel:) s'ouvrent correctement
- [ ] L'export de données RGPD génère un fichier JSON complet
- [ ] Les erreurs console sont gérées et ne cassent pas l'application
- [ ] Le rechargement de page ne déconnecte pas l'utilisateur

---

## 🚀 Automatisation avec Playwright

Les scénarios ci-dessus peuvent être convertis en tests Playwright avec la structure suivante :

```typescript
import { test, expect } from '@playwright/test';

test.describe('Inscription patient', () => {
  test('doit créer un compte patient avec succès', async ({ page }) => {
    // 1. Naviguer vers la page de signup
    await page.goto('/signup/patient');
    
    // 2. Remplir le formulaire
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'SecureP@ssw0rd!');
    await page.check('input[type="checkbox"]'); // CGV
    
    // 3. Soumettre
    await page.click('button[type="submit"]');
    
    // 4. Vérifier redirection
    await expect(page).toHaveURL(/\/dashboard\/patient/);
    
    // 5. Vérifier aucune erreur console
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    expect(errors).toHaveLength(0);
  });
});
```

**Surveillance des requêtes réseau** :
```typescript
page.on('response', response => {
  if (response.status() >= 400) {
    console.error(`Request failed: ${response.url()} - ${response.status()}`);
  }
});
```

**Détection d'écran figé** :
```typescript
await page.waitForSelector('.loading-spinner', { state: 'hidden', timeout: 5000 });
```
