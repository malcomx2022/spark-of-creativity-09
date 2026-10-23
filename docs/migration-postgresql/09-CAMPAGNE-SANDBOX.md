# Campagne sandbox FedaPay — mode opératoire

Objectif : exercer, contre le vrai FedaPay en mode test, toute la chaîne d'argent de Domicares
(paiement, webhook, expiration, annulation, reversement démarré et suivi, remboursement) **avant
tout paiement réel**. Les tables de paiement de la production n'ont jamais contenu une ligne
(`08-REVUE-FEDAPAY.md` §1.1) : ce code n'a été exercé que par le client factice des tests e2e.

La campagne tranche aussi les trois points laissés ouverts par le lot 2 (`08-REVUE-FEDAPAY.md`
§6) : corps de `PUT /v1/payouts/start`, valeur de `mode` des dépôts, format du numéro.

Durée : une demi-journée, une personne, avec le tableau de bord FedaPay sandbox ouvert à côté.

## 0. Prérequis

| Quoi | Où |
|---|---|
| Compte FedaPay **sandbox** (même compte, bascule « Test » en haut du tableau de bord) avec clés `pk_sandbox_…` / `sk_sandbox_…` | Tableau de bord FedaPay → Développeurs → Clés API |
| Endpoint webhook sandbox `https://domicares.life/api/webhooks/fedapay`, événements `transaction.*`, et son secret | Tableau de bord FedaPay (mode Test) → Développeurs → Webhooks |
| Solde sandbox suffisant pour un dépôt (FedaPay crédite un solde fictif en mode test ; sinon « Recharger » dans le tableau de bord test) | Tableau de bord FedaPay (mode Test) → Balance |
| Les deux jeux de clés dans `deploy/vps/.env` (`FEDAPAY_SANDBOX_*`, `FEDAPAY_LIVE_*`, voir `.env.example`) | VPS |
| Quatre comptes de recette : un patient, un praticien **KYC approuvé** avec des informations de reversement MTN vérifiées, un coach, un administrateur `finance` | Application |

Numéros de test FedaPay connus de l'application (`FedaPayWidget`, affichés en mode sandbox) :

| Numéro | Effet |
|---|---|
| `+229 66 00 00 01` | paiement MTN approuvé |
| `+229 64 00 00 01` | paiement Moov approuvé |
| `+229 66 00 00 00`, `+229 64 00 00 00` | paiement refusé |

Un vrai numéro ne fonctionne pas en sandbox. Pour le praticien de recette, enregistrer
`+22966000001` comme numéro MTN de reversement.

## 1. Bascule en sandbox

```bash
cd ~/domicares
deploy/vps/fedapay-mode.sh status          # les deux jeux de clés doivent être « présents »
deploy/vps/fedapay-mode.sh sandbox         # sauvegarde .env, recopie le jeu sandbox, redémarre api + worker
deploy/vps/fedapay-observe.sh 5            # état initial (tables vides attendues)
```

Le script refuse une clé qui ne commence pas par `pk_sandbox_` / `sk_sandbox_`, et vérifie que
le conteneur `api` voit bien `FEDAPAY_MODE=sandbox`. L'application affiche alors le bandeau
« Mode Test » dans le widget de paiement.

Pendant toute la campagne, un terminal sur les journaux :

```bash
docker compose --project-directory deploy/vps logs -f --tail=20 api worker | grep -Ei "fedapay|webhook|payout|refund|payments\.|payouts\."
```

## 2. Scénarios

Après chaque scénario : `deploy/vps/fedapay-observe.sh` et comparer à la colonne « attendu ».
Noter tout écart dans le tableau de la section 4.

