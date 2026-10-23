# Déploiement VPS — consignes complémentaires

Les consignes de `../../CLAUDE.md` s'appliquent. Références :
`../../docs/migration-postgresql/07-INSTALLATION-VPS.md` et
`../../docs/migration-postgresql/10-PLAN-CORRECTIONS-REVUE.md`.

- Préserver Compose, Caddy, nginx, le réseau interne, les volumes et les noms des buckets.
- Le schéma monté dans `docker-entrypoint-initdb.d` ne s'applique qu'à une base neuve.
  Toute migration destinée à un volume existant doit avoir une procédure distincte,
  testée sur une copie de développement, et un retour arrière documenté.
- Le lot 6 prévoit une sauvegarde PostgreSQL + objets S3 + manifeste de restauration,
  une copie hors site, des contrôles d'échec et un exercice de restauration isolé.
  Un dump PostgreSQL ne sauvegarde pas le volume MinIO.
- Documenter une stratégie de reprise cohérente entre références SQL et objets ;
  vérifier les trois buckets, les chemins, les tailles et les empreintes.
  Implémenté (document 15, §14) : backup.sh, restore-check.sh, restore-drill.sh, image backup
  (minio.Dockerfile --target backup), workflow backup-restore.yml. restore-check.sh vérifie les
  gardes « cible vide » avant toute écriture ; ne jamais affaiblir ce refus.
- Documenter la validation après déploiement et la compatibilité du rollback avec
  les éventuelles migrations. `/api/health` seul ne valide pas les parcours métier.
- Mettre à jour les exemples de configuration, `preflight.sh`, les workflows et le
  guide d'installation lorsque le lot change leurs prérequis. Ne pas versionner de secrets.
- Tester les commandes et scripts sur un environnement isolé. Un changement de
  documentation ou un plan n'autorise pas une bascule, un reset distant ou un paiement live.

Le workflow déploie désormais le SHA exact de son lancement (`github.sha`).
Le chantier applicatif du 6 octobre 2026 ne nécessite aucune migration SQL.
Le correctif des trois parcours du 7 octobre ne nécessite pas non plus de migration.
Configurer CONTACT_RECIPIENT_EMAIL dans le .env du VPS pour activer le contact public,
avec EMAIL_PROVIDER=resend et un expéditeur validé.
Vérifier la réception réelle avec `./contact-check.sh --via-site` (statut Resend puis boîte) ;
`preflight.sh` contrôle le domaine expéditeur et refuse une boîte égale à RESEND_FROM_EMAIL. Sans cette boîte, seul le contact
est indisponible (HTTP 503). Voir le document 14 pour les vérifications après livraison.
Le suivi du document 10 doit préciser le résultat réel du workflow de déploiement.

La PR #82 initiale a été fusionnée sur `main` (`4dbc588`). Suivi actif :
`../../docs/migration-postgresql/11-CORRECTIONS-FONCTIONNEL-SECURITE-PWA.md` ;
branche `codex/audit-followup-20261006`, avec PR et contrôles avant livraison.
Aucun déploiement VPS n'a été exécuté par le chantier courant.

PostgreSQL : image `domicares-postgres:16-alpine-locales` (`postgres.Dockerfile`, postgres:16-alpine +
musl-locales), construite sans `--pull` ; aussi utilisée par la CI (api-ci, recette, backup-restore) et
`restore-drill.sh` (`PG_IMAGE`). Premier déploiement : conteneur recréé sur le volume existant (document 07, §6).

Utiliser Node 22 pour le build web. Servir manifeste et worker sans cache HTTP durable,
préserver leur version produite par Vite et valider installation, hors ligne, mise à jour
consentie et cache exclusivement public. Rollback : images web/API ensemble et actualisation
des onglets ouverts sur le nouveau client.
