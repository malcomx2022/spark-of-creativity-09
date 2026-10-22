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

### 4 bis. Recette automatisée (22 octobre 2026)

`npm run test:recette` (`playwright.recette.config.ts`, `tests/recette/`) joue ces parcours
dans Chromium sur une pile locale réelle, sans interception : API compilée (fournisseurs
factices, `CONTACT_RECIPIENT_EMAIL` de test), front en preview et base PostgreSQL de
développement. Le workflow `recette.yml` la relance sur chaque PR concernée.

```bash
RECETTE_DATABASE_URL=postgresql://domicares_app:…@localhost:5432/<base dédiée> npm run test:recette
```

La configuration refuse toute base qui n'est pas locale. Les scénarios tournent dans trois projets
successifs : `chromium`, `chromium-iphone` et `webkit-iphone` (moteur de Safari, en CI ; en local
par `npm run test:recette:webkit`, navigateur dans Docker, document 12). Le
document 12 en détaille la portée. Les données sont créées par l'API :
inscriptions, KYC, puis messages, ce qui produit de vraies notifications et leurs liens. Seuls
les rendez-vous confirmés sont insérés en SQL : 26 pour la patiente, dont le plus ancien est en
page 2 des conversations, un avec le coach et un pour un second patient.

| Parcours | Scénarios |
|---|---|
| Logout/login entre deux comptes | progression restaurée pour son propriétaire, purgée au logout ; le compte B ne voit ni la boîte de paiement ni les conversations de A ; déconnexion dans un autre onglet ; retour à la page demandée après connexion (sauf autre espace ou déconnexion volontaire) |
| Notifications par rôle | clic sur la notification du praticien, du coach et du patient (rendez-vous hors première page) → bon espace, bon chat ; ancienne notification `/dashboard` redirigée ; un tiers n'ouvre pas la conversation ; note de soin (nouveau et ancien lien) → notes partagées et détail |
| Chat mobile | 390 px : la notification ouvre directement le chat du rendez-vous ancien ; envoi d'une réponse ; aucun débordement |
| Contact | envoi accepté par l'API (201, succès affiché) ; échec 503 simulé côté navigateur : erreur visible, champs conservés, aucun succès |