| # | Scénario | Comment | Attendu dans Domicares | Attendu chez FedaPay |
|---|---|---|---|---|
| S1 | **Paiement MTN approuvé** | Patient : demande de rendez-vous → praticien accepte (tarif renseigné) → patient paie avec `+22966000001` | webhook `transaction.approved` reçu (`webhook_events` `success`), paiement `paid` / `held`, rendez-vous `confirmed`, solde praticien `retenu` = net, notification patient et praticien | transaction `approved`, `mode` = `mtn_open`, client avec numéro `+22966000001` |
| S2 | **Paiement Moov approuvé** | Inscription à une séance de groupe payée avec `+22964000001` | idem S1 sur la séance (`group_session_participants.payment_status = paid`) | transaction `approved`, `mode` = `moov` |
| S3 | **Paiement refusé** | Rendez-vous payé avec `+22966000000` | webhook `declined`, paiement `failed`, rendez-vous redevenu payable (`confirmed`), pas de solde | transaction `declined` |
| S4 | **Abandon** | Lancer un paiement, fermer la page sans payer, attendre 10 min (`payments.cleanup`) ou lancer le job | paiement `canceled` (motif `timeout`), rendez-vous payable ; la transaction est annulée chez FedaPay (`DELETE /v1/transactions/{id}`) | transaction `canceled` (ou toujours `pending` si le DELETE est refusé : noter le code HTTP dans les journaux) |
| S5 | **Reprise après abandon** | Repayer le rendez-vous de S4 avec `+22966000001` | nouveau paiement `paid`, l'ancien reste `canceled`, aucun 409 `PAYMENT_IN_PROGRESS` après le délai | deuxième transaction `approved` |
| S6 | **Libération des fonds** | Admin : `POST /api/admin/jobs/funds.release/run` après avoir avancé `hold_until` (voir §3) | paiements `ready`, solde praticien `dispo` = net | — |
| S7 | **Reversement** ⚠ point clé | Admin finance → Reversements → reversement individuel vers le praticien | reversement `sent` avec `fedapay = started` (ou `processing`), paiements `paid`, notification « Reversement en cours » ; puis, au passage suivant de `payouts.sync` (10 min, ou lancer le job), `completed` et notification « Reversement effectué » | dépôt **démarré** dans Dépôts (statut `started` → `sent`), pas seulement créé. Relever la réponse brute de `PUT /payouts/start` dans les journaux `api` |
| S8 | **Reversement refusé** | Praticien avec numéro `+22966000000` en reversement, puis reversement | `failed`, fonds relibérés (solde `dispo` restauré, paiement `ready`), dépôt supprimé ou `failed` chez FedaPay | dépôt `failed` ou absent |
| S9 | **Remboursement par l'API** (`POST /v1/refunds`) | Admin finance → Remboursements → canal « Par l'API FedaPay (MTN Mobile Money) », partiel (par ex. la moitié) sur le paiement MTN de S1 | soit `completed` (FedaPay a répondu approuvé ou envoyé) : paiement `partially_refunded`, écritures équilibrées (`ecart = 0`) ; soit `pending` : ligne « en attente », confirmée en S11. Un 502 `FEDAPAY_REFUND` (motif FedaPay) ou `FEDAPAY_REFUND_UNAVAILABLE` est un **écart** : le contrat relevé dans le tableau de bord est à revoir | remboursement visible dans Remboursements, ou erreur 404 relevée dans les journaux |
| S10 | **Remboursement manuel** | Rembourser le reste depuis le tableau de bord FedaPay (transaction → Rembourser), puis canal « Déjà effectué… » avec la référence FedaPay | paiement `refunded`, écritures équilibrées, notification patient, `provider_refund_id` = référence saisie | — |
| S11 | **Confirmation d'un remboursement en attente** | Si S9 a donné `pending` : lancer `payouts.sync` (relit `GET /v1/refunds/{id}`) ; s'il reste en attente, vérifier chez FedaPay puis bouton Confirmer avec la référence | `completed` par le job ou par Confirmer, écritures équilibrées ; un second Confirmer → 400 ; `failed` chez FedaPay → remboursement « Échoué », sans écriture | — |
| S12 | **Réconciliation** | Admin finance → Réconciliation sur la journée | rapport `completed`, `matched_count` = nombre de transactions de la campagne, anomalies = 0 (ou expliquées) | — |
| S13 | **Rejeu d'un webhook** | Renvoyer un événement depuis le tableau de bord FedaPay (Webhooks → événement → Renvoyer) | 200 `duplicate: true`, aucun changement d'état | — |

## 3. Commandes utiles pendant la campagne

Jeton administrateur pour appeler l'API en ligne de commande (le corps contient aussi le jeton,
les cookies servent au navigateur) :

```bash
TOKEN=$(curl -s https://domicares.life/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"<admin finance>","password":"<mot de passe>"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["session"]["accessToken"])')
H="authorization: Bearer $TOKEN"
```

