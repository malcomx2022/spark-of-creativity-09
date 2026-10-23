# 07 — Installation du VPS et déploiement pas à pas

Procédure complète, de la première connexion SSH au site en production, pour la pile
`deploy/vps/` (Caddy, front nginx, API NestJS, worker, PostgreSQL 16, MinIO, sauvegardes).
Testée pour un VPS **Ubuntu 24.04** (Hostinger KVM, OVH, Hetzner : mêmes commandes).

Notations : `<IP_VPS>` l'adresse du serveur, `<DOMAINE>` le domaine servi (en recette un
sous-domaine, ex. `staging.domicares.life`), `<POSTE>` votre machine Windows où se trouve
déjà le dépôt et le dossier `export/20260909T001732Z`.

Ordre imposé : **§1 avant §2** (sinon le durcissement SSH peut vous couper l'accès), et
**§5 avant §6** (Caddy a besoin du DNS pour obtenir son certificat).

---

## 1. Première connexion et clé SSH (à faire en premier)

Depuis `<POSTE>`, dans PowerShell :

```powershell
ssh root@<IP_VPS>                      # mot de passe fourni par l'hébergeur
```

Relevez ce que vous avez :

```bash
lsb_release -ds && nproc && free -h && df -h /
```

Attendu : Ubuntu 24.04, au moins 2 vCPU, 8 Go de RAM, 80 Go de disque. En dessous de 4 Go
de RAM, baissez `PG_SHARED_BUFFERS` à `512MB` au §4.

**Installez votre clé publique**, sans quoi l'étape suivante vous enfermerait dehors :

```powershell
# sur <POSTE>, si vous n'avez pas encore de clé
ssh-keygen -t ed25519 -C "admin-domicares"
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@<IP_VPS> "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Vérifiez **dans une seconde fenêtre** que `ssh root@<IP_VPS>` n'affiche plus de demande de
mot de passe. Tant que ce n'est pas le cas, ne passez pas au §2.

> `install-vps.sh` ne coupe l'authentification par mot de passe que s'il trouve une clé
> publique autorisée ; sinon il la conserve et affiche un avertissement.

## 2. Préparer le VPS (dépendances système)

Le dépôt est privé : copiez le script depuis `<POSTE>` plutôt que de le télécharger.

```powershell
cd C:\chemin\vers\spark-of-creativity-09          # la racine du dépôt, pas deploy\vps
scp deploy\vps\install-vps.sh root@<IP_VPS>:/root/
ssh root@<IP_VPS> "sed -i 's/\r$//' /root/install-vps.sh && bash /root/install-vps.sh"
```

Le `sed` retire d'éventuelles fins de ligne Windows : un dépôt cloné avec
`core.autocrlf=true` produit des scripts en CRLF que bash refuse dès la première ligne
(`set: pipefail: invalid option name`). Le fichier `.gitattributes` du dépôt force
désormais LF sur les scripts, mais un clone antérieur garde ses CRLF ; pour le corriger
une fois pour toutes sur votre poste :

```powershell
git pull
git rm --cached -r . | Out-Null
git reset --hard
```

Le script installe et configure : Docker CE + plugin Compose, client PostgreSQL 16 **et 17**
(`pg_restore` 17 est obligatoire pour lire l'export Supabase), git, rclone, ufw (22/80/443),
fail2ban, mises à jour automatiques, 2 Go de swap, l'utilisateur `deploy` (groupes `docker`
et `sudo`, vos clés SSH recopiées), puis durcit SSH.

Le script se termine par un contrôle des outils et refuse d'annoncer « VPS prêt » si l'un
d'eux manque. Certaines images d'hébergeur livrent déjà Docker : le dépôt existant est alors
conservé, car déclarer deux fois la même source avec des chemins de clé différents casse apt
(« Conflicting values set for option Signed-By ») et fait échouer silencieusement toutes les
installations suivantes, `postgresql-client-17` compris.

Contrôle indépendant :

```bash
ssh root@<IP_VPS> "docker --version && docker compose version && /usr/lib/postgresql/17/bin/pg_restore --version && ufw status"
```

Si `apt` est déjà cassé par un dépôt en double, réparez avant de relancer :

```bash
ssh root@<IP_VPS> "rm -f /etc/apt/sources.list.d/docker.list && apt-get update && apt-get install -y postgresql-client-17"
```

`fail2ban` est activé avec votre adresse publique en liste blanche, déduite de la connexion
SSH en cours. Lancé autrement (console du fournisseur, script local), précisez-la :
`ADMIN_IP=<votre IP> bash /root/install-vps.sh`. Sans cette liste blanche, quelques
authentifications ratées suffisent à faire bannir votre poste, et `ssh` répond alors
`Connection timed out` sans autre recours que la console du fournisseur :

```bash
fail2ban-client status sshd                    # adresses bannies
fail2ban-client set sshd unbanip <votre IP>
```

Attention enfin au durcissement SSH : le script coupe l'authentification par mot de passe
dès qu'une clé publique est autorisée, y compris une clé déposée par l'hébergeur. Vérifiez
**immédiatement après** que `ssh root@<IP_VPS>` fonctionne toujours. En cas de blocage,
utilisez la console navigateur de l'hébergeur (Hostinger : hPanel → VPS → Terminal) et
rétablissez l'accès :

```bash
sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config && systemctl restart ssh
```

Si votre hébergeur propose son propre pare-feu (Hostinger : hPanel → VPS → Pare-feu),
autorisez-y aussi 22, 80 et 443 : il s'applique **avant** ufw.

## 3. Lier GitHub au VPS (clé de déploiement en lecture seule)

Le VPS doit pouvoir cloner et mettre à jour le dépôt privé, sans jamais pouvoir y écrire.

```bash
ssh root@<IP_VPS>
su - deploy
ssh-keygen -t ed25519 -f ~/.ssh/id_domicares -N "" -C "vps-domicares-deploy"
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/id_domicares
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
cat ~/.ssh/id_domicares.pub
```

Copiez la ligne affichée, puis dans GitHub : **dépôt → Settings → Deploy keys → Add deploy
key**, titre `VPS production`, collez la clé, **laissez « Allow write access » décoché**,
`Add key`.

Clonez ensuite, toujours en tant que `deploy` :

```bash
ssh -T git@github.com                                  # répondre yes ; « successfully authenticated » attendu
git clone git@github.com:malcomx2022/spark-of-creativity-09.git ~/domicares
cd ~/domicares && git log --oneline -1
```

## 4. Configuration : `deploy/vps/.env`

```bash
cd ~/domicares/deploy/vps
cp .env.example .env
```

Générez les secrets propres au VPS :

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "DOMICARES_APP_PASSWORD=$(openssl rand -hex 24)"
echo "DOMICARES_MIGRATOR_PASSWORD=$(openssl rand -hex 24)"
echo "JWT_ACCESS_SECRET=$(openssl rand -hex 32)"
echo "S3_ACCESS_KEY=$(openssl rand -hex 12)"
echo "S3_SECRET_KEY=$(openssl rand -hex 32)"
```

Reprenez à l'identique depuis Supabase (*Edge Functions → Secrets*, voir document 02 §6) :
`FEDAPAY_PUBLIC_KEY`, `FEDAPAY_SECRET_KEY`, `TWILIO_*`, `RESEND_API_KEY`, `MAPBOX_TOKEN`,
`PHONE_ENCRYPTION_KEY`, et surtout `WEB_PUSH_PUBLIC_KEY` / `WEB_PUSH_PRIVATE_KEY` : des
clés VAPID différentes invalident les abonnements push existants.

Points de vigilance, tous contrôlés au §7 :

| Clé | Valeur |
|---|---|
| `DOMAIN` | le domaine réellement servi : en recette `staging.<domaine>`, en production `<domaine>` |
| `WWW_DOMAIN` | `www.<domaine>` en production, **`www.localhost` en recette** (sinon Caddy boucle sur un certificat impossible) |
| `FEDAPAY_MODE` | `live` en production (la base importée contient `system_config.fedapay_mode = live`), avec des clés `pk_live_` / `sk_live_` |
| `FEDAPAY_WEBHOOK_SECRET` | régénéré par FedaPay après le changement d'URL de webhook (§11) |
| `OTP_PROVIDER`, `STORAGE_PROVIDER`, `FEDAPAY_PROVIDER` | jamais `fake` : l'API refuse de démarrer en production |
| `API_DOCS_ENABLED` | absente, la documentation OpenAPI est publiée hors production et fermée en production. Elle décrit toute la surface de l'API : `true` ne la rouvre sur `https://<domaine>/api/docs` que le temps d'en avoir besoin |
| `PG_SHARED_BUFFERS` | `1GB` pour 8 Go de RAM, `512MB` pour 4 Go |

```bash
chmod 600 .env        # le fichier contient tous les secrets de production
```

## 5. DNS

En recette, créez chez votre registraire un enregistrement **A** `staging` → `<IP_VPS>`
(TTL 300). Le domaine de production reste sur l'ancien hébergement tant que la bascule
n'est pas décidée : vous validez la pile complète sans interrompre le service.

```bash
getent ahostsv4 staging.<domaine>      # doit renvoyer <IP_VPS>
```

Un enregistrement `CAA 0 issue "letsencrypt.org"` est recommandé. La bascule du domaine
principal se fait au §11.

## 6. Démarrer la pile

```bash
cd ~/domicares/deploy/vps
docker compose build minio postgres          # MinIO compilé depuis sa release ; PostgreSQL + locales (ci-dessous)
docker compose up -d postgres minio          # la base se crée avec 010_roles + schema.native.sql
docker compose logs -f postgres              # attendre « database system is ready », puis Ctrl-C
docker compose build web api worker          # 5 à 10 min la première fois
docker compose up -d
docker compose ps
```

PostgreSQL : `postgres.Dockerfile` reprend `postgres:16-alpine` et ajoute les locales musl
(`musl-locales`). Sans elles, initdb journalise « no usable system locales were found » et n'importe
aucune collation système ; avec, `fr_FR`, `en_US`… sont importées (les collations ICU restent
disponibles). L'image est construite sans `--pull` : pas de montée de version mineure implicite.
Sur un VPS déjà en service, le premier déploiement qui l'embarque recrée le conteneur `postgres`
(quelques secondes d'indisponibilité) sur le volume `pg_data` existant : mêmes binaires PostgreSQL,
données et tri inchangés (musl trie par octets, avec ou sans locales). Les collations système d'une
base existante s'ajoutent si besoin par `SELECT pg_import_system_collations('pg_catalog');`.
Retour arrière : `image: postgres:16-alpine` sans `build`, puis `docker compose up -d postgres`.
`POSTGRES_INITDB_ARGS=--auth-local=trust --auth-host=trust` rend explicites les méthodes qu'initdb
applique par défaut : même `pg_hba.conf`, sans l'avertissement « enabling trust authentication ».
Comme le schéma monté, il ne joue qu'à la création d'une base neuve.

MinIO ne publie plus d'images accessibles anonymement : `minio.Dockerfile` compile la release
épinglée (`RELEASE.2025-09-07T16-13-09Z`) depuis son commit, avec les mêmes options que le build
officiel. Mesure à froid sur 4 cœurs : 97 s et un pic d'environ 1,5 Go de mémoire ; prévoyez
2 Go libres (swap compris) et davantage de temps sur 2 vCPU. Compilation faite une seule fois : l'image `domicares-minio:RELEASE.2025-09-07T16-13-09Z`
est ensuite réutilisée. Sur un serveur qui possède déjà l'image officielle
`quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z`, le workflow de déploiement la réétiquette
au lieu de compiler. Le client `mc` de `bascule.sh` est construit de la même façon à sa
première utilisation.

Les buckets S3 sont créés automatiquement par `bascule.sh` (§8). Pour les créer sans
importer de données :

```bash
NET=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$(docker compose ps -q minio)")
docker run --rm --network "$NET" --env-file .env --entrypoint sh quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z -c \
  'mc alias set local http://minio:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY" && for b in documents avatars message-attachments; do mc mb -p local/$b; done'
```

Premiers contrôles :

```bash
curl -s https://$(grep ^DOMAIN= .env | cut -d= -f2)/api/health     # {"status":"ok","database":"ok",…}
docker compose logs --tail=30 caddy                                # certificat obtenu
```

## 7. Contrôle de préparation

```bash
cd ~/domicares
deploy/vps/preflight.sh
```

Il vérifie les outils, la complétude et la cohérence de `.env` avec
`api/src/config/config.schema.ts`, l'état de la pile, le disque, la RAM, le DNS face à l'IP
publique et les ports 80/443. **Zéro ✖ avant de passer au §8.**

Où retrouver les secrets que le contrôle réclame, lorsque Supabase ne les affiche plus :

| Clé | Source |
|---|---|
| `RESEND_API_KEY` | resend.com → API Keys → créer une clé (le domaine est déjà vérifié, enregistrement `resend._domainkey`) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | console.twilio.com, page d'accueil du compte |
| `TWILIO_VERIFY_SERVICE_SID` | console Twilio → Verify → Services (identifiant commençant par `VA`) |
| `TWILIO_PHONE_NUMBER` | le numéro émetteur au format international |
| `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` | `docker run --rm node:22-alpine npx -y web-push generate-vapid-keys` ; des clés neuves n'invalident que les abonnements push existants |
| `FEDAPAY_WEBHOOK_SECRET` | tableau de bord FedaPay → Webhooks → créer l'endpoint `https://<DOMAINE>/api/webhooks/fedapay`, puis copier son secret de signature |

L'endpoint FedaPay peut être déclaré avant que le serveur ne réponde : seule la valeur du
secret est nécessaire au démarrage de l'API.

## 8. Importer les données réelles

Depuis `<POSTE>`, envoyez l'export contrôlé (base + fichiers Storage) :

```powershell
ssh deploy@<IP_VPS> "mkdir -p ~/export"      # scp ne crée pas le dossier de destination
scp -r export\20260909T001732Z deploy@<IP_VPS>:~/export/
ssh deploy@<IP_VPS> "du -sh ~/export/<horodatage> && ls ~/export/<horodatage>"
```

Le contrôle de taille n'est pas une coquetterie : un export complet pèse une centaine de
mégaoctets et contient un dossier `storage`. S'il n'en fait que quelques centaines de
kilooctets, seules la base et les métadonnées ont été transférées, et les documents des
praticiens manqueront à l'arrivée.

Vérifiez aussi que l'horodatage est le bon. `export-supabase` et `export-storage.mjs`
créent chacun leur dossier : lancés à quelques minutes d'intervalle, les dumps atterrissent
dans un horodatage et les fichiers dans un autre. Transférez alors le dossier **complet**,
celui qui contient à la fois les `.dump` et `storage/`, sans assembler deux exports :
`data_storage_meta.dump` décrit les objets à l'instant du dump, et croiser des métadonnées
avec des fichiers pris plus tard laisse des lignes sans fichier.

Puis sur le VPS, en `deploy` :

```bash
cd ~/domicares
deploy/vps/preflight.sh ~/export/20260909T001732Z      # inclut check-export.sh
deploy/vps/bascule.sh   ~/export/20260909T001732Z
```

`bascule.sh` sauvegarde la base courante, arrête `api` et `worker`, recrée la base, lance
`scripts/db/import-native.sh` (`DROP_RLS=1`), envoie les fichiers dans MinIO en conservant
les mêmes chemins, redémarre et interroge `/api/health`. Il est relançable après correction.

Attendu : `✔ import terminé, comptages identiques`, puis `documents : 97 objet(s)`,
`avatars : 4 objet(s)`, et 49 comptes.

## 9. Recette fonctionnelle

Sur le domaine servi par la pile — `https://staging.<domaine>` en recette, `https://<domaine>`
quand la production est déployée directement sur l'apex : connexion avec un mot de passe
existant (les hachages bcrypt sont repris tels quels), OTP SMS, recherche de praticiens sur la
carte, affichage d'un avatar et d'une pièce justificative (vérifie MinIO de bout en bout),
prise de rendez-vous, message temps réel, notification push, et les écrans d'administration
(file KYC, finance, support). Le document 04 §4 demande la validation par un patient, un
praticien, un coach et un administrateur réels.

Notification push sur téléphone réel :
- `PUSH_PROVIDER=webpush` avec la paire de clés VAPID. Si les clés ne correspondent pas, l'API le
  journalise au démarrage (« Push désactivé ») et coupe le push au lieu d'échouer en silence.
- Sur le téléphone, ouvrir l'application installée (obligatoire sur iPhone), puis
  Notifications → Activer → « Envoyer une notification de test ». Le message affiché donne le
  résultat réel de l'envoi.
- Checklist complète : document 12, point 7.

Formulaire de contact (réception réelle) : après avoir défini `CONTACT_RECIPIENT_EMAIL` dans
`.env`, lancer `docker compose up -d api` (un simple restart ne recharge pas l'environnement),
puis `./contact-check.sh --via-site`. Le script :
- envoie un message test par Resend depuis `RESEND_FROM_EMAIL` ;
- suit son statut chez Resend jusqu'à « delivered », ou signale un rebond ;
- avec `--via-site`, soumet aussi le formulaire public, ce qui consomme une des 5 soumissions
  par heure de l'IP.

Il reste à confirmer la présence des deux messages dans la boîte, indésirables compris, et que
« Répondre » vise bien l'adresse du visiteur. `preflight.sh` contrôle déjà que la boîte de contact
n'est pas l'adresse d'envoi, et que le domaine expéditeur est vérifié chez Resend (contrôle
impossible avec une clé à accès restreint).

Le parcours de paiement se teste **en dernier**. Tant que `FEDAPAY_MODE=live`, il n'y a pas de
bac à sable : un paiement de bout en bout débite réellement. Passez donc l'ensemble des autres
points d'abord, puis configurez le webhook live (§11) et validez le paiement par une
transaction de montant minimal, remboursée ensuite depuis le tableau de bord FedaPay.

## 10. Déploiement continu par GitHub Actions

Le workflow `.github/workflows/deploy-vps.yml` se connecte en SSH, met le dépôt à jour,
reconstruit les images et vérifie `/api/health`.

Créez une clé dédiée au robot (depuis `<POSTE>`) :

```powershell
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\gha_domicares -N '""' -C "github-actions"
type $env:USERPROFILE\.ssh\gha_domicares.pub | ssh deploy@<IP_VPS> "cat >> ~/.ssh/authorized_keys"
```

Puis dans GitHub, **Settings → Secrets and variables → Actions → New repository secret** :

| Secret | Valeur |
|---|---|
| `VPS_HOST` | `<IP_VPS>` |
| `VPS_USERNAME` | `deploy` |
| `VPS_SSH_KEY` | contenu **complet** de `gha_domicares` (clé privée, en-têtes compris) |
| `VPS_SSH_PORT` | `22` |
| `VPS_APP_DIR` | `/home/deploy/domicares` |
| `DOMAIN_NAME` | le domaine servi (recette puis production) |

Déclenchement : onglet **Actions → Deploy VPS → Run workflow**, saisir `DEPLOYER`. Pour un
déploiement automatique à chaque `main`, décommentez le déclencheur `push` du workflow.

Mise à jour manuelle équivalente :

```bash
cd ~/domicares && git pull && cd deploy/vps && docker compose build web api worker && docker compose build postgres && docker compose up -d
```

## 11. Bascule en production

1. Dans `.env` : `DOMAIN=<domaine>`, `WWW_DOMAIN=www.<domaine>`, `FRONTEND_URL`, `CORS_ORIGINS`,
   `APP_BASE_URL`, `SITE_URL` alignés, `FEDAPAY_MODE=live` avec les clés live.
2. `docker compose build web && docker compose up -d` (le front embarque l'URL de l'API au build).
3. FedaPay : nouveau webhook vers `https://<domaine>/api/webhooks/fedapay`, reporter le
   `FEDAPAY_WEBHOOK_SECRET` dans `.env`, puis `docker compose up -d api`.
4. Gel des écritures côté Supabase, export final, `bascule.sh` (§8) pour reprendre le delta.
5. DNS : `A <domaine>` et `A www` → `<IP_VPS>` (TTL 300 s abaissé la veille).
6. Vérifier TLS, `/api/health`, une connexion patient, un paiement, la réception du webhook,
   un message temps réel, une notification push. Puis retirer la page de maintenance.

Retour arrière : remettre le DNS sur l'ancien hébergement et rebasculer le webhook FedaPay
sur `…/functions/v1/payment-webhook`. Aucune écriture n'a eu lieu côté natif pendant la
fenêtre, l'ancien système reste cohérent (document 04 §4).

## 12. Exploitation

| Besoin | Commande |
|---|---|
| Journaux | `docker compose logs -f api` (ou `web`, `worker`, `caddy`, `postgres`) |
| État | `docker compose ps` ; `curl -s https://<domaine>/api/health` |
| Sauvegardes | base + fichiers, quotidiennes dans `deploy/vps/backups/<horodatage>/` (service `backup`, §13) |
| État des sauvegardes | `docker compose ps backup` (healthy/unhealthy) ; `cat backups/last-status.json` |
| Exercice de restauration | `./restore-drill.sh` (isolé, mensuel, §13) |
| Accès psql | `docker compose exec postgres psql -U postgres -d domicares` |
| Redémarrage | `docker compose restart api worker` |
| Espace disque | `docker system prune -f` (images orphelines) |

### Dépannage courant

| Symptôme | Cause et correctif |
|---|---|
| Caddy boucle sur « obtaining certificate » | DNS non propagé, ou `WWW_DOMAIN` sans enregistrement A → `www.localhost` en recette |
| `api` redémarre en boucle | configuration refusée : `docker compose logs api` donne la variable fautive (`config.schema.ts`) |
| `{"message":"Cannot GET /health"...}` sur `https://<domaine>/api/health` | Caddy retirait le préfixe : `handle_path /api/*` doit être `handle /api/*`, l'API montant déjà ses routes sous `API_PREFIX` |
| Une modification du `Caddyfile` reste sans effet après `git pull` et `caddy reload` | ancienne pile montant le fichier seul : docker en attache l'inode, que `git pull` remplace. `docker compose exec caddy cat /etc/caddy/Caddyfile` montre l'ancien contenu ; `docker compose up -d --force-recreate caddy` débloque, le montage de répertoire supprime le problème |
| Champ `<input type="date">` vide, date décalée d'un jour, ou date affichée « Fri Sep 1 » | colonne `date` rendue en objet `Date` par node-postgres puis sérialisée en ISO complète : elle se convertit en `yyyy-MM-dd` à la frontière (`api/src/common/utils/date-only.ts`) |
| Page blanche après un bref affichage, sans erreur réseau | exception pendant le rendu : ouvrir la console du navigateur. Cas rencontré : `rating.toFixed is not a function`, une colonne `numeric` rendue en chaîne par node-postgres et non convertie à la frontière de l'API |
| 502 sur `/api/*` | `api` non démarré ou base injoignable : `docker compose ps`, `docker compose logs api` |
| Build `web` tué (code 137) | mémoire insuffisante : vérifier le swap, ou construire avec `NODE_OPTIONS=--max-old-space-size=2048` |
| `pg_restore: unsupported version` | client 16 utilisé : `PGBIN=/usr/lib/postgresql/17/bin` |
| `backups/... : Permission denied` au lancement de `bascule.sh` | docker a créé `deploy/vps/backups` en root au premier `up` : `sudo chown -R deploy:deploy ~/domicares/deploy/vps/backups` |
| `pull access denied for minio/minio` ou `quay.io/minio/…` : `unauthorized` | MinIO ne publie plus d'images accessibles anonymement (Docker Hub comme quay.io) : mettre le dépôt à jour, puis `docker compose build minio` (image compilée depuis la release épinglée, §6) |
| `set: pipefail: invalid option name` | script en CRLF (clone Windows) : `sed -i 's/\r$//' <script>`, et renormaliser le clone (§2) |
| `Conflicting values set for option Signed-By` | dépôt déclaré deux fois : `rm -f /etc/apt/sources.list.d/docker.list`, puis `apt-get update` |
| `ssh: Connection timed out` après l'installation | poste banni par `fail2ban` (essais ratés) : console du fournisseur, `fail2ban-client set sshd unbanip <IP>`, puis `ignoreip` dans `/etc/fail2ban/jail.local` |
| Connexion SSH refusée après `install-vps.sh` | mot de passe désactivé et clé non autorisée : console navigateur de l'hébergeur, puis réactiver `PasswordAuthentication` (§2) |
| `scp: stat local ... No such file or directory` | chemin relatif à la racine du dépôt : `cd` à la racine avant le `scp` |
| `preflight.sh` : « port 80/443 occupé » alors que seul Caddy écoute | `ss -p` ne montre le propriétaire qu'aux sockets de l'utilisateur courant : lancé en `deploy`, un service root apparaît anonyme. Le script interroge maintenant docker ; s'il reste un doute, `sudo ss -ltnp "sport = :80"` nomme le tenant |
| `git pull` refusé sur le VPS | clé de déploiement absente ou révoquée (§3) |

## 13. Sauvegardes et restauration

**Objectifs retenus.** RPO 24 h : une sauvegarde par jour (`BACKUP_INTERVAL_SECONDS`), donc au
plus une journée de données perdue. RTO 4 h : réinstallation du VPS (§1 à §6), récupération de
l'archive hors site, restauration vérifiée et recette. La durée réelle de restauration est
affichée par chaque exercice ; consignez-la et révisez l'objectif si elle dérive.

**Contenu.** Le service `backup` (`backup.sh`) produit chaque jour `backups/<horodatage>/` :
`postgres.dump` (pg_dump), `roles.sql` (rôles, sans mots de passe), `objects/<bucket>/…`
(trois buckets, quarantaine `_pending/` exclue), `objects.sha256`, `manifest.json` (version
applicative, empreinte du schéma, décomptes) et `SHA256SUMS`. Les objets sont copiés avant et
après le dump : tout fichier référencé par le dump est dans la sauvegarde. Rétention locale :
`BACKUP_KEEP_DAYS`. Chaque passage écrit `backups/last-status.json` ; un échec envoie une
alerte à `BACKUP_ALERT_URL`, et le service passe `unhealthy` après 26 h sans réussite.

**Copie hors site chiffrée (à configurer).** Sans elle, une perte du VPS emporte les sauvegardes.

```bash
age-keygen -o domicares-backup.key     # SUR VOTRE POSTE, pas sur le VPS
# Conserver domicares-backup.key hors du VPS (coffre-fort de mots de passe + copie hors ligne).
# Dans deploy/vps/.env :
BACKUP_AGE_RECIPIENT=age1…              # ligne « public key » affichée par age-keygen
BACKUP_OFFSITE_REMOTE=:s3,provider=Wasabi,access_key_id=…,secret_access_key=…,endpoint=s3.eu-central-1.wasabisys.com:domicares-backups
BACKUP_ALERT_URL=https://…              # webhook recevant {"text": "…"}
docker compose up -d backup             # recharge l'environnement (un restart ne suffit pas)
```

Chaque archive `domicares-<horodatage>.tar.age` est chiffrée pour cette clé publique : le VPS
ne peut pas la relire, seule la clé privée le peut. Rétention distante : `BACKUP_OFFSITE_KEEP_DAYS`.
Une valeur rclone contenant `,` ou `:` se met entre apostrophes dans la chaîne de connexion.
`preflight.sh` contrôle cette configuration et l'ancienneté de la dernière sauvegarde réussie.

**Exercice mensuel (isolé).** Restaure la dernière sauvegarde dans un PostgreSQL et un MinIO
jetables, sur un réseau docker interne, puis supprime tout. La production n'est pas touchée.

```bash
cd ~/domicares/deploy/vps && ./restore-drill.sh            # ou ./restore-drill.sh backups/<horodatage>
```

Contrôles : empreintes, `pg_restore --exit-on-error`, décomptes, objets restaurés, et chaque
chemin de stockage référencé en SQL (`files.file_path`, documents KYC, avatars, pièces jointes)
présent avec la même empreinte dans le S3 restauré. Une référence sans objet fait échouer
l'exercice : elle révèle un fichier perdu en production, à traiter. Pour tester la copie hors
site, téléchargez une archive, déchiffrez-la sur votre poste
(`age -d -i domicares-backup.key domicares-<h>.tar.age | tar -x`), copiez le dossier dans
`backups/` puis lancez l'exercice sur ce dossier.

**Restauration de production (sinistre).** Sur un VPS réinstallé (§1 à §6), sans trafic :

```bash
cd ~/domicares/deploy/vps
docker compose stop api worker backup
# 1. Récupérer la sauvegarde : archive hors site déchiffrée sur votre poste puis copiée dans backups/<horodatage>/
# 2. Base vide : l'initialisation d'un volume neuf charge le schéma, que restore-check.sh refuse d'écraser.
#    DESTRUCTIF — uniquement sur ce serveur réinstallé :
docker compose exec postgres sh -c 'dropdb -U postgres --force "$POSTGRES_DB" && createdb -U postgres "$POSTGRES_DB"'
# 3. Restauration vérifiée vers la base et le MinIO de ce serveur (buckets neufs, donc vides) ;
#    les identifiants sont ceux du service backup (lus dans le conteneur, pas sur l'hôte) :
docker compose run --rm --no-deps -v "$PWD/backups/<horodatage>:/restore:ro" --entrypoint sh backup -c \
  'RESTORE_S3_ENDPOINT="$S3_ENDPOINT" RESTORE_S3_ACCESS_KEY="$S3_ACCESS_KEY" RESTORE_S3_SECRET_KEY="$S3_SECRET_KEY" sh /restore-check.sh /restore'
# 4. Mots de passe : roles.sql n'en contient pas ; les rôles du cluster gardent ceux de l'installation.
#    Vérifier la connexion de l'API, puis redémarrer :
docker compose up -d
```

Puis la recette du §9. `restore-check.sh` refuse toute base contenant des tables et tout bucket
non vide : il ne peut pas écraser des données existantes par erreur.

