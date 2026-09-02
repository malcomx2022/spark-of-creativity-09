# 04 — Plan d'exécution jusqu'à l'hébergement sur VPS

## 0. Cible

```
Internet ──► Caddy (443, TLS auto) ──┬── /            → web (nginx, build Vite)
                                     ├── /api/*       → api (NestJS, port 3000)
                                     └── /socket.io/* → api (WebSocket)
                    worker (cron BullMQ + relais LISTEN/NOTIFY → Socket.IO)
                    postgres:16 (db/native/schema.native.sql)   redis:7   minio (ou Wasabi)
                    backup (pg_dump quotidien → ./backups → rclone hors site)
```

Fichiers : `deploy/vps/docker-compose.yml`, `Caddyfile`, `web.Dockerfile`, `nginx-spa.conf`,
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
docker compose up -d postgres redis minio    # la base se crée avec 010_roles + schema.native.sql
docker compose exec postgres psql -U postgres -d domicares -c "ALTER ROLE domicares_app PASSWORD '<DOMICARES_APP_PASSWORD>'"
```

DNS : `A domicares.life → IP`, `A www → IP`, `CAA 0 issue "letsencrypt.org"`. Caddy obtient le
certificat automatiquement au premier `docker compose up -d caddy`.

Buckets S3 : créer `documents`, `avatars`, `message-attachments` (MinIO : `mc mb`), privés ;
l'API génère des URLs pré-signées (remplace `get-presigned-url`).

## 3. Importer les données réelles (répétition en P4, définitif en P5)

```bash
# sur le VPS, avec l'export copié dans ~/export/<h>
docker compose stop api worker
docker compose exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS domicares" -c "CREATE DATABASE domicares"
PGHOST=127.0.0.1 PGUSER=postgres PGPASSWORD=$POSTGRES_PASSWORD DROP_RLS=1 \
  scripts/db/import-native.sh ~/export/<h> domicares
# fichiers
mc mirror ~/export/<h>/storage/documents         local/documents
mc mirror ~/export/<h>/storage/avatars           local/avatars
mc mirror ~/export/<h>/storage/message-attachments local/message-attachments
docker compose up -d api worker
```

Les colonnes `*_url` / `files.path` contiennent des chemins `bucket/objet` : l'API les résout en
URL pré-signées, aucune réécriture de données n'est nécessaire si l'on conserve les mêmes noms de
buckets et chemins (vérifier `files.bucket`, `practitioners.id_document_url`, `messages.attachment_url`
qui peut contenir une URL publique Supabase absolue ⇒ `UPDATE … SET attachment_url = regexp_replace(...)`).

## 4. Checklist de bascule (P5)

Avant (J-7 → J-1)
- [ ] Staging validé par un patient, un praticien, un coach et un admin réels.
- [ ] Répétition complète import + mesure de durée (< fenêtre de maintenance).
- [ ] TTL DNS abaissé à 300 s.
- [ ] Nouveau webhook FedaPay créé en **sandbox** vers `https://staging…/api/webhooks/fedapay` et testé (`simulate-webhook` porté).
- [ ] Clés VAPID et `PHONE_ENCRYPTION_KEY` identiques à Supabase (sinon plan de re-souscription push).
- [ ] Page de maintenance prête côté Lovable.

Jour J
- [ ] Maintenance ON (plus d'écriture côté Supabase).
- [ ] `export-supabase.sh` final → copie sur le VPS → `import-native.sh` → comptages ✔.
- [ ] Storage : `mc mirror` du delta.
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
| Scalabilité | séparer ensuite `postgres` sur un VPS dédié (ou base managée), passer l'API en 2 réplicas derrière Caddy, Redis adapter Socket.IO déjà prévu |

## 6. Coûts (ordre de grandeur mensuel)

VPS prod 8 Go ≈ 8–15 € ; staging ≈ 5 € ; stockage hors site sauvegardes ≈ 2 € ; Wasabi 1 To ≈ 7 €
(ou MinIO inclus) ; Twilio/Resend/FedaPay inchangés. Total infra ≈ 25–40 €/mois contre Lovable +
Supabase Pro actuellement.
