# 06 — Inventaire des projets Supabase (lot C, 7 septembre 2026)

Relevé fait par le connecteur Supabase après réactivation des deux projets (état initial :
`INACTIVE`, en pause depuis le 02/09/2026 ; état après restauration : `ACTIVE_HEALTHY`).
Toutes les mesures ci-dessous sont des agrégats : aucune donnée personnelle n'a été extraite.

## 1. Quel projet porte les données

| Projet | Ref | Région | PostgreSQL | Comptes | Praticiens | Fichiers | Dernière activité |
|---|---|---|---|---|---|---|---|
| **DOMICARESLIFE** | `jucqnqatncjcjlnhprsq` | eu-west-2 | 17.6 | **49** | **33** | **101** (94,6 Mo) | 07/07/2026 |
| Domicare | `mwkggpztzpykhggktyir` | eu-west-3 | 17.6 | 0 | 0 | 0 | aucune |

**Seul `jucqnqatncjcjlnhprsq` est à exporter.** `mwkggpztzpykhggktyir` ne contient que le schéma,
10 lignes de `system_config` et 3 comptes du ledger : il peut être supprimé après la bascule.

## 2. Contenu de DOMICARESLIFE

### 2.1 Volumétrie (base 18 Mo)

| Table | Lignes | | Table | Lignes |
|---|---|---|---|---|
| profiles | 49 | | practitioner_availability | 20 |
| practitioners | 33 | | otp_rate_limits | 11 |
| notifications | 65 | | otp_attempts | 10 |
| admin_audit_logs | 47 | | system_config | 11 |
| search_activity_logs | 29 | | addresses | 7 |
| emergency_contacts | 7 | | consents | 5 |
| medical_profiles | 5 | | files | 4 |
| practitioner_payment_info | 4 | | ledger_accounts | 3 |
| practitioner_balances | 2 | | practitioner_rates | 2 |
| push_subscriptions | 2 | | user_roles | 2 |
| notification_preferences | 1 | | triage_results | 1 |

Toutes les autres tables sont **vides**, en particulier `appointments`, `payments`, `messages`,
`group_sessions`, `reviews`, `support_tickets`, `disputes`, `saved_payment_methods`,
`webhook_events` : la plateforme n'a encore enregistré **aucun rendez-vous ni paiement**. La
migration porte donc sur les comptes, les praticiens (avec leurs documents KYC), quelques
profils patients et la configuration.

### 2.2 Comptes (`auth.users`)

| Mesure | Valeur |
|---|---|
| Comptes | 49, tous avec mot de passe bcrypt (`$2a$`), 37 e-mails confirmés, 1 téléphone |
| Identités | 49 `email`, 1 `phone` ; aucun fournisseur OAuth |
| Comptes de test `@test.com` | 4 |
| Comptes sans profil | 0 |
| Rôles admin | 2 `super_admin` |
| Créés entre | 24/01/2026 et 07/07/2026 |

Conséquence : l'import natif (`public.users` avec `password_hash` bcrypt) conserve toutes les
connexions existantes ; aucune réinitialisation de mot de passe n'est nécessaire.

### 2.3 Praticiens

| Statut KYC | Nombre | | Type | Nombre |
|---|---|---|---|---|
| approved | 25 | | nutritionniste | 12 |
| pending | 6 | | kinesitherapeute | 10 |
| rejected | 2 | | medecin | 4 |
| | | | coach_sportif | 4 |
| | | | infirmier | 1 |
| | | | autre | 2 |

