# Corrections fonctionnelles, sécurité, responsive et PWA — 6 octobre 2026

Référence : `main` à `4dbc588`, après fusion de la PR #82. Branche :
`codex/audit-followup-20261006`. Ce document est le suivi actif ; conserver les protections du document 10.

## Lots appliqués dans l'ordre demandé

| Lot | Changement et preuve | Commit |
|---|---|---|
| 1 — sessions/connexion | Cache purgé synchroniquement au changement de compte et requêtes annulées ; compteur SQL atomique. Régression de réponse tardive, erreurs simultanées et scénario Chromium super_admin → analyst validés | `8d9ba8f` |
| 2 — dépendances/push | Dépendances corrigées ; 60 POST/IP/15 min sur les routes publiques d'authentification ; destinations push HTTPS autorisées explicitement ; anciens abonnements contrôlés avant envoi ; message générique ; détachement navigateur puis serveur à la déconnexion, tous les abonnements en déconnexion globale. Audit npm complet à zéro avis et tests des protections | `95a33b0` |
| 3 — fonctionnel | Démonstration exclusivement DEV avec données corrigées ; `/appointments/page` ajoute pagination, total et vue patient/praticien ; lecture de l'état push sans attendre un worker inexistant. Test de 205 rendez-vous en pages 200 + 5, sans doublon, fuite de notes ni données d'un autre compte ; démo 404 en production | `e291d48` |
| 4 — responsive | Boutons multilignes avec hauteur minimale, grilles/cartes réductibles, administration et actions coach empilées, navigation coach défilante. 80 rendus à 320/390/768/1280 px : aucun débordement global mesuré | `26befaa` |
| 5 — PWA | Manifeste standalone, PNG 192/512/maskable/Apple, worker enregistré, indications hors ligne/installation iPhone, mise à jour consentie et cache versionné au build. Chromium valide manifeste, cache public, repli hors ligne et activation sur clic ; tests du worker excluant API/POST/ressources externes | `944446a` |

## Compatibilité et invariants

- React 18, NestJS 11, PostgreSQL 16 et la pile VPS restent en place. Le front passe à
  Vite 7, React Router 7, Tailwind 4 et jsPDF 4 : les anciennes branches ne corrigeaient pas
  tous les avis. Les tokens de couleur et la configuration Tailwind sont conservés.
- Node **22.12+ dans la branche 22**, image web `node:22-alpine`, installation par `npm ci`.
- Overrides versionnés : SWC `1.15.18` évite le chargeur natif incompatible avec le conteneur ;
  Fastify `^5.12.5` uniformise les copies transitives ; YAML `^4.3.2` reste compatible load/dump.
  `@fastify/static` est épinglé à `10.1.3` : les suivantes nécessitent un chargement ESM
  incompatible avec le runtime/test existant. Aucun avis npm connu sur ces versions lors de la validation.
- Aucun changement SQL, aucun nouveau secret, aucune migration nécessaire.
- `/appointments` conserve sa réponse tableau. `/appointments/page` renvoie `{ data, count }`,
  avec `limit` ≤ 200, `offset` ≥ 0, ordre date/heure/id stable et autorisations côté serveur.
- Le limiteur IP est local au processus : garder l'API derrière Caddy sans port public direct.
  Plusieurs instances nécessiteraient une limitation commune au proxy.
- Le cache PWA contient uniquement `/offline.html`, manifeste et icônes d'installation.
  Aucun dossier médical, réponse API, HTML authentifié, paiement ni mutation hors ligne.
  Une première visite connectée est nécessaire pour installer le worker.
- Le hash du worker inclut les bundles et fichiers publics préchargés. Une nouvelle version attend
  le clic « actualiser » ; seul l'onglet demandeur se recharge. Aucun paiement n'est relancé hors ligne.
- Les notifications sur écran verrouillé sont génériques ; les détails restent derrière l'authentification.
  Ajouter explicitement et tester tout nouveau service push dans l'autorisation serveur.

## Validation locale réalisée

- Front : **31 tests / 9 fichiers**, TypeScript et build réussis.
- API : **31 tests unitaires / 6 suites**, TypeScript et build réussis.
- Intégration : **105 tests / 10 suites**, PostgreSQL dédié et 4 essais S3 réels sur MinIO isolé.
  Une première tentative a rencontré MinIO arrêté ; la suite complète passe après son démarrage.
- Audit npm : **zéro avis**, dépendances de développement incluses, dans les deux projets.
- Lint bloquant du socle API front, composant PWA et tests du worker réussi.
- Responsive : 64 rendus de 16 routes publiques + 16 rendus des quatre tableaux de bord dans Chromium,
  avec API interceptée et données fictives. Aucun débordement global aux quatre largeurs.
- PWA : manifeste sans erreur, inspection des entrées de cache, navigation hors ligne et
  activation consentie vérifiées dans Chromium local.

Le lint global conserve 172 erreurs et 46 avertissements hérités et reste informatif en CI. Safari/iOS réel,
clavier mobile, paiements FedaPay et envois SMS/push réels ne sont pas validés par cette campagne.
Le bundle cartographique reste volumineux.

## Livraison et contrôle après déploiement

Publication en PR et contrôles CI avant déploiement manuel de la révision fusionnée.
Aucune fusion ni exécution du workflow VPS n'est effectuée par le chantier courant.

Après livraison, vérifier SHA, `/api/health`, `/appointments/page`, manifeste, icônes, cache,
changement de compte et mise à jour du worker. Faire la recette Safari/iOS et FedaPay sandbox
avant de déclarer ces parcours validés en production.

Rollback : remettre ensemble les images web/API de l'ancienne révision, sans migration SQL,
et actualiser les onglets ouverts sur le nouveau client après rollback de l'API.
Sauvegardes MinIO/hors site et exercice de restauration restent au lot 6 du document 10.