**Défaut trouvé et corrigé par cette recette** : le clic sur une notification de la liste ne faisait
que la marquer comme lue. Aucun composant ne lisait `notification.link`, donc les liens par
destinataire du §2 n'ouvraient rien. `NotificationsSection` suit désormais le lien, à la souris
ou au clavier (`role="link"`), via `notificationPath` (`src/lib/notification-link.ts`). Seuls les
chemins internes `/dashboard`, `/dashboard/<patient|practitioner|coach>` et `/admin` sont suivis.
Un lien externe (URL de paiement d'une séance) ou sans route laisse la notification simplement lue.
Sans ce correctif, les cinq scénarios de notification de la recette échouent ; avec lui, ils
réussissent tous.

Corrigés à la suite (voir plus bas) : la page ouverte par une notification push et le lien des notes de soin.

**Notes de soin (22 octobre 2026).** Une note partagée notifiait le patient avec
`/patient/appointments/:id`, une route inexistante. De plus, aucun écran patient n'affichait
les notes : `PatientCareNotesSection` avait été retirée du tableau de bord, alors que l'API
(`GET /care-notes/mine`) et le hook restaient en place. Correction :
- le lien devient `/dashboard/patient?tab=reports` (`CARE_NOTE_LINK`, `medical.service.ts`) ;
- l'onglet `reports` affiche les comptes rendus puis les notes partagées ;
- `notificationPath` redirige les anciennes notifications `/patient/appointments/:id` vers ce même onglet.

Preuves :
- e2e `medical` : lien stocké vérifié, 12/12 ;
- recette : 2 scénarios ajoutés (note partagée par l'API, ancien lien), avec ouverture du détail ;
- sans la correction, ces 2 scénarios échouent.

**Notification push (22 octobre 2026).** Le texte reste générique (document 11) : « Vous avez une
nouvelle notification. Connectez-vous pour la consulter. », sans titre ni contenu métier. Mais
l'API imposait `/login` comme cible, et `public/sw.js` l'imposait aussi au clic : la notification
n'ouvrait jamais le chat ou l'onglet concerné. Désormais :
- l'API joint le lien de la notification, s'il passe `pushTargetPath`
  (`api/src/notifications/push-target.ts`) ;
- le worker revérifie ce chemin avec la même règle avant d'ouvrir la page (`notificationTarget`).

Règle commune : seuls `/dashboard`, `/dashboard/<patient|practitioner|coach>` et `/admin` sont
acceptés, paramètres compris. Une URL externe, un chemin d'API ou une valeur invalide donne `/login`.
Le clic tente de naviguer dans l'onglet ouvert. S'il échoue (onglet non contrôlé par le worker),
il ouvre une fenêtre, alors qu'auparavant rien ne se passait.

Sans session, la page protégée renvoie vers `/login`. La connexion ramène ensuite à la page
ciblée (voir « Retour à la page après connexion »).

Tests :
- `push.service.spec.ts` : 9 cas, texte générique vérifié ;
- `pwa-worker.test.ts` : 7 cibles, navigation dans l'onglet et repli sur une fenêtre ;
- 38 scénarios navigateur Chromium, dont la PWA avec le worker réel.

Sans la correction, 4 tests API et 5 tests worker échouent. La réception sur un appareil réel
reste à vérifier.

**Retour à la page après connexion (22 octobre 2026).** `ProtectedRoute` transmettait `state.from`,
mais aucune page de connexion ne le lisait. De plus, ce state se perdait dès que l'utilisateur
passait de `/login` (OTP) à la connexion par e-mail. Une session expirée ou une notification
ouverte hors session menait donc toujours à l'accueil de l'espace.

Désormais, `src/lib/return-path.ts` gère ce retour :
- **Mémorisation** : `ProtectedRoute` garde la page demandée dans le `sessionStorage` de l'onglet,
  pour les seuls chemins internes de `notificationPath`.
- **Retour** : `navigateToDashboard` (connexions patient et praticien, inscriptions) et les
  connexions OTP (`LoginWithOTP`, `VerifyOTP`) rouvrent cette page une seule fois, dans les
  15 minutes, si elle relève de l'espace du rôle connecté ou de `/dashboard` (résolu par rôle).
  Sinon, la connexion mène à l'accueil de l'espace.
- **Déconnexion volontaire** : elle efface la page et bloque toute mémorisation pendant 5 s.
  La recette a trouvé ce défaut : sans ce blocage, un rendu qui suit le logout mémorisait la page quittée.
- **Contrôle d'accès** : il reste à l'API. Si un autre compte du même rôle se connecte dans
  l'onglet, l'ancien rendez-vous lui est refusé et aucune autre conversation ne s'ouvre.

Tests :
- `return-path.test.ts` : 10 cas ;
- recette : 3 scénarios (lien profond hors session, page d'un autre espace, déconnexion
  volontaire), 15/15 au total ;
- sans la mémorisation, le scénario du lien profond échoue.

**Retour vers la page notifiée (22 octobre 2026).** Trois chemins ne ramenaient pas à la page
d'une notification :
- **Administrateurs** : `AdminLogin` et la branche admin de `PractitionerLogin` renvoyaient
  toujours vers `/admin`. Ils utilisent désormais `postLoginPath('/admin')`. De plus,
  `AdminDashboard` gardait son onglet en état local, donc `/admin?tab=kyc|finance|operations…`
  ouvrait la vue d'ensemble. Il suit maintenant `?tab=` via `useDashboardTab`, comme les autres
  espaces (« admins » reste réservé au super-admin).
- **Lien de paiement admin** : `/admin?tab=payments`, onglet inexistant, devient `/admin?tab=finance`.
- **E-mails de notification** : le lien était relatif (`/dashboard/…`), donc inutilisable depuis
  une messagerie, et le message était inséré sans échappement dans le HTML. Ils contiennent
  désormais `FRONTEND_URL` + le chemin interne autorisé (`notificationEmail`, `push-target.ts`),
  et le message est échappé. Un lien externe ou inconnu n'est pas repris. Ouvert hors session,
  le lien passe par la connexion puis ramène à la page.

Tests :
- `push.service.spec.ts` : e-mail absolu et échappé, liens refusés ;
- recette : 16/16, avec le scénario administrateur `/admin?tab=kyc`, qui arrive sur `/admin`
  sans la correction ;
- API : 56 tests unitaires et e2e 122/122 (deux passages ; un premier passage a échoué sur un
  test non identifié, pendant que PostgreSQL était arrêté par l'environnement).

**Réception réelle du contact (22 octobre 2026).** Le succès du formulaire signifie qu'il a été
accepté par Resend, pas qu'il est arrivé dans la boîte (§3). Plusieurs défauts empêchaient une
réception exploitable ou vérifiable :
- **Réponse** : aucun `reply_to`, donc « Répondre » visait `noreply@`. Le visiteur est
  désormais l'adresse de réponse.
- **Objet** : il était identique pour tous les messages. Il devient « DomiCares — contact :
  <sujet> », sur une seule ligne.
- **Suivi** : l'identifiant Resend n'était pas conservé. `EmailService.send` le renvoie et la
  route le journalise, sans aucune donnée du visiteur.
- **Preflight** : il ne contrôlait ni le domaine expéditeur chez Resend (sans vérification, tout
  envoi est refusé et le formulaire répond 503), ni une boîte de contact identique à l'adresse
  d'envoi. Il contrôle maintenant les deux.
- **Outil** : aucun outil ne testait la livraison. `deploy/vps/contact-check.sh` envoie un
  message test et suit son statut jusqu'à « delivered », ou signale un rebond, une clé ou un
  domaine refusés. Avec `--via-site`, il soumet aussi le formulaire public (document 07, §9).

Tests :
- API : `email.service.spec.ts` (`reply_to`, identifiant, refus) et `contact.controller.spec.ts`
  (réponse au visiteur, objet sur une ligne) ; 60 tests unitaires, e2e 122/122, recette 16/16 ;
- scripts testés contre un faux Resend : livré, refusé, rebond, clé restreinte, réponses JSON
  compactes et formatées, et `--via-site` sur l'API locale. Ces essais ont trouvé et fait corriger
  une lecture JSON qui ne tolérait pas les espaces.

**Non exécuté** : l'envoi réel. Il faut la clé Resend et la boîte du VPS, absentes de cette
session. Après `./contact-check.sh --via-site` sur le VPS, consigner ici l'identifiant Resend, le
statut et la présence en boîte.

**Push sur téléphone réel (22 octobre 2026).** Quatre causes d'échec n'apparaissent que sur appareil :
- **Push silencieux** : le worker n'affichait rien pour un push sans données ou illisible. Or
  Safari/iOS révoque l'abonnement après des push silencieux. Une notification générique est
  désormais toujours affichée.
- **Clés VAPID incohérentes** : rien ne les détectait, et Apple ou Google refusent alors chaque
  envoi. `PushService` vérifie la paire au démarrage (`vapidKeyError`). En cas d'erreur, il
  journalise, coupe le push (clé publique null, envoi refusé avec `vapid_mismatch`) sans bloquer le
  reste de l'API.
- **Urgence** : envoi avec `urgency: high`, pour une remise rapide en économie d'énergie.
- **Recette impossible sans vrai message** : nouvelle route `POST /api/push/test` (authentifiée,
  5 appels par 10 min, appareils de l'appelant seulement) et bouton « Envoyer une notification de
  test » dans l'onglet Notifications. Le bouton affiche le résultat réel de l'envoi (`describeTestPush`).
- **iPhone hors application installée** : la section push était masquée. Elle explique désormais
  l'ajout à l'écran d'accueil (`isIosWithoutInstall`).

Tests :
- API : 63 tests unitaires (paire VAPID, coupure, urgence) ; e2e de la route de test (401,
  envoi à l'appelant, aucun abonnement) ; e2e 122/122 ;
- front : 116 tests (worker sans données ou illisible, bouton de test, mode console signalé,
  indication iOS) ; 38 scénarios navigateur ; recette 32/32 ;
- sans la correction du worker, ses 2 nouveaux tests échouent.

**Non exécuté** : la réception sur un téléphone réel (document 12, point 7).

Reste manuel sur l'environnement livré : réception réelle du message de contact dans la boîte de
`CONTACT_RECIPIENT_EMAIL` (Resend), essais sur Safari/iOS physique, et notification push reçue
sur un appareil. La recette automatisée tourne sous Chromium (émulation mobile pour le chat) :
elle ne vaut pas recette WebKit ou Safari.

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

Mise à jour du 22 octobre 2026 (document 15) : le test PostgreSQL de
`GET /api/conversations/:appointmentId` a été exécuté sur PostgreSQL 16 local
(`npm run test:e2e` : 9 suites, 102 tests réussis, 4 tests MinIO ignorés) et réussit.