Les 33 praticiens ont des coordonnées GPS (carte de recherche et affectation automatique
opérationnelles dès l'import).

### 2.4 Fichiers (Storage)

| Bucket | Public | Objets | Taille | Contenu |
|---|---|---|---|---|
| documents | non | 97 | 94,2 Mo | `<uuid>/<horodatage>-{idDocument,licenseDocument,diploma,profilePhoto}_<horodatage>.{pdf,jpg,png}` |
| avatars | oui | 4 | 0,4 Mo | `<uuid>/<horodatage>-<nom>.jpeg` |
| message-attachments | non | 0 | 0 | — |

Toutes les colonnes de référence (`practitioners.id_document_url`, `license_document_url`,
`insurance_document_url`, `image`, `profiles.avatar_url`, `files.file_path`) contiennent des
**chemins Storage, jamais d'URL** (ni Supabase, ni Wasabi). La migration des fichiers consiste
donc à recopier les objets vers MinIO en conservant bucket et clé (`export-storage.mjs` puis
ré-upload) ; l'API (`GET /api/files/url`) résout ces chemins tels quels.

### 2.5 Configuration (`system_config`, 11 clés)

`fedapay_mode` = **`live`**, `commission_rate` 15 % (par défaut), `payment_commission_rate` 5 %,
`payment_fees` 2,9 %, `payment_gateway_fees` 2 % à la charge de la plateforme,
`payment_hold_period_days` 2, `payout_frequency` hebdomadaire (lundi), `payout_minimum_threshold`
5 000 XOF, `surcharges` (nuit 25 %, week-end 20 %, férié 30 %), `triage_thresholds`,
`payment_rounding_mode`. Ces valeurs sont reprises telles quelles par l'import (table de données).
`FEDAPAY_MODE=live` côté API devra être aligné avec ce choix au moment de la bascule.

### 2.6 Schéma réel vs schéma natif

| Objet | Production | `schema.native.sql` | Écart |
|---|---|---|---|
| Tables | 55 | 58 | +3 natives voulues : `users`, `refresh_tokens`, `auth_tokens` |
| Vues | 5 | 5 | aucune |
| Fonctions `public` | 43 | 46 | +3 natives voulues : `current_user_id`, `current_user_role`, `notify_table_change` |
| Triggers `public` | 12 | 24 | +12 natifs voulus : 10 `notify_*`, `on_user_created`, `set_users_updated_at` |
| Policies RLS | **219** | 155 (`120_drop_rls_optional.sql`) | 64 policies créées hors migrations versionnées ; sans effet en cible (RLS retirée, autorisation par l'API) |
| Extensions | pgcrypto, uuid-ossp, pg_stat_statements, supabase_vault | pgcrypto, uuid-ossp | `pg_cron` **non installé** : confirme l'absence d'ordonnancement historique |
| Edge Functions déployées | 51 (dont `export-database`, `import-database`) | — | identiques au dossier `supabase/functions` |

Le `diff` colonne par colonne se fait sur `schema_public.sql` produit par l'export (§5 du document 02).

## 3. Export : ce qu'il reste à faire

Le connecteur Supabase ne donne ni le mot de passe de la base ni la clé `service_role` : l'export
`pg_dump` et le téléchargement des fichiers doivent être lancés avec ces accès (dashboard →
*Project Settings → Database* et *→ API*), depuis un poste ou le VPS, avec un client
PostgreSQL 17 :

```bash
export PATH=/usr/lib/postgresql/17/bin:$PATH          # pg_dump 17 (serveur 17.6)
export SUPABASE_DB_URL='postgresql://postgres:<MDP>@db.jucqnqatncjcjlnhprsq.supabase.co:5432/postgres'
export SUPABASE_URL='https://jucqnqatncjcjlnhprsq.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='<service_role>'
npm ci && scripts/supabase/export-supabase.sh          # → export/<horodatage>/
```

Contrôles attendus sur `rowcounts.csv` : les valeurs de §2.1 (49 profils, 33 praticiens,
65 notifications…), `auth.users` = 49, 101 objets Storage (97 + 4). Puis répétition de l'import
natif (`scripts/db/import-native.sh`) et ré-upload des fichiers vers MinIO avec les mêmes clés.

Secrets à relever dans le dashboard (*Edge Functions → Secrets*, valeurs à reprendre chez les
fournisseurs, §6 du document 02) : `PHONE_ENCRYPTION_KEY` n'est pas critique ici
(`saved_payment_methods` est vide), mais FedaPay **live**, Twilio, Resend, Mapbox et VAPID le sont.

## 4. Points d'attention

- Les projets réactivés sont **remis en pause automatiquement après 7 jours** sans activité sur
  le plan gratuit : faire l'export dans la semaine, ou relancer la restauration avant.
- Volume faible (18 Mo + 95 Mo de fichiers) : export et import se font en quelques minutes ;
  la répétition générale sur le VPS peut être programmée immédiatement après l'export.
- `fedapay_mode = live` en base alors qu'aucun paiement n'existe : vérifier avec FedaPay que le
  compte live est bien actif avant la bascule, et enregistrer la nouvelle URL de webhook.
