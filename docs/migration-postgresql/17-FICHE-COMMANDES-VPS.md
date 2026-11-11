# 17 — Fiche de commandes VPS — 11 novembre 2026

Fiche d'exécution des tâches 1 à 10 du document 16 §6, dans l'ordre de priorité. Chaque étape
indique **où** la lancer, la commande, le **résultat attendu** et quoi consigner. Les procédures de
référence restent celles des documents 07 (§13, §14), 09 et 16 ; cette fiche ne les remplace pas.

Conventions :

- **[poste]** : votre ordinateur. **[VPS prod]** : `ssh` en `deploy`, puis
  `cd ~/domicares/deploy/vps`. **[VPS recette]** : `cd ~/domicares-recette/deploy/vps`.
  **[navigateur]** : tableau de bord d'un prestataire ou GitHub.
- Ne jamais coller une clé, un mot de passe ou le contenu d'un `.env` dans un ticket, une PR ou
  une conversation. Consigner seulement les résultats (OK, durée, nom d'archive).
- Avant toute modification d'un `.env` : copie horodatée (étape 0).
- Après toute modification d'un `.env` : `docker compose up -d <service>` (un `restart` ne relit
  pas `.env`).

## 0. Préparation (à chaque session)

```bash
ssh -p <PORT_SSH> deploy@<IP_DU_VPS>
```

```bash
cd ~/domicares/deploy/vps && git log --oneline -1 && docker compose ps
```

```bash
cp .env ".env.bak-$(date -u +%Y%m%dT%H%M%SZ)" && chmod 600 .env .env.bak-*
```

Attendu : le `git log` donne le SHA de production (dernier consigné : `4bd6d71`) ; les conteneurs
`vps-*` sont `running` (`postgres`, `backup` : `healthy`). Consigner le SHA lu.

## 1. Incident FedaPay du 26/10 (priorité 1)

**[VPS prod]** une seule ligne de mode, et mode vu par le conteneur :

```bash
grep -c '^FEDAPAY_MODE=' .env
```

```bash
./fedapay-mode.sh status
```

```bash
curl -s https://domicares.life/api/payments/config
```

Attendu : `1` ; `status` → `sandbox` ; la réponse JSON contient `"environment":"sandbox"`. Si le
décompte vaut plus de 1, garder la seule ligne `FEDAPAY_MODE=sandbox` (`nano .env`), puis
`./fedapay-mode.sh sandbox`.

**[navigateur]** tableau de bord FedaPay **live** → Transactions, filtre du **26/10/2026,
18:10 à 18:25 UTC** (19:10 à 19:25 à Cotonou). Attendu : aucune transaction. S'il y en a une :
la noter (référence, montant, statut) et prévenir avant tout remboursement.

À consigner (document 10 §7, « Incident du 26/10 ») : décompte, mode, résultat du contrôle live.

## 2. Copie hors site chiffrée sur Cloudflare R2 (priorité 1)

### 2.1 Clé de chiffrement — [poste], jamais sur le VPS

```bash
age --version || sudo apt install age    # macOS : brew install age
```

```bash
age-keygen -o domicares-backup.key
```

La commande affiche `Public key: age1…` : c'est `BACKUP_AGE_RECIPIENT`. Ranger
`domicares-backup.key` dans le coffre-fort de mots de passe **et** sur une copie hors ligne :
sans elle, aucune archive hors site n'est relisible.

### 2.2 Bucket et jeton — [navigateur] Cloudflare

1. R2 Object Storage → *Create bucket* → `domicares-backups` (juridiction UE si proposée).
2. Relever l'**Account ID** (page R2, colonne de droite).
3. *Manage R2 API Tokens* → *Create API token* → **Object Read & Write**, limité au bucket
   `domicares-backups`. Relever *Access Key ID* et *Secret Access Key* (affichées une seule fois).

### 2.3 Configuration — [VPS prod]

```bash
nano .env
```

Renseigner les lignes existantes (ne pas les dupliquer) :

```
BACKUP_AGE_RECIPIENT=age1…
BACKUP_OFFSITE_REMOTE=:s3,provider=Cloudflare,access_key_id=<ACCESS_KEY_ID>,secret_access_key=<SECRET>,endpoint=<ACCOUNT_ID>.r2.cloudflarestorage.com,no_check_bucket=true:domicares-backups
BACKUP_ALERT_URL=<même webhook Discord que SUPERVISION_ALERT_URL>
```

Contrôler l'absence de doublon, puis recharger le service (le redémarrage lance aussitôt une
sauvegarde, puis une par jour) :

```bash
grep -c -E '^(BACKUP_AGE_RECIPIENT|BACKUP_OFFSITE_REMOTE|BACKUP_ALERT_URL)=' .env
```

```bash
docker compose up -d backup && docker compose logs -f backup
```

