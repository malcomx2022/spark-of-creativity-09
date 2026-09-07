#!/usr/bin/env bash
# =============================================================================
# check-export.sh — Contrôle d'un export Supabase avant import natif
#
# Usage : [PGBIN=/usr/lib/postgresql/17/bin] scripts/supabase/check-export.sh export/<horodatage>
#
# Vérifie : fichiers attendus, lisibilité des archives (pg_restore de même version majeure que le
# pg_dump source), contenu de data_auth.dump, comptages (rowcounts.csv) comparés à l'inventaire
# du 07/09/2026 (docs/migration-postgresql/06-INVENTAIRE-SUPABASE.md), fichiers Storage
# (manifest.json vs disque), empreintes SHA256, écart de tables avec db/native/schema.native.sql.
# Sortie : ✔ conforme, ⚠ à examiner (avertissement), ✖ bloquant (code de retour 1).
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EXPORT="${1:?dossier export requis}"
if [[ -n "${PGBIN:-}" ]]; then export PATH="$PGBIN:$PATH"; fi
errors=0; warnings=0
ok()   { echo "  ✔ $*"; }
warn() { echo "  ⚠ $*"; warnings=$((warnings + 1)); }
ko()   { echo "  ✖ $*"; errors=$((errors + 1)); }

echo "▶ 1. Fichiers attendus dans $EXPORT"
for f in schema_public.sql data_public.dump data_auth.dump data_storage_meta.dump rowcounts.csv; do
  if [[ -s "$EXPORT/$f" ]]; then ok "$f ($(du -h "$EXPORT/$f" | cut -f1))"; else ko "$f manquant ou vide"; fi
done
[[ -f "$EXPORT/server_version.txt" ]] && echo "  serveur : $(head -c 60 "$EXPORT/server_version.txt")"
[[ -f "$EXPORT/client_version.txt" ]] && echo "  client d'export : $(cat "$EXPORT/client_version.txt")"

echo "▶ 2. Archives lisibles ($(pg_restore --version))"
if listing=$(pg_restore --list "$EXPORT/data_public.dump" 2>&1); then
  n=$(grep -c "TABLE DATA" <<<"$listing"); ok "data_public.dump : $n tables avec données"
  [[ "$n" -ge 40 ]] || warn "moins de 40 tables avec données dans data_public.dump (attendu ≈ 55)"
else
  ko "data_public.dump illisible : $(head -1 <<<"$listing") (installer postgresql-client-17, PGBIN=/usr/lib/postgresql/17/bin)"
fi
if listing=$(pg_restore --list "$EXPORT/data_auth.dump" 2>&1); then
  grep -q "TABLE DATA.* users " <<<"$listing" && ok "data_auth.dump contient auth.users" || ko "data_auth.dump sans table users"
  grep -q "TABLE DATA.* identities " <<<"$listing" && ok "data_auth.dump contient auth.identities" || warn "data_auth.dump sans table identities"
else
  ko "data_auth.dump illisible : $(head -1 <<<"$listing")"
fi

echo "▶ 3. Comptages (rowcounts.csv) vs inventaire du 07/09/2026"
declare -A expected=(
  [auth.users]=49 [storage.objects]=101 [public.profiles]=49 [public.practitioners]=33 [public.notifications]=65
  [public.admin_audit_logs]=47 [public.search_activity_logs]=29 [public.practitioner_availability]=20
  [public.otp_rate_limits]=11 [public.system_config]=11 [public.otp_attempts]=10 [public.addresses]=7
  [public.emergency_contacts]=7 [public.consents]=5 [public.medical_profiles]=5 [public.files]=4
  [public.practitioner_payment_info]=4 [public.ledger_accounts]=3 [public.practitioner_balances]=2
  [public.practitioner_rates]=2 [public.push_subscriptions]=2 [public.user_roles]=2
  [public.notification_preferences]=1 [public.triage_results]=1 [public.appointments]=0 [public.payments]=0
)
if [[ -s "$EXPORT/rowcounts.csv" ]]; then
  total=0
  while IFS=, read -r tbl n; do
    [[ -z "$tbl" ]] && continue
    total=$((total + n))
    if [[ -n "${expected[$tbl]:-}" ]]; then
      if [[ "${expected[$tbl]}" == "$n" ]]; then ok "$tbl : $n"; else warn "$tbl : $n (inventaire : ${expected[$tbl]})"; fi
    elif [[ "$n" != "0" ]]; then
      warn "$tbl : $n (table vide lors de l'inventaire)"
    fi
  done < "$EXPORT/rowcounts.csv"
  for t in auth.users public.profiles public.practitioners; do grep -q "^$t," "$EXPORT/rowcounts.csv" || ko "$t absent de rowcounts.csv"; done
  echo "  total : $total lignes"
