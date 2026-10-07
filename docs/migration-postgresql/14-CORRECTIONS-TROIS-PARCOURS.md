# Corrections des trois parcours — 7 octobre 2026

Base : `main` / `2042838`. Branche : `codex/correct-three-workflows-20261007`.
Ordre demandé : paiement et déconnexion, notification de message, contact public.
Le document 13 local préexistant est conservé sans modification.

## 1. Paiement et changement de compte

L'état local utilise une enveloppe version 2 avec `ownerId`. Un ancien état sans
propriétaire n'est jamais adopté. La lecture et l'écriture vérifient le compte
actuel et la session stockée ; un callback d'un ancien compte est ignoré.
Logout (y compris silencieux), connexion d'un autre compte et événements storage
purgent la progression. Une rotation du même compte la conserve. Le contenu
protégé React est remonté lorsque l'identité change, pour supprimer l'état en mémoire.
Le journal affichant le paiement restauré a été retiré.

Tests : restauration du propriétaire, rotation, logout, changement de compte,
état historique, propriétaire étranger, absence de session, callback périmé,
déconnexion inter-onglets et contenu nul.

## 2. Notifications et conversation ciblée

Les nouveaux liens désignent `/dashboard/patient`, `/dashboard/practitioner` ou
`/dashboard/coach`, avec `tab=messages&appointment=<id>` selon le destinataire.
L'ancienne route `/dashboard` résout le rôle via l'API et conserve les paramètres.
Les trois tableaux de bord synchronisent leur onglet avec l'URL, y compris Retour.
Le coach dispose aussi d'un onglet Messages pour ses rendez-vous individuels.

La conversation ciblée est prise dans la liste ou chargée par
`GET /api/conversations/:appointmentId`. Cette lecture vérifie l'appartenance
sans dérogation administrateur implicite et refuse les rendez-vous sans conversation.
En cas de refus, aucune autre conversation n'est ouverte comme substitut.
Le panneau patient mobile ouvre directement le chat demandé.

Tests front : redirection patient/praticien/coach, échec de résolution du rôle,
sélection du bon rendez-vous, chargement hors première page, refus d'accès,
onglet URL, Retour et onglet inconnu. Tests unitaires API : liens par destinataire
et encodage. Test PostgreSQL ajouté : détail pour les deux participants, refus
tiers/anonyme et identifiant invalide ; il reste à exécuter en intégration/CI.

## 3. Contact public

`POST /api/contact` valide noms, e-mail, téléphone, sujet, message et champ piège.
Limite : 5 tentatives par IP et par heure, par processus API. Le destinataire fixe
est choisi côté serveur. Le HTML est échappé ; le fournisseur d'e-mail dispose
d'un délai maximal de 15 secondes. Le succès signifie acceptation par le fournisseur,
pas preuve de réception dans la boîte finale. Pas d'envoi automatique répété.

Sans destinataire configuré, ou avec un fournisseur console en production, la route
répond 503. Un échec fournisseur répond également 503. Le front n'affiche le succès
qu'après `accepted=true`, bloque les doublons pendant l'envoi et conserve les champs
en erreur. Aucun jeton utilisateur n'est envoyé pour cet appel public.

Tests HTTP locaux sans PostgreSQL : acceptation, validation, champ piège, échec,
absence de destinataire, console en production, échappement et limite 429.
Tests front : transmission, conservation en erreur, attente et double clic,
réponse non acceptée.

## 4. Configuration VPS et recette

Aucune migration SQL ni nouveau secret requis. Définir dans `deploy/vps/.env` :

```dotenv
CONTACT_RECIPIENT_EMAIL=<boite-de-reception-reelle>
```

Utiliser le fournisseur Resend existant (`EMAIL_PROVIDER=resend`, clé et expéditeur
validé). La boîte doit être choisie par l'exploitant ; aucune adresse n'est inventée.
L'absence de configuration rend seulement le formulaire indisponible. Après édition
du `.env`, `docker compose up -d api` applique l'environnement : un simple restart
ne recharge pas les variables. Les exemples et le preflight sont mis à jour.

Après fusion/livraison : tester logout/login entre deux comptes ; notification
patient/praticien/coach et ancienne notification ; chat mobile et rendez-vous ancien ;
contact reçu dans la boîte choisie, erreur visible et champs conservés.
Ne pas utiliser les suites PostgreSQL sur la base de production.

## 5. Preuves et limites

Exécutés localement : **62 tests front**, **42 tests unitaires API**, builds front/API
et contrôles TypeScript réussis. Lint actif : zéro erreur, 45 avertissements hérités.
Les 23 tests front et 11 tests API supplémentaires couvrent les corrections.
Les requêtes contact des tests passent réellement par Fastify inject avec un fournisseur
simulé. Aucun message réel, paiement ni accès au VPS n'a été effectué.

Runtime local : Node 24.19.0 ; cible CI et déploiement : Node 22.12+.
PostgreSQL, MinIO, Playwright et Safari physique ne sont pas déclarés validés dans
cette campagne. Les demandes d'accès réseau de la campagne précédente ont expiré
et n'ont pas accordé l'accès. Les suites CI restent nécessaires avant fusion.