Attendu : `3`, puis dans les journaux une sauvegarde complète sans erreur (quitter par Ctrl+C).
Durée : quelques minutes selon le volume des fichiers.

### 2.4 Vérification — [VPS prod]

```bash
cat backups/last-status.json
```

```bash
docker compose exec backup sh -c 'rclone --config /dev/null lsl "$BACKUP_OFFSITE_REMOTE"'
```

```bash
./preflight.sh
```

Attendu : `"status":"success"` ; une ligne `domicares-<horodatage>.tar.age` de taille non nulle ;
`preflight.sh` sans KO sur la sauvegarde.

### 2.5 Déchiffrement d'essai — copie de l'archive vers le poste

**[VPS prod]** rapatrier l'archive dans `backups/` (remplacer `<NOM>` par le nom listé) :

```bash
docker compose exec backup sh -c 'rclone --config /dev/null copyto "$BACKUP_OFFSITE_REMOTE/<NOM>" "/backups/<NOM>"'
```

**[poste]** :

```bash
scp -P <PORT_SSH> deploy@<IP_DU_VPS>:domicares/deploy/vps/backups/<NOM> .
```

```bash
age -d -i domicares-backup.key -o verif.tar <NOM> && tar -tf verif.tar | head
```

Attendu : la liste commence par `<horodatage>/` et contient `postgres.dump`, `manifest.json`,
`SHA256SUMS`, `objects/`. Puis supprimer les copies (données de santé) :

```bash
rm -f verif.tar <NOM>
```

**[VPS prod]** :

```bash
rm -f backups/<NOM>
```

À consigner (document 10 §8) : date, nom de l'archive, taille, « déchiffrement OK ».

## 3. Exercice de restauration isolé (priorité 1)