fi

echo "▶ 4. Fichiers Storage"
if [[ -f "$EXPORT/storage/manifest.json" ]]; then
  if command -v python3 >/dev/null; then
    python3 - "$EXPORT/storage" <<'PY' || errors=$((errors + 1))
import json, os, sys
root = sys.argv[1]
m = json.load(open(os.path.join(root, "manifest.json")))
files = m.get("files", [])
errs = [f for f in files if f.get("error")]
missing = [f for f in files if not f.get("error") and not os.path.isfile(os.path.join(root, f["bucket"], f["path"]))]
size = sum(int(f.get("size") or 0) for f in files if not f.get("error"))
by = {}
for f in files:
    by[f["bucket"]] = by.get(f["bucket"], 0) + 1
print(f"  objets : {len(files)} ({', '.join(f'{k}={v}' for k, v in sorted(by.items()))}), {size/1e6:.1f} Mo")
status = 0
if errs: print(f"  ✖ {len(errs)} téléchargement(s) en erreur : " + ", ".join(f['bucket'] + '/' + f['path'] for f in errs[:5])); status = 1
if missing: print(f"  ✖ {len(missing)} fichier(s) absent(s) du disque"); status = 1
if len(files) != 101: print(f"  ⚠ {len(files)} objets dans le manifeste (inventaire : 101)")
if status == 0 and not missing and not errs: print("  ✔ tous les objets du manifeste sont présents")
sys.exit(status)
PY
  else
    warn "python3 absent : manifeste non vérifié"
  fi
else
  ko "storage/manifest.json absent : fichiers Storage non exportés (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
fi

echo "▶ 5. Empreintes SHA256"
if [[ -f "$EXPORT/SHA256SUMS" ]]; then
  if (cd "$EXPORT" && sha256sum -c --quiet SHA256SUMS 2>/dev/null); then ok "SHA256SUMS vérifié"; else ko "SHA256SUMS : au moins une empreinte ne correspond pas"; fi
else
  warn "SHA256SUMS absent"
fi

echo "▶ 6. Tables du schéma exporté vs db/native/schema.native.sql"
if [[ -s "$EXPORT/schema_public.sql" ]]; then
  prod=$(grep -oE "^CREATE TABLE (IF NOT EXISTS )?public\.[a-z_]+" "$EXPORT/schema_public.sql" | sed -E 's/.*public\.//' | sort -u)
  native=$(grep -oE "^CREATE TABLE public\.[a-z_]+" "$ROOT/db/native/schema.native.sql" | sed -E 's/.*public\.//' | sort -u)
  only_prod=$(comm -23 <(echo "$prod") <(echo "$native"))
  only_native=$(comm -13 <(echo "$prod") <(echo "$native"))
  [[ -z "$only_prod" ]] && ok "aucune table de production absente du schéma natif" || ko "tables de production absentes du schéma natif : $(tr '\n' ' ' <<<"$only_prod")"
  echo "  tables natives supplémentaires (attendu : auth_tokens refresh_tokens users) : $(tr '\n' ' ' <<<"$only_native")"
fi

echo
echo "Résultat : $errors bloquant(s), $warnings avertissement(s)"
[[ "$errors" -eq 0 ]]
