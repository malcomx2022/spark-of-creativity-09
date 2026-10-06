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
- Documenter la validation après déploiement et la compatibilité du rollback avec
  les éventuelles migrations. `/api/health` seul ne valide pas les parcours métier.
- Mettre à jour les exemples de configuration, `preflight.sh`, les workflows et le
  guide d'installation lorsque le lot change leurs prérequis. Ne pas versionner de secrets.
- Tester les commandes et scripts sur un environnement isolé. Un changement de
  documentation ou un plan n'autorise pas une bascule, un reset distant ou un paiement live.
