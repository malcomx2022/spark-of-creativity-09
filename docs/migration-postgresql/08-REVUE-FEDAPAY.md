# 08 — Revue de l'intégration FedaPay

Revue de bout en bout de la chaîne de paiement, du front au reversement, menée le 18/09/2026
après la bascule sur le VPS. Chaque constat cite le fichier et la ligne, précise s'il est
**confirmé** (par le code, un test ou la documentation FedaPay) ou **à confirmer** auprès
de FedaPay, et propose la correction.

## 1. Cadre

### 1.1 Un fait qui change la lecture de tout le reste

L'export de production du 09/09 contient **0 ligne** dans `payments`, `payment_attempts`,
`webhook_events`, `payment_refunds`, `practitioner_payouts` et `payout_batches`
(`06-INVENTAIRE-SUPABASE.md` §2.1). Aucun paiement, aucun remboursement, aucun reversement
n'a jamais été traité en production, ni sous Supabase ni depuis.

La chaîne FedaPay n'a donc **jamais été confrontée à l'API réelle**. Les Edge Functions
historiques n'apportent aucune garantie empirique : elles ont été portées fidèlement, y
compris leurs erreurs. Les tests e2e valident la logique interne contre un client factice,
pas le contrat FedaPay. Plusieurs constats ci-dessous sont des écarts entre ce que le code
suppose et ce que la documentation FedaPay décrit ; ils étaient déjà présents avant la
migration et n'ont jamais eu l'occasion de se manifester.

Conséquence pratique : **la recette du paiement doit se faire en `FEDAPAY_MODE=sandbox`**,
pas avec les clés live sur un rendez-vous réel, tant que les constats critiques ne sont pas
levés. Le `.env` du VPS est aujourd'hui en live.

### 1.2 Périmètre lu