| Besoin | Commande |
|---|---|
| Lancer un job sans attendre | `curl -s -X POST https://domicares.life/api/admin/jobs/payouts.sync/run -H "$H"` (aussi `payments.sync`, `payments.cleanup`, `funds.release`) |
| Avancer la rétention pour S6 | `docker compose --project-directory deploy/vps exec -T postgres psql -U postgres -d domicares -c "update public.payments set hold_until = now() - interval '1 minute' where status = 'paid' and payout_status = 'held';"` |
| Resynchroniser un paiement | `curl -s -X POST https://domicares.life/api/payments/<id>/sync -H "$H"` |
| État des tables, sans données personnelles | `deploy/vps/fedapay-observe.sh 20` |
| Réponses brutes FedaPay (dépôts) | `docker compose --project-directory deploy/vps logs --since 2h api \| grep -i "payouts"` — les erreurs FedaPay sont journalisées avec le corps de réponse (500 premiers caractères) |

## 4. Résultats à reporter

Compléter et transmettre ce tableau (statuts et codes HTTP, jamais de numéro ni de nom) :

| # | Résultat (ok / écart) | Statut Domicares observé | Statut FedaPay observé | Note |
|---|---|---|---|---|
| S1 | | | | |
| S2 | | | | |
| S3 | | | | |
| S4 | | | | code HTTP du DELETE |
| S5 | | | | |
| S6 | | | | |
| S7 | | | | réponse brute de `/payouts/start` (statut, `mode` renvoyé) |
| S8 | | | | |
| S9 | | | | statut du remboursement (`GET /v1/refunds/{id}`) |
| S10 | | | | |
| S11 | | | | |
| S12 | | | | |
| S13 | | | | |

Les trois points ouverts se lisent dans S7 (corps de `/payouts/start` accepté ? `mode` accepté ou
détecté ?), S1 et S7 (numéro `+229…` accepté ?) et S9 (contrat `/v1/refunds` accepté ? statut rendu ?). Selon les
réponses, à ajuster dans `api/src/payments/fedapay.client.ts` (`FEDAPAY_MODES`, `startPayout`) et
dans `08-REVUE-FEDAPAY.md` §6.

## 4 bis. Variante automatisée, sans VPS (`npm run campaign:fedapay`)

Ajout du 22 octobre 2026. Le script `api/test/campaign/fedapay-sandbox.campaign.ts` joue S1 à S12
contre le **vrai FedaPay sandbox** depuis une API Domicares **locale** : pas de bascule du VPS
(§1 inutile), pas de `fedapay-mode.sh`, aucune donnée de production. Il produit le tableau du §4
dans `api/campaign-reports/fedapay-sandbox-<date>.md`, avec les statuts et codes HTTP seulement
(numéros et adresses retirés). Ce dossier est ignoré par git.

```bash
cd api
FEDAPAY_CAMPAIGN=sandbox \
DATABASE_URL=<base de développement dédiée, schéma natif appliqué> \
JWT_ACCESS_SECRET=<secret de test, 32 caractères minimum> \
npm run campaign:fedapay
```

`FEDAPAY_SANDBOX_SECRET_KEY` (`sk_sandbox_…`) et `FEDAPAY_SANDBOX_PUBLIC_KEY` (`pk_sandbox_…`) sont
lues dans l'environnement. Ne jamais les écrire dans un fichier versionné. Le script refuse
toute autre clé, donc jamais de mode live. `FEDAPAY_CAMPAIGN=fake` rejoue la même campagne
contre le client factice : cette variante valide le harnais.

Paiement du client en sandbox : `FEDAPAY_CAMPAIGN_PAY_MODE=momo_test` (défaut, seul mode ouvert sur le
sandbox) ou `operateur` (`mtn_open` / `moov`, si FedaPay les ouvre). En `momo_test`, les numéros du
paiement se règlent par `FEDAPAY_MOMO_TEST_APPROVED` et `FEDAPAY_MOMO_TEST_DECLINED` (défaut :
`+22966000001` / `+22964000001` approuvés, `+22966000000` refusé). La transaction reste créée par
l'API avec son mode opérateur : `momo_test` l'accepte (vérifié pour `mtn_open` et `moov`).

Fonctionnement et limites :

- Le « patient » paie sans redirection : `POST /v1/transactions/{mtn_open|moov}` avec le jeton de
  la transaction et un numéro de test (`+22966000001` / `+22964000001` approuvés, `+22966000000`
  refusé). Le reversement refusé (S8) vise ce dernier numéro.
