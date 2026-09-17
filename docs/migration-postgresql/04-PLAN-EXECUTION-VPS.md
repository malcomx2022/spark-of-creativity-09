# 04 — Plan d'exécution jusqu'à l'hébergement sur VPS

## 0. Cible

```
Internet ──► Caddy (443, TLS auto) ──┬── /            → web (nginx, build Vite)
                                     ├── /api/*       → api (NestJS, port 3000)
                                     └── /socket.io/* → api (WebSocket)
                    worker (cron BullMQ + relais LISTEN/NOTIFY → Socket.IO)
                    postgres:16 (db/native/schema.native.sql)   minio (ou Wasabi)
                    backup (pg_dump quotidien → ./backups → rclone hors site)
```

Fichiers : `deploy/vps/docker-compose.yml`, `caddy/Caddyfile`, `web.Dockerfile`, `nginx-spa.conf`,
`backup.sh`, `install-vps.sh`, `.env.example`.

Dimensionnement de départ (un seul VPS) : **4 vCPU / 8 Go RAM / 80 Go NVMe**, Ubuntu 24.04
(Hetzner CX32 ≈ 8 €/mois, Hostinger KVM 4, OVH…). Prévoir un second VPS « staging » plus petit.

## 1. Phases

| Phase | Durée indicative | Livrable | Sortie |
|---|---|---|---|
| **P0 — Sauvegarde d'urgence** | 1 jour | Export complet (doc 02) chiffré, 2 copies | `rowcounts.csv`, `SHA256SUMS` |
| **P1 — Base native** | 2 jours | `schema.native.sql` = schéma réel de prod ; import à blanc réussi | comptages identiques, `diff` schéma vide |
| **P2 — Back-end API** | 6 à 8 semaines | NestJS : auth, 31 endpoints front, webhook FedaPay, 16 jobs, WebSocket, S3 (doc 03) | tests d'intégration sur les parcours critiques (inscription, RDV+paiement, webhook, payout) |
| **P3 — Front découplé** | 3 à 4 semaines (parallèle à P2) | `src/api/*` remplace `supabase-js` dans 121 fichiers ; types générés depuis l'OpenAPI | `npm run build` sans `@supabase/supabase-js` ; e2e Playwright |
| **P4 — Staging VPS** | 1 semaine | stack complète sur un VPS de test avec l'export P0 | recette fonctionnelle par rôle (patient, praticien, coach, admin) |
| **P5 — Bascule** | 1 journée (fenêtre de maintenance) | export final, import, DNS, webhook FedaPay | checklist §4 |
| **P6 — Stabilisation** | 2 semaines | monitoring, correctifs, décommission Supabase/Lovable | Supabase supprimé après 30 jours |

## 2. Préparer le VPS (P4)

```bash
# en root, une fois
curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/main/deploy/vps/install-vps.sh | bash
# puis en tant que deploy
git clone <repo> ~/domicares && cd ~/domicares/deploy/vps
cp .env.example .env && nano .env            # secrets de la doc 02 §6
docker compose up -d postgres minio    # la base se crée avec 010_roles + schema.native.sql
docker compose exec postgres psql -U postgres -d domicares -c "ALTER ROLE domicares_app PASSWORD '<DOMICARES_APP_PASSWORD>'"
```

Contrôle « le VPS est prêt » (sans rien modifier) : `deploy/vps/preflight.sh [~/export/<h>]` vérifie
les outils, la complétude et la cohérence de `.env` avec `api/src/config/config.schema.ts` (valeurs
`change-me`, fournisseurs `fake`/`console` interdits en production, clés FedaPay conformes au mode,
VAPID, Twilio, Resend), la pile docker, disque/RAM, DNS vs IP publique, ports 80/443, et l'export
si un dossier est donné. Zéro ✖ = feu vert pour `bascule.sh` (§3).

DNS : `A domicares.life → IP`, `A www → IP`, `CAA 0 issue "letsencrypt.org"`. Caddy obtient le
certificat automatiquement au premier `docker compose up -d caddy`.

Buckets S3 : `documents`, `avatars`, `message-attachments`, privés, créés par `bascule.sh` (§3) ;
l'API génère des URLs pré-signées (remplace `get-presigned-url`).

## 3. Importer les données réelles (répétition en P4, définitif en P5)

Une seule commande, en tant que `deploy`, dans le clone du dépôt, avec l'export copié sur le VPS
(`scp -r export/<h> deploy@<vps>:~/export/`) :

```bash
deploy/vps/bascule.sh ~/export/<h>            # options : --skip-files, --no-restart, --force ; DRY_RUN=1 pour voir les commandes
```

`bascule.sh` enchaîne : contrôle de l'export (`check-export.sh`), de `pg_restore` 17 et de `.env` ;
sauvegarde de la base courante dans `deploy/vps/backups/pre-bascule-<h>.dump` ; arrêt de `api` +
`worker`, recréation de la base, `scripts/db/import-native.sh` (`DROP_RLS=1`, mots de passe des
rôles pris dans `.env`) ; fichiers Storage vers MinIO avec le client `mc` (image `quay.io/minio/mc`) lancé dans le réseau
docker de la pile (MinIO n'est pas exposé sur l'hôte ; buckets créés s'ils manquent, mêmes noms et
mêmes chemins) ; redémarrage et `/api/health` depuis le conteneur `api`. Il est relançable après
correction : la base est recréée à chaque passage.

