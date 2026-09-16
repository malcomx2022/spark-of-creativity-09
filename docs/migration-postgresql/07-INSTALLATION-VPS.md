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
docker compose up -d postgres minio          # la base se crée avec 010_roles + schema.native.sql
docker compose logs -f postgres              # attendre « database system is ready », puis Ctrl-C
docker compose build web api worker          # 5 à 10 min la première fois
docker compose up -d
docker compose ps
```

Les buckets S3 sont créés automatiquement par `bascule.sh` (§8). Pour les créer sans
importer de données :

```bash
NET=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$(docker compose ps -q minio)")
docker run --rm --network "$NET" --env-file .env --entrypoint sh minio/mc -c \
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

## 8. Importer les données réelles

Depuis `<POSTE>`, envoyez l'export contrôlé (base + fichiers Storage) :

```powershell
scp -r export\20260909T001732Z deploy@<IP_VPS>:~/export/
```

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

Sur `https://staging.<domaine>` : connexion avec un mot de passe existant (les hachages
bcrypt sont repris tels quels), OTP SMS, recherche de praticiens sur la carte, prise de
rendez-vous, paiement en sandbox de bout en bout, message temps réel, notification push,
et les écrans d'administration (file KYC, finance, support). Le document 04 §4 demande la
validation par un patient, un praticien, un coach et un administrateur réels.

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
cd ~/domicares && git pull && cd deploy/vps && docker compose build web api worker && docker compose up -d
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
| Sauvegardes | quotidiennes dans `deploy/vps/backups/` (service `backup`, rétention 14 jours) |
| Copie hors site | `rclone copy ~/domicares/deploy/vps/backups s3:domicares-backups` en cron |
| Restauration | `pg_restore -d domicares -c backups/domicares-<h>.dump` |
| Accès psql | `docker compose exec postgres psql -U postgres -d domicares` |
| Redémarrage | `docker compose restart api worker` |
| Espace disque | `docker system prune -f` (images orphelines) |

### Dépannage courant

| Symptôme | Cause et correctif |
|---|---|
| Caddy boucle sur « obtaining certificate » | DNS non propagé, ou `WWW_DOMAIN` sans enregistrement A → `www.localhost` en recette |
| `api` redémarre en boucle | configuration refusée : `docker compose logs api` donne la variable fautive (`config.schema.ts`) |
| 502 sur `/api/*` | `api` non démarré ou base injoignable : `docker compose ps`, `docker compose logs api` |
| Build `web` tué (code 137) | mémoire insuffisante : vérifier le swap, ou construire avec `NODE_OPTIONS=--max-old-space-size=2048` |
| `pg_restore: unsupported version` | client 16 utilisé : `PGBIN=/usr/lib/postgresql/17/bin` |
| `set: pipefail: invalid option name` | script en CRLF (clone Windows) : `sed -i 's/\r$//' <script>`, et renormaliser le clone (§2) |
| `Conflicting values set for option Signed-By` | dépôt déclaré deux fois : `rm -f /etc/apt/sources.list.d/docker.list`, puis `apt-get update` |
| Connexion SSH refusée après `install-vps.sh` | mot de passe désactivé et clé non autorisée : console navigateur de l'hébergeur, puis réactiver `PasswordAuthentication` (§2) |
| `scp: stat local ... No such file or directory` | chemin relatif à la racine du dépôt : `cd` à la racine avant le `scp` |
| `git pull` refusé sur le VPS | clé de déploiement absente ou révoquée (§3) |