- Aucun webhook n'atteint une API locale. L'état final est lu par le job `payments.sync`, relancé
  toutes les 5 s pendant une minute au plus. **S13 n'est pas couvert** : le rejeu d'un webhook
  exige l'environnement de recette public (§2).
- Si le compte sandbox a une URL de webhook configurée vers la production, FedaPay y enverra les
  événements de la campagne. La production les rejette : signature sandbox, transaction inconnue.
  Il vaut mieux retirer cette URL du compte sandbox pendant la campagne.
- S10 n'enregistre que le canal manuel : le remboursement réel du reste se fait dans le tableau
  de bord FedaPay. Sans ce geste, S12 signale sur S1 un écart `approved` / `refunded`. Le script
  le classe « expliqué » et ne retient que les anomalies des paiements de la campagne en cours.
- S6 avance `hold_until` des deux paiements (base de test seulement) pour ne pas attendre la retenue.
- La campagne est rejouable sur la même base : au démarrage, les numéros de test sont retirés
  des comptes `campagne-*@domicares.test` précédents.

Sondes du vrai sandbox sans clé (22 octobre 2026). Une route existante répond 401, ou 400 pour
`/{mode}` qui valide d'abord le jeton ; une route absente répond 404 :
- `POST /v1/transactions`, `…/{id}/token`, `GET`/`DELETE /v1/transactions/{id}`, la liste des
  transactions, `POST /v1/payouts`, `PUT /v1/payouts/start`, `GET`/`DELETE /v1/payouts/{id}` et
  la liste des dépôts : présentes ;
- paiement sans redirection : **`POST /v1/{mode}`** (`mtn_open`, `mtn`, `moov`, `moov_tg`, `mtn_ci`),
  réponse « Le jeton de transaction est invalide » sans jeton valide. Le harnais visait
  `/v1/transactions/{mode}`, qui répond 404 : corrigé, sans quoi S1 à S5 auraient échoué ;
- remboursement : `POST /v1/transactions/{id}/refund`, la route appelée par `fedapay.client.ts`,
  répondait **404** ; `POST /v1/refunds` et `GET /v1/refunds/{id}` **existent** (401). Le client
  appelle désormais `/v1/refunds`, avec le contrat relevé dans le tableau de bord FedaPay (document 08,
  §6) ; S0 vérifie ces deux routes.

Paiement sans redirection : la spécification OpenAPI de FedaPay documente `POST /transactions/{mode}`,
mais le sandbox répond 404 sur cette route. Les SDK officiels (`sendNowWithToken`) envoient
`POST /{mode}` avec `{ token, … }`, c'est la route retenue. Remboursement : absent de la référence et
des SDK, mais utilisé par le tableau de bord via `POST /v1/refunds` (document 08, §6). S9 l'exerce sur
un paiement MTN et relit le remboursement ; S11 le confirme par le job ; S10 garde le canal manuel.

La campagne commence par S0 « Routes du sandbox » : elle refait ces sondes et s'arrête si une route
appelée a disparu.

Le rapport tranche les trois points ouverts comme au §4 : corps de `/payouts/start` et `mode` (S7),
numéro `+229…` (S1, S7) et contrat `/v1/refunds` (S9, S11).

### Exécution du 23 octobre 2026 (sandbox réel, base PostgreSQL 16 locale dédiée)

Commande : `FEDAPAY_CAMPAIGN=sandbox DATABASE_URL=<base locale domicares_campagne> npm run campaign:fedapay`,
clés `sk_sandbox_` / `pk_sandbox_` lues dans l'environnement. Trois passages (rapports dans
`api/campaign-reports/`, non versionnés). Résultat : **campagne bloquée par le compte sandbox**,
deux défauts Domicares corrigés.