Équivalent manuel :

```bash
docker compose stop api worker
docker compose exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS domicares" -c "CREATE DATABASE domicares"
PGHOST=127.0.0.1 PGUSER=postgres PGPASSWORD=$POSTGRES_PASSWORD DROP_RLS=1 DOMICARES_APP_PASSWORD=$DOMICARES_APP_PASSWORD \
  PGBIN=/usr/lib/postgresql/17/bin scripts/db/import-native.sh ~/export/<h> domicares   # client 17 installé par install-vps.sh
NET=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$(docker compose ps -q minio)")
docker run --rm --network "$NET" -v ~/export/<h>/storage:/export:ro --entrypoint sh quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z -c \
  'mc alias set local http://minio:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY" && for b in documents avatars message-attachments; do mc mb -p local/$b; mc mirror --overwrite /export/$b local/$b; done'
docker compose up -d api worker
```

Les colonnes `*_url` / `files.path` contiennent des chemins `bucket/objet` : l'API les résout en
URL pré-signées, aucune réécriture de données n'est nécessaire si l'on conserve les mêmes noms de
buckets et chemins. Vérifié sur l'export réel du 09/09/2026 (document 06 §3.1) : aucune colonne
texte ne contient d'URL `supabase.co` absolue, `messages` est vide.

Répétition déjà faite hors VPS le 09/09/2026 (PostgreSQL 16 + `pg_restore` 17, `DROP_RLS=1`) :
import sans erreur, comptages identiques, API démarrée sur la base obtenue. La même commande sur le
VPS doit donner le même résultat ; seule la partie fichiers reste à jouer pour de vrai.

## 4. Checklist de bascule (P5)

Avant (J-7 → J-1)
- [ ] Staging validé par un patient, un praticien, un coach et un admin réels.
- [ ] `deploy/vps/preflight.sh ~/export/<h>` sans ✖ ; répétition complète `bascule.sh` + mesure de durée (< fenêtre de maintenance).
- [ ] TTL DNS abaissé à 300 s.
- [ ] Nouveau webhook FedaPay créé en **sandbox** vers `https://staging…/api/webhooks/fedapay` et testé (`simulate-webhook` porté).
- [ ] Clés VAPID et `PHONE_ENCRYPTION_KEY` identiques à Supabase (sinon plan de re-souscription push).
- [ ] Page de maintenance prête côté Lovable.

Jour J
- [ ] Maintenance ON (plus d'écriture côté Supabase).
- [ ] `export-supabase.sh` (ou `.ps1`) final → `check-export.sh` → copie sur le VPS → `deploy/vps/bascule.sh` → comptages ✔.
- [ ] Storage : inclus dans `bascule.sh` (`mc mirror --overwrite`).
- [ ] Webhook FedaPay **live** basculé vers `https://domicares.life/api/webhooks/fedapay`, nouveau `FEDAPAY_WEBHOOK_SECRET` dans `.env`, `docker compose up -d api`.
- [ ] DNS → IP du VPS ; vérifier TLS, `/api/health`, connexion patient (mot de passe existant), OTP SMS, paiement sandbox de bout en bout, réception webhook, message temps réel, push.
- [ ] Maintenance OFF.

Après (J+1 → J+30)
- [ ] Surveiller `payment_events`, `webhook_events` (aucun webhook FedaPay perdu), logs Caddy/API.
- [ ] Mettre Supabase en pause à J+7, supprimer à J+30 (après une dernière sauvegarde).
- [ ] Supprimer les secrets Lovable Cloud, révoquer les clés `service_role`.

Rollback (si échec le jour J) : remettre le DNS sur Lovable (TTL 300 s), rebasculer le webhook
FedaPay sur `…/functions/v1/payment-webhook`, retirer la maintenance. Aucune donnée n'a été
écrite côté natif pendant la fenêtre, l'ancien système reste cohérent.

## 5. Exploitation

| Sujet | Mise en œuvre |
|---|---|
| Sauvegardes | service `backup` (pg_dump quotidien, rétention 14 j) + `rclone copy ./backups s3:…` en cron hôte ; test de restauration mensuel |
| Mises à jour | GitHub Actions : build images → `ssh deploy@vps 'cd domicares && git pull && docker compose up -d --build'` (adapter `.github/workflows/deploy.yml`, retirer les `|| true`) |
| Migrations de schéma | Prisma/Drizzle migrate ou fichiers SQL versionnés appliqués par `domicares_migrator` avant `up -d api` |
| Supervision | `docker compose logs`, Uptime Kuma (sondes `/api/health`, `/`), Loki/Grafana ou Netdata ; alertes sur webhooks FedaPay en échec |
| Sécurité | UFW (22/80/443), fail2ban, SSH par clé, Postgres non exposé, secrets hors git, rotation des clés API, HSTS |
| Scalabilité | séparer ensuite `postgres` sur un VPS dédié (ou base managée), passer l'API en 2 réplicas derrière Caddy, ajouter alors Redis comme adaptateur Socket.IO |

## 6. Coûts (ordre de grandeur mensuel)

VPS prod 8 Go ≈ 8–15 € ; staging ≈ 5 € ; stockage hors site sauvegardes ≈ 2 € ; Wasabi 1 To ≈ 7 €
(ou MinIO inclus) ; Twilio/Resend/FedaPay inchangés. Total infra ≈ 25–40 €/mois contre Lovable +
Supabase Pro actuellement.
