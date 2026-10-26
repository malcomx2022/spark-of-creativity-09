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

## 4. Réponses d'Akambi (à tenir à jour)

| Plan § 9 | Sujet | Réponse | Date | Effet chez DomiCares |
|---|---|---|---|---|
| 1 | Annulations dans `updatedSince` | | | Si non : rapprochement complémentaire des inscriptions actives par `GET /enrollments/{id}` (déjà fait à l'accès du praticien) |
| 2 | E-mail et connexion directe d'un compte `CREATED` | | | Texte d'aide de l'onglet Academy |
| 3 | Co-marquage | | | Libellés du front et des attestations |
| 4 | Lien de retour dans `sso/launch` | | | Paramètre à ajouter à `launch` si disponible |
| 5 | Données de test | | | Prérequis P3 et P4 du document 02 |
| 6 | Nonces et tolérance d'horloge | | | `preflight.sh` (seuil NTP) et `akambi-ping` |
| 7 | IP sortantes des webhooks | | | Filtrage optionnel dans Caddy |
| 8 | Incident, astreinte, préavis `/v2` | | | Document d'exploitation |
| 9 | Départ d'un praticien, données | | | Suppression de compte DomiCares (cascade locale déjà en place) |
| 10 | Identifiants de production | | | § 7 du document 02 |
| 11 | Durée et langue (v1.1) | | | Champs du catalogue lors de la v1.1 |
| — | Secret `whsec_…` de préproduction | | | `AKAMBI_WEBHOOK_SECRETS` de la recette |

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

## 6. Suivi du lot A0

| Étape | État | Preuve |
|---|---|---|
| Préproduction Akambi joignable, format signé conforme | **Fait** (26 octobre 2026) | § 1 |
| Outil de vérification sans Postman | **Fait** (26 octobre 2026) | `npm run akambi:ping`, tests `akambi-ping.spec.ts` |
| Webhook de la recette en ligne | **Constaté** (26 octobre 2026) | § 1 (503 attendu sans secret) |
| Authentification avec les vrais identifiants | À faire par DomiCares | sortie du § 2 sans ✖ |
| Message à Denis envoyé | À faire par DomiCares | date d'envoi |
| Réponses d'Akambi | En attente | § 4 |
| Arbitrages D1 à D5 | En attente | § 5 |
