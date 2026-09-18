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
| S9 | **Remboursement par l'API** | Admin finance → Remboursements → canal « Par l'API FedaPay », partiel (par ex. la moitié) sur le paiement de S1 | soit `completed` (FedaPay a répondu approuvé) : paiement `partially_refunded`, écritures équilibrées (`ecart = 0`) ; soit `pending` : ligne « en attente » avec bouton Confirmer ; soit 502 `FEDAPAY_REFUND_UNAVAILABLE` : **l'API n'a pas d'endpoint de remboursement**, passer au canal manuel | remboursement visible dans Remboursements, ou erreur 404 relevée dans les journaux |
| S10 | **Remboursement manuel** | Rembourser le reste depuis le tableau de bord FedaPay (transaction → Rembourser), puis canal « Déjà effectué… » avec la référence FedaPay | paiement `refunded`, écritures équilibrées, notification patient, `provider_refund_id` = référence saisie | — |
| S11 | **Confirmation d'un remboursement en attente** | Si S9 a donné `pending` : vérifier chez FedaPay, puis bouton Confirmer avec la référence | `completed`, écritures équilibrées ; un second Confirmer → 400 | — |
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
| S9 | | | | 502 `FEDAPAY_REFUND_UNAVAILABLE` ou statut rendu |
| S10 | | | | |
| S11 | | | | |
| S12 | | | | |
| S13 | | | | |

Les trois points ouverts se lisent dans S7 (corps de `/payouts/start` accepté ? `mode` accepté ou
détecté ?), S1 et S7 (numéro `+229…` accepté ?) et S9 (endpoint de remboursement ?). Selon les
réponses, à ajuster dans `api/src/payments/fedapay.client.ts` (`FEDAPAY_MODES`, `startPayout`) et
dans `08-REVUE-FEDAPAY.md` §6.

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
