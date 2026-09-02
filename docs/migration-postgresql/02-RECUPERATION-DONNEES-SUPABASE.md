# 02 — Récupération complète des données depuis Supabase

Objectif : obtenir une copie **intégrale, vérifiable et restaurable** de tout ce que Supabase
héberge pour Domicares : schéma réel, données, comptes utilisateurs (avec leurs mots de passe),
fichiers, configuration et secrets. Outils : `scripts/supabase/export-supabase.sh`,
`scripts/supabase/export-storage.mjs`.

## 1. Avant tout : réactiver le projet (état au 02/09/2026 : *paused*)

1. Dashboard Supabase → projet **DOMICARESLIFE** (`jucqnqatncjcjlnhprsq`) → *Restore project*.
   La restauration prend quelques minutes. Si le bouton est absent, ouvrir un ticket support
   Supabase avec le ref du projet : les données d'un projet en pause sont conservées un temps
   limité (90 jours pour le plan gratuit) puis le projet est supprimé.
2. Faire de même avec `mwkggpztzpykhggktyir` (Domicare) si un doute subsiste sur celui qui
   contient les données réelles (comparer les `rowcounts.csv` des deux exports).
3. Vérifier lequel est en production : `VITE_SUPABASE_PROJECT_ID` du `.env` du build déployé
   (chez Lovable : *Project settings → Cloud*) ; dans le dépôt, `.env` et `supabase/config.toml`
   pointent tous deux vers `jucqnqatncjcjlnhprsq`.
4. Pendant la restauration, télécharger aussi la sauvegarde quotidienne Supabase si elle est
   proposée (*Database → Backups*) : c'est une copie de sûreté indépendante du script.

## 2. Récupérer les accès

| Besoin | Où le trouver |
|---|---|
| Mot de passe base + URL directe | *Project Settings → Database → Connection string* (mode **Session** ou **Direct**, port 5432 ; **pas** le pooler transaction 6543 qui refuse `pg_dump`) |
| `SUPABASE_SERVICE_ROLE_KEY` | *Project Settings → API* (clé `service_role`, jamais côté client) |
| Liste des secrets Edge Functions | `supabase secrets list --project-ref jucqnqatncjcjlnhprsq` ou *Edge Functions → Secrets*. **Les valeurs ne sont pas relisibles** : les récupérer chez chaque fournisseur (voir §6) |
| Config Auth (templates e-mail, URL de redirection, providers) | *Authentication → Providers / Email templates / URL configuration* — exporter en captures/markdown |
| Webhook FedaPay | Dashboard FedaPay → Webhooks : noter l'URL actuelle (`…/functions/v1/payment-webhook`) et le secret |

Installer un client de **même version majeure** que le serveur (PostgreSQL 17) :
`apt install postgresql-client-17` (ou `brew install postgresql@17`). Un `pg_dump` 16 refuse un
serveur 17.

## 3. Geler les écritures (pour l'export final uniquement)

Pour l'export de répétition, inutile. Pour la bascule finale :
- publier une page de maintenance côté Lovable, ou
- révoquer temporairement les policies d'écriture : `psql "$SUPABASE_DB_URL" -c "ALTER ROLE authenticated NOINHERIT"` n'est pas possible sur Supabase managé ; le plus sûr est de
  **désactiver le domaine / mettre l'app en lecture seule** via `system_config` si l'app le gère,
  sinon couper les Edge Functions de paiement (`supabase functions delete create-payment` est
  destructif : préférer la page de maintenance).

## 4. Exporter

```bash
export SUPABASE_DB_URL='postgresql://postgres:<MDP>@db.jucqnqatncjcjlnhprsq.supabase.co:5432/postgres'
export SUPABASE_URL='https://jucqnqatncjcjlnhprsq.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='<service_role>'
npm ci                      # fournit @supabase/supabase-js pour export-storage.mjs
scripts/supabase/export-supabase.sh
```

Résultat dans `export/<horodatage>/` :

| Fichier | Contenu | Usage |
|---|---|---|
| `schema_public.sql` | Schéma **réel** de production | `diff` avec `db/native/schema.native.sql` pour détecter les objets créés hors migrations |
| `data_public.dump` | Toutes les tables `public` (format custom) | `pg_restore --data-only` par `import-native.sh` |
| `data_auth.dump` | `auth.users` + `auth.identities` : e-mail, téléphone, **`encrypted_password` (bcrypt)**, `raw_user_meta_data` (dont `pending_onboarding`), dates de confirmation | Devient `public.users` ; **les mots de passe restent valides** (bcrypt vérifiable par `crypt()`/`bcrypt` Node) |
| `data_storage_meta.dump` | `storage.buckets`, `storage.objects` | Liste de contrôle des fichiers |
| `storage/<bucket>/…` + `manifest.json` | Fichiers des buckets `documents`, `avatars`, `message-attachments` | Ré-upload S3 (MinIO/Wasabi) |
| `rowcounts.csv` | Nombre de lignes par table | Contrôle automatique après import |
| `SHA256SUMS` | Empreintes | Intégrité des copies |