| # | Résultat | Constat |
|---|---|---|
| S0 | ok | toutes les routes appelées existent |
| S1, S2, S3, S5 | écart (compte) | `POST /v1/mtn_open` et `POST /v1/moov` → 400 « Opération non autorisée ». Sondé sur six transactions de 100 XOF : même refus avec clé secrète ou publique, numéro `+229…` ou local, avec ou sans `phone_number`, avec ou sans `mode` à la création, `/mtn` comme `/mtn_open`. Le contrat d'appel n'est pas en cause : le paiement sans redirection n'est pas autorisé sur ce compte |
| S4 | ok | paiement `canceled` ; la transaction est **supprimée** par FedaPay (relue en 404) |
| S6, S7, S8, S9, S10, S11 | non exercés | conséquence de S1–S5 (aucun paiement encaissé). `GET /v1/payouts` répond aussi 403 « Opération non autorisée » : les dépôts semblent également fermés sur ce compte |
| S12 | ok après correction | 1er passage : HTTP 500. 3e passage : 201, 0 anomalie de campagne |
| S13 | non couvert | URL publique requise |

Défauts corrigés (unitaires 120/120, e2e 158 réussis et 4 ignorés pour la suite S3, build et lint) :
- `GET /v1/transactions` répond 400 « Invoquer /v1/transactions est obsolète. Utiliser plutôt
  /v1/transactions/search » : la réconciliation tombait en 500. `listTransactions` lit
  `/v1/transactions/search`, qui **ignore** `created_at[gte|lte]` (même total pour une période de 2020) :
  la période est filtrée côté Domicares sur `created_at`, pagination par `meta.next_page`.
  Test : `fedapay.client.spec.ts`.
- La réconciliation signalait `missing_in_fedapay` (gravité haute) pour chaque paiement abandonné,
  car l'annulation supprime la transaction chez FedaPay. Un paiement `canceled` absent de FedaPay
  n'est plus une anomalie ; un paiement actif absent le reste. Test : `appointments-payments.e2e-spec.ts`
  (échoue sans la correction).

Reste à faire : demander à FedaPay d'activer sur le compte sandbox le paiement sans redirection
(`/v1/{mode}`) et les dépôts (`/v1/payouts`), puis relancer la campagne pour S1–S11, en particulier
le contrat `/v1/refunds` (S9, S11). `GET /v1/payouts` (réconciliation des dépôts) n'a pas pu être
vérifié face à la même dépréciation que `/v1/transactions`.

### Compléments du 23 octobre 2026 (documentation en ligne et sondes du sandbox)

Sondes faites avec la clé sandbox sur des transactions de 100 et 5 000 XOF, jamais en live.

- **Mode de test `momo_test`.** Le centre d'aide FedaPay (« Comment avoir les identifiants sandbox ? »)
  indique : « Les paiements Mobile Money se testent via la méthode momo_test. » La référence de l'API
  ne le mentionne pas. `POST /v1/momo_test` avec le jeton de la transaction est **accepté** (HTTP 200,
  objet `v1/payment_intent`, transaction relue en `mode` = `momo_test`), alors que `mtn_open` et `moov`
  répondent 400 « Opération non autorisée ». En sandbox, seul ce mode de test semble ouvert.
- **Paiements `momo_test` tous refusés.** Chaque intention passe `declined` immédiatement, avec
  `last_error_code` vide. Essais faits avec `64000001` (numéro de succès Moov cité par la documentation)
  et `66000001`, aux formats `+229…` et local, pour 100 et 5 000 XOF (exemple : transaction 530222,
  intention 294052, 15:35:05 UTC). La page des numéros de test (`docs.fedapay.com/payments/test`)
  répond 404 : aucun numéro de succès propre à `momo_test` n'est publié.
- **Route documentée absente.** La référence de l'API indique `POST /transactions/{mode}` (corps
  `{ token, phone_number }`), mais le sandbox répond toujours 404 sur `/v1/transactions/mtn_open` et
  `/v1/transactions/mtn`. La route `POST /v1/{mode}` des SDK, utilisée par le harnais, reste la bonne.
- **Dépôts.** `POST /v1/payouts` avec `mode: "momo_test"` répond aussi 403 « Opération non autorisée ».
  La documentation des dépôts ne cite aucune condition d'activation : seulement le contact
  support@fedapay.com.
- **Listes.** La référence de l'API ne documente que `GET /transactions/search` et `GET /payouts/search`,
  sans aucun paramètre de filtre. C'est cohérent avec le filtrage de période fait côté Domicares.
  La réconciliation des dépôts lit désormais `GET /v1/payouts/search`, avec la même pagination et le
  même filtrage de période que les transactions (`searchAll` dans `fedapay.client.ts`, test unitaire).
  Non vérifié sur le sandbox, qui répond 403 aux dépôts : à confirmer quand ils seront ouverts.