| Couche | Fichiers |
|---|---|
| Client HTTP | `api/src/payments/fedapay.client.ts` |
| Paiements | `payments.service.ts`, `payments.controller.ts`, `payments.dto.ts`, `fees.ts`, `balances.service.ts`, `ledger.service.ts` |
| Finance | `finance.service.ts`, `finance.controller.ts` (reversements, lots, remboursements, rétention, réconciliation, webhooks) |
| Séances de groupe | `group-sessions.service.ts` (inscription, nouvelle tentative, désinscription) |
| Rendez-vous | `appointments.service.ts` (paiement créé à l'acceptation) |
| Jobs | `jobs.service.ts`, `worker.ts` |
| Front | `PaymentDialog.tsx`, `FedaPayWidget.tsx`, `PaymentCallback.tsx`, `lib/fedapay-widget.ts`, widgets de séance, `WebhookConfig.tsx`, `SandboxPaymentTester.tsx` |
| Historique | `supabase/functions/{create-payment,payment-webhook,create-payout,process-payout-batch,process-refund,reconcile-fedapay,apply-ledger-entries}` |
| Documentation FedaPay | `integration-api/fr/payouts-management-fr`, `api-reference/payouts/update-start`, `integration-api/fr/webhooks-fr`, `integration-api/fr/collects-management-fr`, `dashboard/fr/refunds-fr`, `api-reference/transactions/create` |

### 1.3 Ce qui est solide

Pour situer les constats, ce qui a été vérifié et tient :

- signature HMAC-SHA256 en comparaison à temps constant, deux formats acceptés (`payments.service.ts:277-296`) ; secret obligatoire en production (`config.schema.ts:108`) ;
- idempotence des webhooks par `event_id` avec `INSERT … ON CONFLICT DO NOTHING` (`:307-316`), rejeu à backoff exponentiel, cinq tentatives puis `permanently_failed` avec alerte (`:343-383`) ;
- un paiement `paid` ne régresse jamais vers `pending` ou `failed` sur un événement tardif (`:407-411`) ;
- soldes **recalculés** depuis `payments`, jamais incrémentés (`balances.service.ts`), ce qui corrige le doublement hérité ;
- fonds **réservés** par `payout_payments` au lieu d'être remis à zéro ; un reversement échoué les libère (`finance.service.ts:290-296`) ;
- montant d'une séance de groupe fixé côté serveur (`payments.service.ts:81-82`) ;
- simulation de webhook refusée hors client factice (`payments.controller.ts:105`) ;
- routes finance réservées à `super_admin` / `finance` / `ops` ;
- chemin principal couvert par les e2e : création, signature, idempotence, transition, rendez-vous, ledger, solde, sync, nettoyage.

## 2. Constats

Sévérité : **C** critique (argent ou sécurité, bloquant), **M** majeur (défaut fonctionnel
ou incohérence de données), **m** mineur.

### C1 — Le client fixe le montant d'un rendez-vous — confirmé

`payments.service.ts:89` : `amount = dto.amount ?? appointment.payment_amount ?? DEFAULT`.
Quand le front envoie `amount` (`PaymentDialog.tsx:665-667`, `FedaPayWidget.tsx:225-227`),
il **prime** sur le montant fixé par le praticien à l'acceptation
(`appointments.service.ts:147-159`). Le schéma n'impose qu'un minimum de 100 XOF
(`payments.dto.ts:9`).

Scénario : rendez-vous accepté à 15 000 XOF ; le patient attend deux minutes que le
paiement ouvert expire (`:93-108`), puis appelle `POST /api/payments` avec
`amount: 100`. FedaPay encaisse 100 XOF, le webhook `approved` confirme le rendez-vous,
le praticien est crédité du net de 100 XOF. La séance de groupe est protégée contre
exactement cela (`:81`), le rendez-vous ne l'est pas.

Correction : ignorer `dto.amount` dès que `appointment.payment_amount` est renseigné, ou
rejeter tout écart en 400 ; ne garder le montant client que si `payment_amount` est nul
(et le journaliser). Test e2e : un `amount` différent du tarif doit être refusé.

### C2 — Les reversements ne sont jamais démarrés — confirmé (documentation)

`fedapay.client.ts:156-164` crée le payout (`POST /v1/payouts`) et s'arrête là. La
documentation est explicite : après création, le dépôt « n'est pas automatique. Il demeure
en statut *pending* jusqu'à un appel séparé », `PUT /v1/payouts/start` avec la liste des
identifiants (cycle : `pending → started → processing → sent | failed`).

Or `finance.service.ts:278-288` (`markSent`) passe immédiatement le reversement en `sent`,
marque les paiements `payout_status = 'paid'` et notifie le praticien « les fonds
arriveront sous 24-48 h ». **L'argent ne part jamais.** Le code historique
(`create-payout/index.ts:365-380`) avait la même lacune ; il n'a jamais servi.

Deux points annexes à confirmer avec FedaPay : la valeur de `mode` (le code envoie `mtn` /
`moov` / `bank`, la documentation cite `mtn_open` pour le Bénin et dit le champ optionnel)
et le format du numéro (la documentation montre `+22997808080` avec indicatif, le code le
retire — voir m2).

Correction : après `createPayout`, appeler `PUT /v1/payouts/start` avec `[{ id }]` ;
enregistrer le reversement en `sent` seulement si FedaPay répond `started` ou
`processing` ; suivre l'état par `GET /v1/payouts/{id}` (job) puisque aucun événement
`payout.*` n'est documenté (voir m9) ; ne passer en `completed` qu'au statut `sent`.

### C3 — L'endpoint de remboursement n'existe pas dans l'API FedaPay — à confirmer, très probable

`fedapay.client.ts:150-154` appelle `POST /v1/transactions/{id}/refund`. La référence
d'API FedaPay (index `llms.txt`) ne liste **aucun** endpoint de remboursement ; la seule
page sur le sujet est celle du **tableau de bord**, qui précise en outre que « le
remboursement est uniquement possible via MTN Mobile Money ». Le code historique
(`process-refund/index.ts:121-124`) appelait la même route et n'a jamais servi.

Impact : chaque remboursement depuis `RefundsSection` renverrait probablement 502
(`finance.service.ts:503-506`) — échec propre, mais fonctionnalité inopérante. Et un
patient ayant payé par Moov ne serait pas remboursable par FedaPay quel que soit le canal.

Correction : (1) confirmer auprès du support FedaPay l'existence d'une API de
remboursement ; (2) dans tous les cas, ajouter un mode **« remboursement effectué depuis
le tableau de bord FedaPay »** : l'administrateur rembourse chez FedaPay puis l'enregistre
dans Domicares avec la référence, ce qui déclenche les écritures, les soldes et la
notification sans appel API ; (3) documenter le cas Moov (remboursement par virement ou
avoir).

### C4 — Statut FedaPay `expired` non pris en charge — confirmé (documentation)

`fees.ts:55-65` ne connaît pas `expired`, que la documentation liste (« collecte non
finalisée dans le délai imparti »). `normalizeStatus` renvoie alors `pending`
(`:67-69`) : une transaction expirée reste « en attente », `payments.sync` ne la ferme
jamais, seul `payments.cleanup` l'annule au bout de 10 minutes, avec un libellé faux.

Correction : `expired → failed` ; la réconciliation (`finance.service.ts:605`) doit le
connaître aussi.

### M1 — Double paiement possible sur un même rendez-vous — confirmé

Trois mécanismes se combinent :

- `payments.service.ts:106` marque `failed` un paiement ouvert de plus de deux minutes
  **sans annuler la transaction chez FedaPay** : le lien de paiement reste valide ;
- `cleanupStuckPayments` (`:509-525`) annule après 10 minutes **sans interroger FedaPay**,
  alors qu'un paiement Mobile Money peut prendre plus longtemps ;
- `transition` (`:407`) laisse `failed` et `canceled` repasser à `paid` sur un
  `approved` tardif — voulu, mais rien ne vérifie qu'un **autre** paiement du même
  rendez-vous n'est pas déjà `paid`.

Scénario : paiement 1 lent, annulé par le job ; le patient relance, paie le paiement 2 ;
le webhook du paiement 1 arrive enfin → deux paiements `paid`, le patient débité deux
fois, aucun remboursement automatique, aucune alerte.

Correction : (a) avant d'annuler ou de marquer `failed`, `GET /v1/transactions/{id}` et
n'annuler que si FedaPay n'est pas `approved` ; (b) dans `transition` vers `paid`, si un
autre paiement `paid` existe pour le même `appointment_id`, marquer celui-ci « à
rembourser » et alerter la finance ; (c) un index unique partiel sur
`(appointment_id) WHERE status IN ('initiated','pending','authorized')` pour empêcher deux
paiements ouverts simultanés — `create()` a une fenêtre de course entre le contrôle
(`:94`) et l'insertion (`:141`), et `idempotency_key` est aléatoire à chaque appel
(`:116`), donc sans effet.

### M2 — Tolérance d'horodatage du webhook supprimée — confirmé (régression)

`payment-webhook/index.ts:602-623` rejetait un événement de plus de 5 minutes en
production (30 en sandbox). Le port ne le fait plus : `verifySignature` accepte la forme
`t=…,s=…` (`payments.service.ts:283`) sans jamais comparer `t` à l'heure courante. Un
événement signé capturé reste rejouable indéfiniment ; seule l'idempotence par `event_id`
le neutralise, et uniquement si l'attaquant réutilise le même identifiant.

Correction : rejeter si `|now − t| > 300 s` (sandbox : 1 800 s) quand `t` est présent, et
lire `created_at` du corps sinon, comme l'historique.

### M3 — Un webhook `refunded` écrase un remboursement partiel — confirmé (code)

`finance.service.ts:508-512` enregistre un remboursement partiel en `partially_refunded`.
Si FedaPay émet ensuite un événement de statut `refunded` (comportement à confirmer),
`transition` (`payments.service.ts:407`) l'accepte — `partially_refunded` n'est protégé que
contre les retours en arrière — et passe le paiement en `refunded` intégral avec
`payout_status = 'failed'` (`:413`), alors que le solde du praticien a déjà été ajusté au
prorata. Même chose pour un paiement déjà reversé : `payout_status` devient `failed` alors
que l'argent est parti.

Correction : sur `refunded`, comparer la somme des `payment_refunds` au montant ; rester
en `partially_refunded` si elle est inférieure ; ne pas toucher `payout_status` quand il
vaut `paid`.

### M4 — Un webhook de transfert `failed` tardif corrompt un reversement terminé — confirmé

`finance.service.ts:439-448` : si le reversement est déjà `completed` et qu'un événement
`failed` arrive (rejeu, événement en retard), `markFailed` passe le reversement en
`failed`, **supprime** les liens `payout_payments` et recalcule le solde — mais les
paiements gardent `payout_status = 'paid'`. Les fonds apparaissent à la fois versés et
libérés.

Correction : ignorer tout événement sur un reversement en état terminal (`completed`,
`failed`), en le journalisant.

### M5 — Transfert hors transaction, sans rattrapage — confirmé

`finance.service.ts:330-341` et `:417-421` : l'appel FedaPay se fait entre deux
transactions SQL. Si le processus s'arrête après l'acceptation FedaPay et avant
`markSent`, l'argent est parti mais le reversement reste `planned`, les fonds restent
réservés, et toute nouvelle tentative individuelle répond 409 (`:310-311`). Rien ne
réconcilie les reversements avec FedaPay (`reconcile` ne traite que les transactions).

Correction : écrire l'identifiant FedaPay dès qu'il est connu (mise à jour minimale avant
`markSent`), et ajouter une réconciliation des reversements par `GET /v1/payouts`.

### M6 — La réconciliation exclut le dernier jour — confirmé

`fedapay.client.ts:142` filtre `created_at[lte]=AAAA-MM-JJ` ; `finance.service.ts:593-599`
borne le local à `new Date(periodEnd)`, soit minuit. Les transactions du dernier jour
manquent d'un côté ou de l'autre selon l'interprétation de FedaPay, d'où de faux
`missing_in_fedapay` / `missing_in_db` à chaque rapport.

Correction : borner à la fin de journée (`T23:59:59.999`) des deux côtés.

### M7 — Le statut du remboursement FedaPay est ignoré — confirmé

`finance.service.ts:503-510` : `provider.status` n'est jamais lu ; le remboursement est
enregistré `completed` même si FedaPay répond `pending`.

Correction : n'enregistrer `completed` que sur un statut final de succès ; sinon
`pending`, suivi par `sync`.

### M8 — `callback_url` avec chaîne de requête, paramètres FedaPay ignorés — confirmé (documentation)

`payments.service.ts:124` construit
`…/payment/callback?appointment_id=<id>`. La documentation indique que FedaPay ajoute
`?id=<transaction>&status=<statut>` à l'URL de retour. Selon la construction faite par
FedaPay, l'URL peut devenir `…?appointment_id=X?id=258&status=approved`, et
`PaymentCallback.tsx:50` lit alors `appointment_id = "X?id=258"` → « Paiement non
trouvé ». Par ailleurs la page attend `transaction_id` (`:48`) alors que FedaPay envoie
`id`, et n'exploite pas `status`.

Correction : URL de retour sans chaîne de requête (`/payment/callback/<appointmentId>`),
et lecture de `id` / `status` fournis par FedaPay.

### M9 — Un paiement encore en attente est affiché comme un échec — confirmé

`PaymentCallback.tsx:99-101` : après une synchronisation, tout statut autre que `paid`
donne l'écran « Paiement non confirmé ». Un paiement Mobile Money légitimement en cours
est présenté comme échoué, ce qui pousse le patient à repayer (voir M1).

Correction : état « en attente de confirmation » avec relance périodique, comme le fait
déjà `PaymentDialog.tsx:1120`.

### M10 — Un webhook peut rester bloqué en `processing` — confirmé

`payments.service.ts:307-316` réserve l'événement (`processing`) dans une transaction, puis
le traite dans une autre. Un arrêt entre les deux le laisse en `processing` pour toujours :
le rejeu ne reprend que les `failed` (`:346`).

Correction : le job `webhooks.retry` repasse en `failed` tout `processing` de plus de dix
minutes.

### M11 — Écritures comptables non équilibrées — confirmé (hérité)

`ledger.service.ts:31-37` : pour 15 000 XOF, débit `cash` 15 000 ; crédits `obligation`
15 000, `payable` 9 450, `revenue_commission` 5 550, `revenue_fees` 325. Le test e2e
(`appointments-payments.e2e-spec.ts:161-163`) **fige** ce déséquilibre : débits 15 000,
crédits 30 325. Les frais de passerelle sont comptés en produit alors qu'ils sont payés
par la plateforme (`fees.ts:30`, `paid_by = 'platform'`) — ce sont une charge. Même
schéma dans `apply-ledger-entries` historique.

Correction : `cash` 15 000 = `payable` 9 450 + `revenue_commission` 5 550 ; frais de
passerelle en écriture séparée `charge_passerelle` 325 / `cash` 325 ; supprimer la paire
`obligation` ou l'équilibrer ; mettre le test à jour. Aucun mouvement d'argent n'en
dépend, mais tout état comptable produit à partir du ledger est faux.

### m1 — Le moyen de paiement choisi n'est plus transmis à FedaPay

L'historique envoyait `mode: 'mtn_benin' | 'moov_benin'` à la génération du jeton
(`create-payment/index.ts:392-395`, `:548`). Le port envoie `{}`
(`fedapay.client.ts:129`). Le patient choisit MTN ou Moov dans l'interface, FedaPay
propose tout.

### m2 — Numéro sans indicatif alors que la documentation le montre avec — à confirmer

`payments.service.ts:125` et `finance.service.ts:264` retirent `+229`. La documentation
montre `"number": "+22997808080", "country": "bj"`. L'historique faisait pareil et n'a
jamais servi. Un test sandbox tranche en une minute.

### m3 — Frais : défauts trompeurs, tests non représentatifs, arrondis sur colonnes entières

En production, `system_config` fixe `payment_commission_rate` à **5 %** et
`payment_gateway_fees` à **2 %** à la charge de la plateforme (`06-INVENTAIRE` §2.5) ; ces
valeurs priment et le code les lit correctement. Trois points néanmoins : les défauts
codés (`fees.ts:40-44` : 37 %, 100 XOF + 1,5 %) diffèrent de l'historique (0 + 2 %) alors
que le commentaire `fees.ts:34` affirme « mêmes défauts » ; les tests e2e valident 37 % et
325 XOF de frais (`appointments-payments.e2e-spec.ts:125`), soit une configuration qui
n'est pas celle de la production ; et `roundingDecimals = 2` produit des décimales
insérées dans des colonnes `integer` (`commission_amount`, `net_amount`), que PostgreSQL
arrondit en silence — `net + commission` peut différer de `amount` d'un franc. Pour le
XOF, zéro décimale, et un test avec la configuration réelle.

### m4 — Clé d'idempotence sans effet

`payments.service.ts:116` : `idempotency_key` est un UUID aléatoire par appel. Elle ne
protège de rien (voir M1c).

### m5 — Données personnelles

`payer_phone` en clair (`:149`) alors que `payment_attempts.phone_number_encrypted` et
`PHONE_ENCRYPTION_KEY` existent ; `fedapay.client.ts:96` journalise 500 caractères du corps
d'erreur FedaPay, qui peut contenir l'e-mail et le téléphone du client.

### m6 — Opérateur `orange` accepté

`practitioner_payment_info.payment_method` admet `orange`, absent au Bénin ; un tel
reversement échouerait chez FedaPay.

### m7 — `POST /api/payments/:id/sync` sans limitation

Un patient peut déclencher des appels FedaPay à volonté sur ses paiements.

### m8 — Notifications finance à chaque événement

`payments.service.ts:451-453` : toute approbation notifie tous les administrateurs
finance/ops. À volume réel, bruit.

### m9 — Événements documentés vs attendus

FedaPay documente `transaction.created/approved/declined/canceled/transferred/updated` et
`customer.*`. Ni `transaction.refunded` ni `payout.*`. `handleTransfer`
(`finance.service.ts:434`) et la transition `refunded` par webhook ne se déclencheront
probablement jamais : l'état des reversements et des remboursements doit être **interrogé**
(`GET /v1/payouts/{id}`, `GET /v1/transactions/{id}`), pas attendu.

## 3. Plan de correction proposé

| Lot | Contenu | Dépend de FedaPay ? |
|---|---|---|
| **1 — argent et sécurité** | C1, C4, M1, M2, M3, M4, M6, M7, M10 | non : corrigeables et testables maintenant |
| **2 — reversements et remboursements** | C2 (démarrage, statuts, suivi par interrogation), C3 (mode manuel + confirmation API), m1, m2, m9 | oui : une session sandbox et une question au support |
| **3 — qualité** | M5, M8, M9, M11, m3 à m8 | non |

Ordre recommandé : lot 1, puis campagne **sandbox** complète (paiement MTN et Moov,
webhook réel, expiration, annulation, remboursement, reversement démarré et suivi jusqu'à
`sent`), puis lot 2 à la lumière des réponses FedaPay, puis passage en live. Le lot 3 peut
suivre la mise en service.

## 4. Ce que cela change pour la recette en cours

Tant que le lot 1 n'est pas livré et qu'une campagne sandbox n'a pas eu lieu, un paiement
réel sur `domicares.life` n'est pas un test : c'est une première exécution en production
d'un code jamais exercé. Repasser `FEDAPAY_MODE=sandbox` avec les clés sandbox sur le VPS
le temps de la campagne ne coûte qu'un redémarrage de `api`.