Le dossier `export/` est ignoré par git (données de santé et personnelles) : le stocker chiffré
(`age`/`gpg`) sur un support hors ligne + une copie hors site.

## 5. Vérifier l'export

```bash
pg_restore -l export/<h>/data_public.dump | grep -c "TABLE DATA"     # ≈ 55 tables
pg_restore -l export/<h>/data_auth.dump                               # users, identities
cat export/<h>/rowcounts.csv
diff <(grep -E "^CREATE (TABLE|VIEW|FUNCTION)" export/<h>/schema_public.sql | sort) \
     <(grep -E "^CREATE (TABLE|VIEW|FUNCTION)" db/native/schema.native.sql | sort)
```

Toute table/colonne/policy présente dans `schema_public.sql` et absente des migrations doit être
ajoutée comme migration dans `supabase/migrations/` (puis `scripts/db/build-native-schema.sh`)
**avant** l'import, sinon `pg_restore` la signalera en erreur.

Répétition à blanc de l'import (obligatoire avant la bascule) :

```bash
PGHOST=localhost PGUSER=postgres PGPASSWORD=… DROP_RLS=1 \
  scripts/db/import-native.sh export/<h> domicares_test
```

Le script termine par le tableau « source vs cible » ligne par ligne.

## 6. Inventaire des secrets à re-provisionner (valeurs à reprendre chez les fournisseurs)

| Groupe | Clés | Source de la valeur |
|---|---|---|
| FedaPay | `FEDAPAY_MODE`, `FEDAPAY_PUBLIC_KEY`, `FEDAPAY_SECRET_KEY`, `FEDAPAY_WEBHOOK_SECRET`, `PLATFORM_WALLET_ID` | Dashboard FedaPay (sandbox et live). Le secret webhook sera **régénéré** lors du changement d'URL |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_PHONE_NUMBER`, `TWILIO_FROM_NUMBER`, `TWILIO_MESSAGING_SERVICE_SID` | Console Twilio |
| E-mail | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NOTIFICATION_EMAIL_FROM` (`MAILJET_API_KEY`, `MAILERSEND_API_KEY`, `MAIL_FROM_EMAIL` : variantes non utilisées en prod à confirmer) | Resend ; DNS SPF/DKIM du domaine |
| Push | `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_EMAIL` | Secrets Supabase ; si perdus, **regénérer une paire VAPID** ⇒ les abonnements push existants (`push_subscriptions`) deviennent invalides et doivent être recréés côté client |
| Chiffrement | `PHONE_ENCRYPTION_KEY` (fonction `secure-phone`) | Secret Supabase : **indispensable** pour déchiffrer les numéros déjà chiffrés ; si perdu, les données chiffrées sont irrécupérables |
| Cartes | `MAPBOX_TOKEN` / `VITE_MAPBOX_TOKEN` | Compte Mapbox |
| URLs | `APP_BASE_URL`, `SITE_URL`, `FRONTEND_URL` | Nouveau domaine |
| Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | **Disparaissent** dans la cible native |

## 7. Comptes utilisateurs : ce qui est migré et ce qui ne l'est pas

| Donnée | Migrée ? | Remarque |
|---|---|---|
| id, e-mail, téléphone | oui | même UUID ⇒ toutes les FK restent valides |
| mot de passe | **oui** (hash bcrypt `$2a$…`) | vérifiable avec `bcrypt.compare()` ; pas de réinitialisation forcée |
| e-mail / téléphone confirmés | oui | `email_verified_at`, `phone_verified_at` |
| metadata (`full_name`, `phone`, `pending_onboarding`) | oui | `public.users.raw_user_meta_data` ; utilisé par `handle_new_user_safe` et par `src/lib/registration-recovery.ts` |
| sessions / refresh tokens Supabase | non | tout le monde se reconnecte une fois après la bascule |
| OTP en cours | non | tables `otp_attempts` conservées mais l'OTP est régénéré |
| Comptes OAuth (`auth.identities`) | à vérifier | aucun provider OAuth n'est utilisé par le front (email/password + OTP seulement) |

## 8. Conformité

Les données exportées sont des **données de santé** (`medical_profiles`, `care_notes`,
`consultation_reports`, `triage_results`) et bancaires (`practitioner_payment_info`,
`saved_payment_methods`). Chiffrer les exports, limiter l'accès, journaliser qui a manipulé
la copie, détruire les copies intermédiaires après validation de la bascule, et tenir un
registre de traitement (RGPD / loi béninoise n° 2017-20 sur le numérique).
