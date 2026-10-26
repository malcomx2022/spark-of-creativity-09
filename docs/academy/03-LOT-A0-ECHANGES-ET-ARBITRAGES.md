# 03 — DomiCares Academy : lot A0, échanges avec Akambi et arbitrages — 26 octobre 2026

Lot A0 du plan `01-FAISABILITE-INTEGRATION-AKAMBI.md` (§ 7) : vérifier les identifiants de
préproduction, répondre à Akambi (§ 9 du plan) et obtenir les arbitrages métier (§ 10). Ce document
porte l'outil de vérification, le message à envoyer, et deux tableaux à tenir à jour : réponses
d'Akambi et décisions DomiCares. Aucune clé, aucun secret ni adresse personnelle n'y figure.

## 1. Constats du 26 octobre 2026 (depuis l'environnement de développement)

| Point | Constat | Preuve |
|---|---|---|
| Préproduction Akambi | Joignable ; refuse une requête non signée en nommant les quatre en-têtes que le client DomiCares envoie | `GET https://preprod.akambiconsulting.com/api/partners/v1/ping` → 401 `MISSING_AUTH_HEADERS` |
| Format de requête signé | Accepté jusqu'au contrôle de la clé : une clé inconnue est refusée comme telle | `npm run akambi:ping` avec une clé factice → 401 `INVALID_API_KEY` |
| Webhook de la recette DomiCares | **En ligne** sur la recette déployée le 24 octobre (document 16 de la migration) ; répond 503 tant qu'aucun secret n'est configuré, comme prévu | `POST https://staging.domicares.life/api/webhooks/akambi` → 503 « Réception des événements Academy non configurée » |
| Identifiants de préproduction | Non disponibles ici (transmis séparément à DomiCares) | — |

Conséquence : l'URL de webhook peut être déclarée chez Akambi dès maintenant ; les livraisons
réussiront (200) une fois le `whsec_…` renseigné sur la recette.

## 2. Vérifier les identifiants (prérequis P1 du document 02)

Deux moyens équivalents ; le second n'exige ni Postman ni base de données :

1. **Postman** : importer la collection et l'environnement Akambi, renseigner `apiKey` et `apiSecret`,
   lancer « 0. Démarrage > Vérifier l'authentification ». Attendu : 200 avec `partner.code`.
2. **Script DomiCares** (`api/src/academy/akambi-ping.ts`), qui passe par le client réellement utilisé
   par l'API (même signature, mêmes en-têtes) :

   ```bash
   cd api
   AKAMBI_API_KEY=… AKAMBI_API_SECRET=… npm run akambi:ping       # préproduction par défaut
   # Sur le VPS (recette), avec la configuration du conteneur, après le § 2 du document 02 :
   docker compose exec api node dist/academy/akambi-ping.js
   ```

   Contrôles : `GET /ping` signé (code partenaire), décalage d'horloge avec Akambi (✖ au-delà de
   ±300 s), refus d'une signature volontairement fausse (401 `INVALID_SIGNATURE`), catalogue
   (`GET /courses` : nombre et dix premiers titres ; ⚠ s'il est vide). Code de sortie 1 si un
   contrôle échoue. La clé, le secret et les corps de réponse ne sont jamais affichés ; les
   journaux du client ne contiennent que méthode, chemin et code.

Résultat attendu, à reporter au § 5 :

```
Akambi : https://preprod.akambiconsulting.com
✔ Authentification (GET /ping) : 200, partenaire DOMICARES (…)
✔ Horloge : décalage de 0 s avec Akambi (tolérance ±300 s)
✔ Refus d’une signature fausse : 401 INVALID_SIGNATURE
✔ Catalogue (GET /courses) : n formation(s) publiée(s) : …
```

Diagnostic : `INVALID_API_KEY` → clé erronée ou d'un autre environnement (préproduction et
production ont des clés distinctes) ; `INVALID_SIGNATURE` sur le premier contrôle → secret erroné
ou copié avec un espace ; `TIMESTAMP_OUT_OF_RANGE` → horloge du poste ou du VPS (NTP).

## 3. Message à Denis NOUDEKE (Akambi Consulting)

À envoyer par le canal habituel, **sans** reprendre la clé ni le secret. Mettre à jour la première
phrase selon le résultat du § 2.