- **Webhook désactivé dans le sandbox.** La documentation des webhooks indique : « Après 10 essais sans
  succès, le webhook est automatiquement désactivé. » L'URL configurée ne répondait donc pas en 2xx,
  par exemple la production, qui rejette les signatures sandbox (§4 bis). Ce point est sans lien avec
  les refus de l'API et sans effet sur S1–S12, lus par `payments.sync`. Pour S13 : recréer le webhook
  vers l'environnement de recette, avec son secret sandbox dans `FEDAPAY_WEBHOOK_SECRET`, et décocher
  « Désactiver le Webhook lorsque l'application génère des erreurs ».

Transaction de référence transmise au support : id 530207, référence `trx_bHA_1792769320885`
(23 octobre 2026, 15:28:41 UTC). Exemple `momo_test` refusé : transaction 530222, intention 294052
(15:35:05 UTC). Questions posées :

1. Activation, sur le compte sandbox, du paiement sans redirection (`mtn_open`, `moov`) et des dépôts,
   ou limitation du sandbox à `momo_test` ?
2. Condition préalable manquante (vérification du compte, module à activer) ?
3. Paramètres de filtre par date de `/v1/transactions/search` ; `GET /v1/payouts` obsolète au profit de
   `/v1/payouts/search` ?
4. Prise en charge durable du contrat `POST /v1/refunds` `{ transaction_id, amount, description }` et
   `GET /v1/refunds/{id}`, et moyens de paiement concernés ?
5. Prise en compte du `mode` transmis à la création (absent à la relecture) ?
6. Webhook sandbox désactivé : désactivation automatique après des échecs d'envoi, ou restriction du
   compte ? Il sera recréé vers l'environnement de recette pour tester les événements `transaction.*`.
7. `POST /v1/momo_test` est accepté, mais tous les paiements sont refusés immédiatement : quels numéros
   de test donnent un paiement **approuvé** et lesquels un paiement **refusé** avec `momo_test` ? Quel
   mode utiliser pour tester les dépôts en sandbox, puisque `POST /v1/payouts` avec
   `mode: "momo_test"` répond 403 ?

Réponse du support : en attente.

Campagne en `momo_test` (23 octobre 2026, base locale recréée depuis `main`) : le harnais paie par
`POST /v1/momo_test` et note l'état de l'intention. Variante `fake` : tout passe (S11 sans objet, S13
non couvert). Sandbox réel : S0, S3, S4 et S12 ok. **S3 (paiement refusé) passe désormais de bout en
bout** : intention `declined`, transaction `declined`, paiement Domicares `failed` via `payments.sync`,
solde inchangé. S1, S2 et S5 en écart, car toutes les intentions `momo_test` sont refusées avec les
numéros par défaut ; S6 à S11 en découlent. Dépôts toujours en 403.

Suite : dès que le support donne un numéro approuvé, relancer avec
`FEDAPAY_MOMO_TEST_APPROVED=<numéro> FEDAPAY_CAMPAIGN=sandbox npm run campaign:fedapay`, sans modifier
le code. Le client de production garde `mtn_open`/`moov`.

Sources : [identifiants sandbox](https://support.fedapay.com/portal/fr/kb/articles/comment-avoir-les-identifiants-sandbox),
[envoi de paiement](https://docs.fedapay.com/api-reference/transactions/send-payment.md),
[moyens de paiement](https://docs.fedapay.com/fr/payment-methods.md),
[recherche de transactions](https://docs.fedapay.com/api-reference/transactions/get-all.md),
[recherche de dépôts](https://docs.fedapay.com/api-reference/payouts/get-all.md),
[gestion des dépôts](https://docs.fedapay.com/fr/integration-api/payouts-management.md),
[webhooks](https://docs.fedapay.com/fr/integration-api/webhooks.md).

## 5. Retour en live

```bash
deploy/vps/fedapay-mode.sh live
deploy/vps/fedapay-mode.sh status
```

Puis purger les données de recette (comptes, rendez-vous, paiements sandbox) avant l'ouverture,
ou les conserver en les identifiant clairement : les transactions sandbox n'existent pas côté
live, une réconciliation live les signalerait comme `missing_in_fedapay`.

Le premier paiement live reste un test à part entière : un rendez-vous réel à petit montant, suivi
avec `fedapay-observe.sh`, avant d'ouvrir à tous.