**[VPS prod]**, de préférence en heure creuse (charge processeur et disque pendant l'exercice ;
la production n'est pas touchée : base et MinIO jetables sur un réseau interne).

```bash
df -h / && du -sh "$(ls -1d backups/20*Z | sort | tail -1)"
```

Attendu : espace libre supérieur à **trois fois** la taille de la sauvegarde.

```bash
./restore-drill.sh
```

Attendu : empreintes, `pg_restore`, décomptes et références SQL → objets tous OK ; la durée est
affichée en fin d'exercice. Toute référence sans objet fait échouer l'exercice : la noter, elle
révèle un fichier manquant en production.

À consigner (document 10 §8 et document 07 §13) : date, sauvegarde utilisée, durée, résultat,
comparaison au RTO de 4 h (la durée affichée exclut le transfert hors site et la réinstallation).

Variante complète (une fois) : restaurer depuis l'archive hors site déchiffrée. Sur le poste,
`age -d -i domicares-backup.key <NOM> | tar -x`, copier le dossier `<horodatage>/` dans
`~/domicares/deploy/vps/backups/` sous un nom distinct (ex. `offsite-<horodatage>`), puis
`./restore-drill.sh backups/offsite-<horodatage>` et le supprimer après l'exercice.

## 4. Essai d'alerte de la supervision (priorité 1)

**[VPS prod]**, en heure creuse : arrêter le worker suspend les tâches de fond (synchronisation
des paiements, rappels) pendant l'essai, quelques minutes.

```bash
docker compose stop worker && ./supervision.sh interne --alerte
```

Attendu : ligne `KO` sur le conteneur `worker`, et un message d'alerte sur Discord.

```bash
docker compose start worker && sleep 20 && ./supervision.sh interne --alerte
```

Attendu : tout `OK`, et le message « supervision rétablie » sur Discord. Vérifier aussi que le
cron tourne :

```bash
crontab -l | grep supervision && tail -n 5 ~/supervision.log
```

À consigner (document 10 §8) : heure de l'alerte et du rétablissement reçus.

## 5. Droits des sauvegardes de la recette (priorité 1)

**[VPS recette]** :

```bash
ls -ld backups backups/.app-version 2>/dev/null
```

```bash
sudo chown deploy:deploy backups && { [ ! -e backups/.app-version ] || sudo chown deploy:deploy backups/.app-version; }
```

```bash
git rev-parse HEAD > backups/.app-version && cat backups/.app-version
```

Attendu : le SHA de la recette s'affiche ; le prochain déploiement de recette n'affiche plus
« version de sauvegarde non inscrite ».

## 6. Approbation obligatoire de la production (priorité 2)

**[navigateur]** GitHub → Settings → Environments → `production` → **Required reviewers** :
ajouter au moins une personne de l'équipe → *Save protection rules*. Vérifier dans
Settings → Secrets and variables → Actions → *Variables* que `RECETTE_AUTO` vaut `true`.

## 7. Webhook FedaPay sandbox vers la recette (priorité 2)

**[navigateur]** FedaPay **sandbox** → Webhooks → n° 1471 :

1. URL : `https://staging.domicares.life/api/webhooks/fedapay`.
2. Décocher « Désactiver le Webhook lorsque l'application génère des erreurs ».
3. Réactiver le webhook s'il est désactivé, puis révéler et copier son secret.

**[VPS recette]** : vérifier d'abord que la recette est bien en sandbox, puis renseigner le
secret dans les **deux** variables (`fedapay-mode.sh sandbox` recopie la seconde dans la première) :

```bash
./fedapay-mode.sh status
```

```bash
cp .env ".env.bak-$(date -u +%Y%m%dT%H%M%SZ)" && nano .env
```

```
FEDAPAY_WEBHOOK_SECRET=<secret du webhook 1471>
FEDAPAY_SANDBOX_WEBHOOK_SECRET=<même secret>
```

```bash
docker compose up -d api && ./fedapay-mode.sh status
```

Contrôle : FedaPay sandbox → journal du webhook → **renvoyer** un événement récent. Attendu :
réponse **200** dans le journal FedaPay, et l'événement visible côté recette :

```bash
./fedapay-observe.sh 5
```

Ne pas mettre ce secret dans le `.env` de production : la production reste sans webhook sandbox
jusqu'au passage en live (document 16 §2.4 et §5.2).

## 8. Recette fonctionnelle (priorité 2)

Depuis un poste autorisé (le proxy de l'environnement de développement refuse `staging`).

**[poste]** contrôles techniques :

```bash
curl -s https://staging.domicares.life/api/health
```

```bash
curl -s https://staging.domicares.life/api/payments/config
```

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://staging.domicares.life/
```

Attendu : `"status":"ok"` et `"database":"ok"` ; `"environment":"sandbox"` ; `401` (site protégé).

**[navigateur]** `https://staging.domicares.life` (identifiants du `basic_auth`), comptes de
recette par rôle, grille du document 16 §4. Paiement sandbox depuis l'interface (après fusion de
[malcomx2022/spark-of-creativity-09#140](https://github.com/malcomx2022/spark-of-creativity-09/pull/140)
et son déploiement en recette) :

| Cas | Numéro saisi | Attendu |
|---|---|---|
| Paiement approuvé MTN | `0166000001` (champ après `+229`) | paiement `paid`, rendez-vous confirmé |
| Paiement approuvé Moov | `0164000001` | paiement `paid` |
| Paiement refusé | `66000000` | paiement `failed`, rendez-vous de nouveau payable |
| Webhook (S13) | — | livraison 200 dans le journal FedaPay, `./fedapay-observe.sh` sur la recette |

**[VPS recette]** contact :

```bash
./contact-check.sh --via-site
```

Consigner chaque bloc du document 16 §4 : `ok`, `ko` (avec l'écart) ou `non joué`.

## 9. Validations sur appareils réels (priorité 2)

iPhone (Safari, puis application installée depuis « Partager → Sur l'écran d'accueil ») :
connexion, notification push de test (bouton dans Notifications), ouverture de la page notifiée,
mode avion puis retour. Checklist et preuves attendues : document 12 et document 15 §16.

## 10. Déploiement de production du SHA validé (priorité 2)

Prérequis : étapes 6 et 8 faites ; SHA validé en recette (au moins `992c397`, ou le commit de
fusion de #140 une fois déployé et recetté).

**[navigateur]** GitHub → Actions → *Deploy VPS* → *Run workflow* depuis `main` :
`confirm` = `DEPLOYER`, `revision` = SHA complet validé, `cible` = `production`,
`sans_recette` décoché. Approuver le déploiement quand GitHub le demande.

Contrôles du run : job `validation-recette` `success` ; conteneurs recréés nommés `vps-*` (et non
`domicares-recette-*`) ; santé 200.

**[VPS prod]** :

```bash
git log --oneline -1 && docker compose ps && ./fedapay-mode.sh status
```

```bash
docker compose logs --since 15m api worker | grep -iE 'error|exception' | tail -n 20
```

**[poste]** :

```bash
curl -s https://domicares.life/api/health && curl -s https://domicares.life/api/payments/config
```

Attendu : SHA déployé ; `ok` ; `sandbox` ; pas d'erreur nouvelle dans les journaux. Puis une
connexion réelle et l'ouverture d'un écran par rôle (`/api/health` seul ne valide pas les
parcours). Retour arrière : relancer le workflow avec le SHA précédent (document 10 §6).

## Après la fiche

Consigner les résultats dans le document 10 §8 (exploitation) et le document 16 §6 (tâches 1 à
10), avec date et résultat réel ; ne marquer « fait » que ce qui a été exécuté et constaté.
Restent ensuite les tâches 11 à 14 du document 16 §6 (rotation des clés, support FedaPay,
Academy, paiements réels).