> Objet : DomiCares Academy — préproduction : authentification, URL de webhook et questions
>
> Bonjour Denis,
>
> Merci pour l'accès à la préproduction. Le test « Vérifier l'authentification » renvoie bien 200
> avec notre code partenaire. *(À adapter : sinon, indiquer le code d'erreur obtenu.)*
>
> **URL de webhook de préproduction** : `https://staging.domicares.life/api/webhooks/akambi`.
> Elle est en ligne et vérifie la signature `X-Akambi-Signature` sur le corps brut. Pourriez-vous la
> déclarer et nous transmettre le secret `whsec_…` par le même canal que la clé API ? Une fois le
> secret installé de notre côté, nous vous demanderons un `webhook.test`. D'ici là, nos réponses
> seront 503 : merci de ne pas en tenir compte.
>
> Côté DomiCares, l'intégration est développée et testée sur un client simulé : catalogue,
> comptes apprenants (`CREATED`/`EXISTING`), inscriptions idempotentes, accès SSO, webhooks
> dédoublonnés, rapprochement par `updatedSince`, attestations et reporting. Nous déroulerons ensuite la
> grille de recette de votre § 10 avec vous.
>
> Pour la recette, nous aurions besoin de :
> - une formation de test courte avec une évaluation finale, dans la catégorie DomiCares ;
> - un compte apprenant de test déjà existant chez vous (cas `EXISTING`) ;
> - un moyen de faire progresser une inscription et de déclencher une attestation en préproduction.
>
> Et de vos réponses sur les points suivants :
> 1. `GET /enrollments?updatedSince=…` renvoie-t-il les inscriptions annulées ? Sinon, comment
>    rapprocher une annulation dont le webhook est perdu (le `GET` unitaire répond 404) ?
> 2. Un compte `CREATED` reçoit-il un e-mail d'Akambi ? Peut-il aussi se connecter directement chez
>    vous (mot de passe) ? Avec quel expéditeur et quel marquage ?
> 3. Co-marquage « DomiCares Academy — Powered by Akambi Consulting » sur l'espace apprenant et les
>    attestations : est-il prévu, et selon quelles modalités ?
> 4. Lien de retour vers DomiCares depuis l'espace Akambi : un paramètre est-il possible dans
>    `sso/launch` ?
> 5. Durée de rétention des nonces et tolérance d'horloge exacte (±300 s inclus ?).
> 6. Plages d'adresses IP sortantes des webhooks (filtrage optionnel de notre côté).
> 7. Procédure d'incident, contact d'astreinte, page d'état, délai de préavis avant une `/v2`.
> 8. Départ d'un praticien : désactivation du compte apprenant, conservation et suppression des
>    données.
> 9. Procédure d'émission des identifiants de production et date cible.
> 10. Durée et langue des formations (v1.1) : nous confirmons ce besoin.
>
> Bien cordialement,
> *(signature DomiCares)*

Les données de test reprennent la question 5 du plan ; les questions 1 à 4 et 6 à 11 du plan
deviennent ici 1 à 10. Le § 4 suit les réponses selon la numérotation du plan.

## 4. Réponses d'Akambi (Denis NOUDEKE, transmises le 26 octobre 2026)

La réponse contient encore des **valeurs entre crochets non remplies** (adresse IP des webhooks,
préavis, adresse de signalement, contact d'urgence, délais `/v2`, canal du secret de production,
contenu exact de la formation de test). Elles sont à redemander (§ 7) ; rien n'est déduit ici.

| Plan § 9 | Sujet | Réponse d'Akambi | Effet chez DomiCares |
|---|---|---|---|
| 1 | Annulations dans `updatedSince` | **Aujourd'hui non** : une inscription retirée est supprimée (absente de la liste, `GET /enrollments/{id}` → 404) ; seul `enrollment.cancelled` la signale, conservé 90 jours et rejouable depuis l'administration Akambi. **Correction avant la recette** : la liste renverra aussi les inscriptions annulées (`status: "CANCELLED"`, date d'annulation), retraits du support compris. Une réinscription reçoit un nouvel identifiant. | Déjà pris en charge : statut `CANCELLED` appliqué depuis la liste, champ de date inconnu ignoré, réinscription sur une nouvelle ligne (test e2e ajouté). Corrigé le 26 octobre : une annulation inconnue localement n'est plus rattachée à une demande en attente du même praticien (elle l'aurait close). En attendant la correction : webhook, clôture à l'accès sur 404, rejeu des événements par Akambi. À confirmer : `updatedAt` mis à la date d'annulation (sinon le curseur la manque). |
| 2 | Compte `CREATED` | Aucun e-mail à la création ni à l'inscription ; mot de passe aléatoire jamais communiqué ; le praticien peut en définir un (« Mot de passe oublié ») ou se connecter par Google/Facebook avec la même adresse ; le compte lui appartient. E-mails possibles : félicitations à la réussite, réinitialisation, relance d'inactivité manuelle (lien 24 h) **jamais sans accord de DomiCares**. Expéditeur « Akambi Consulting » `contact@akambiconsulting.com`, charte Akambi. | Aucun changement de code. Décision D6 (relances). Texte d'aide éventuel dans l'onglet Academy (accès direct possible chez Akambi). |
| 3 | Co-marquage | Catégorie réservée et logo DomiCares sur les attestations dès réception ; mention « Powered by » absente de l'espace apprenant, des e-mails et des attestations. **v1.1** : bandeau co-marqué, mention sur l'attestation, nom d'expéditeur adapté. Demande : logo (SVG, ou PNG transparent) et charte. | Action DomiCares : envoyer logo et charte (D9). |
| 4 | Retour vers DomiCares | Indisponible. Proposition : URL de retour enregistrée par Akambi (bouton « Retour à DomiCares Academy ») ; un `returnUrl` dans `sso/launch` limité à ce domaine. Demande : quelle URL ? | Réponse proposée : `https://domicares.life/dashboard/practitioner?tab=academy` (production) et `https://staging.domicares.life/dashboard/practitioner?tab=academy` (préproduction) — route existante, même lien que les notifications Academy. URL fixe suffisante : aucun `returnUrl` à transmettre. |
| 5 | Données de test | Formation courte réservée à DomiCares (contenu entre crochets dans la réponse) et bonnes réponses transmises ; compte `EXISTING` sur une adresse que DomiCares contrôle ; progression par le parcours réel (`progress.updated` → `course.completed` → `certificate.issued` à 80 %), 3 tentatives, réouverture possible. | Action DomiCares : fournir une adresse de test contrôlée (prérequis P4). Grille R5 et R7 du document 02 en parcours réel. |
| 6 | Nonces, horloge | Nonces conservés ≥ 10 min ; enregistrés après validation de la signature, consommés même si la requête échoue ensuite ; nouvelle tentative = nouveau nonce et nouvel horodatage (UUID v4). Tolérance **inclusive et symétrique** : écart ≤ 300 s accepté. | Conforme : nouveau nonce et horodatage à chaque tentative ; webhooks acceptés jusqu'à 300 s inclus. Corrigé le 26 octobre : `akambi-ping` signalait en échec un écart d'exactement 300 s. |
| 7 | IP sortantes | Adresse fixe, identique en préproduction et production (**valeur non remplie**) ; changement annoncé à l'avance (**délai non rempli**). La signature reste le contrôle de référence. | Filtrage Caddy optionnel, non mis en place : à décider une fois l'adresse connue. |
| 8 | Exploitation | Signalement à une adresse (**non remplie**) avec environnement, heure UTC, méthode, route, codes et id d'événement (historique 90 jours) ; contact d'urgence (**non rempli**). Ajouts compatibles sans changement de version (nouveau champ, type d'événement, route) : le partenaire doit ignorer champs et événements inconnus. `/v2` annoncée à l'avance, `/v1` maintenue ensuite (**délais non remplis**). | Conforme pour les champs (ignorés) et les événements (acquittés `ignored`). À clarifier : une **nouvelle valeur** d'énumération (type de formation, devise, statut) rendrait aujourd'hui l'élément illisible (formation non synchronisée, curseur d'inscriptions retenu). |
| 9 | Départ d'un praticien | Pas de désactivation par l'API aujourd'hui : retrait des inscriptions non certifiées (`DELETE /enrollments/{id}`), suppression par le support sur demande. **v1.1** : `DELETE /learners/{externalLearnerId}` (compte `CREATED` supprimé avec ses inscriptions non certifiées ; `EXISTING` seulement détaché). Reste à fixer : attestations délivrées (page de vérification maintenue ?) et durées de conservation, à inscrire dans la convention. | Décision D7. Côté DomiCares, la suppression d'un compte efface déjà les lignes `academy_*` (cascade) mais n'appelle pas Akambi : appel à ajouter quand la route v1.1 existera. |
| 10 | Production | Identifiants générés à la création du partenaire en production ; clé par e-mail, secret par un canal séparé (**à convenir**) ; secret de webhook après communication de l'URL de production. | URL de production : `https://domicares.life/api/webhooks/akambi`. § 7 du document 02. |
| 11 | Durée et langue | v1.1 : `durationMinutes` (entier ou `null`) et `language` (ISO 639-1) dans la ressource Formation ; Akambi demande si ces noms conviennent. | Noms acceptables ; ignorés par le code actuel jusqu'à leur ajout au catalogue local (évolution distincte). |
| — | Secret `whsec_…` de préproduction | Généré dès que l'URL est communiquée comme active. | URL active : `https://staging.domicares.life/api/webhooks/akambi` (§ 1) ; à répondre (§ 7). |

## 5. Arbitrages DomiCares (Gaillardo, Fawaz)

La colonne « Comportement actuel » décrit ce que fait le code fusionné : c'est la valeur appliquée
tant qu'aucune décision n'est enregistrée. Une décision qui change ce comportement ouvre une
modification dédiée (tests compris), sans attendre la recette.

| # | Question | Options | Comportement actuel | Modification si l'autre option est retenue | Décision | Date |
|---|---|---|---|---|---|---|
| D1 | Qui accède à l'Academy ? | praticiens KYC validés seulement ; coachs inclus | praticiens hors `coach_sportif`, KYC `approved`, e-mail vérifié (`AcademyService.assertAccess`) ; aucun onglet coach | coachs : retirer l'exclusion dans `assertAccess`, onglet Academy du tableau de bord coach, tests d'accès | | |
| D2 | Inscription | libre par le praticien ; validée par un administrateur | libre, depuis l'onglet Academy | validation : état « demandée » local, file d'attente admin, appel à Akambi à la validation (nouvelle valeur de statut, migration SQL) | | |
| D3 | Indicateurs et visibilité | admin seulement ; aussi praticien | admin (`super_admin`, `ops`, `analyst`, `support`), marqués provisoires ; le praticien voit seulement sa progression | liste des indicateurs retenus ; vue praticien éventuelle | | |
| D4 | Attestations | lien de vérification Akambi ; archivage du PDF chez DomiCares (S3) | lien de vérification public et PDF redemandé à chaque clic (lien de 15 min), rien n'est stocké | archivage : copie dans un bucket existant, chemin et conservation à définir, droits d'accès | | |
| D5 | Prix public Akambi | affiché à titre indicatif ; masqué | masqué (le champ est synchronisé mais pas affiché) | affichage dans la carte de formation | | |
| D6 | Relances d'inactivité envoyées par Akambi aux praticiens (lien de connexion 24 h) | refusées ; acceptées (fréquence, texte) | aucune relance : Akambi attend l'accord de DomiCares | aucune côté code ; accord écrit à transmettre à Akambi | | |
| D7 | Départ d'un praticien | attestations : page de vérification maintenue ou retirée ; durées de conservation | rien n'est envoyé à Akambi au départ ; données locales supprimées avec le compte | appel à `DELETE /learners/{externalLearnerId}` (v1.1) à la suppression du compte ; clause de la convention | | |
| D8 | URL de retour depuis l'espace Akambi | `/dashboard/practitioner?tab=academy` ; autre page | — (non disponible chez Akambi) | aucune côté code avec une URL fixe enregistrée par Akambi | | |
| D9 | Co-marquage | logo seul sur les attestations (aujourd'hui) ; bandeau, mention et expéditeur adaptés (v1.1) | — | envoi du logo (SVG ou PNG transparent) et de la charte à Akambi | | |

## 6. Suivi du lot A0

| Étape | État | Preuve |
|---|---|---|
| Préproduction Akambi joignable, format signé conforme | **Fait** (26 octobre 2026) | § 1 |
| Outil de vérification sans Postman | **Fait** (26 octobre 2026) | `npm run akambi:ping`, tests `akambi-ping.spec.ts` |
| Webhook de la recette en ligne | **Constaté** (26 octobre 2026) | § 1 (503 attendu sans secret) |
| Authentification avec les vrais identifiants | À faire par DomiCares | sortie du § 2 sans ✖ |
| Message à Denis envoyé | **Fait** (brouillon Gmail du 26 octobre, envoyé par DomiCares) | réponse reçue |
| Réponses d'Akambi | **Reçues** (26 octobre 2026), valeurs entre crochets à compléter | § 4 |
| Effets sur le code | **Faits** (26 octobre 2026) : annulation inconnue jamais rattachée à une demande en attente ; tolérance d'horloge inclusive dans `akambi-ping` | tests e2e `academy-sync` (12) et `akambi-ping.spec.ts` (5) |
| Réponse à Denis (URL active, compléments, questions) | À envoyer par DomiCares | § 7 |
| Arbitrages D1 à D9 | En attente | § 5 |

## 7. Réponse à Denis (à envoyer)

Les éléments entre crochets sont à compléter par DomiCares avant l'envoi. Le logo et la charte se
joignent au message.

> Objet : RE: DomiCares Academy — préproduction : URL active et compléments
>
> Bonjour Denis,
>
> Merci pour ces réponses détaillées.
>
> **URL de réception de préproduction** : `https://staging.domicares.life/api/webhooks/akambi` est
> active. Vous pouvez générer le secret de webhook et nous le transmettre par le même canal que la clé
> API ; nous vous demanderons ensuite un `webhook.test`.
>
> 1. **Annulations** : la correction nous convient ; notre code applique déjà `status: "CANCELLED"`
>    reçu par la liste. Pouvez-vous confirmer que `updatedAt` prend la date d'annulation (notre
>    rapprochement suit ce champ), le nom du champ de date d'annulation, et la réponse de
>    `GET /enrollments/{id}` après annulation (404 ou l'inscription en `CANCELLED`) ?
> 2. **Comptes `CREATED`** : noté. Pas de relance d'inactivité pour l'instant ; nous reviendrons vers
>    vous si nous souhaitons l'activer.
> 3. **Co-marquage** : vous trouverez en pièce jointe notre logo et notre charte. D'accord pour la v1.1.
> 4. **Retour vers DomiCares** : `https://domicares.life/dashboard/practitioner?tab=academy` en
>    production et `https://staging.domicares.life/dashboard/practitioner?tab=academy` en
>    préproduction. Une URL fixe nous suffit ; nous ne transmettrons pas de `returnUrl`.
> 5. **Données de test** : adresse pour le compte `EXISTING` : [adresse de test contrôlée par
>    DomiCares]. Pouvez-vous nous préciser le contenu de la formation de test ?
> 6. **Signature** : conforme de notre côté (nouveau nonce UUID v4 et nouvel horodatage à chaque
>    tentative, serveurs synchronisés en NTP).
> 7. et 8. Votre message contient encore des valeurs à compléter : adresse IP des webhooks et délai
>    de préavis d'un changement, adresse de signalement d'incident, contact d'urgence, délais
>    d'annonce de `/v2` et de maintien de `/v1`. Pouvez-vous nous les transmettre ? Nous ignorons
>    déjà les champs et les types d'événements inconnus. Une nouvelle valeur dans une liste fermée
>    (type de formation, devise, statut d'inscription) est-elle aussi considérée comme compatible ?
>    Si oui, nous adapterons notre lecture en conséquence.
> 9. **Départ d'un praticien** : d'accord pour la route v1.1 et pour fixer ces règles dans la
>    convention. [Position DomiCares sur les attestations délivrées et la conservation, décision D7.]
> 10. **Production** : URL de réception `https://domicares.life/api/webhooks/akambi`. Canal proposé
>     pour le secret : [à convenir].
> 11. **Catalogue** : `durationMinutes` et `language` nous conviennent.
>
> Pour la séance technique, nous proposons [dates et créneaux].
>
> Bien cordialement,

