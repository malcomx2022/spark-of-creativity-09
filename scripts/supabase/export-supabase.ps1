#Requires -Version 5.1
<#
.SYNOPSIS
  export-supabase.ps1 — Récupération complète des données depuis Supabase (équivalent Windows de export-supabase.sh)

.DESCRIPTION
  Produit export\<horodatage>\ avec la même arborescence que le script bash :
    schema_public.sql, data_public.dump, data_auth.dump, data_storage_meta.dump, rowcounts.csv,
    storage\ (fichiers des buckets + manifest.json), SHA256SUMS.
  Le dossier est ensuite contrôlable avec scripts/supabase/check-export.sh (Git Bash ou WSL) et importable
  avec scripts/db/import-native.sh.

  Variables d'environnement :
    SUPABASE_DB_URL             URL directe ou « Session pooler » (port 5432, pas 6543) — obligatoire
    SUPABASE_URL                https://<ref>.supabase.co  — pour les fichiers Storage
    SUPABASE_SERVICE_ROLE_KEY   clé service_role ou sb_secret_… — pour les fichiers Storage
    PGBIN                       dossier des binaires PostgreSQL 17 (pg_dump.exe, psql.exe) ; détection automatique :
                                C:\Program Files\PostgreSQL\17\bin, puis le dossier runtime de pgAdmin 4

.EXAMPLE
  $env:SUPABASE_DB_URL = 'postgresql://postgres.<ref>:<MDP>@aws-0-eu-west-2.pooler.supabase.com:5432/postgres'
  $env:SUPABASE_URL = 'https://<ref>.supabase.co'
  $env:SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_...'
  powershell -ExecutionPolicy Bypass -File scripts\supabase\export-supabase.ps1
#>
param([string]$ExportDir = "export")
$ErrorActionPreference = "Stop"
if (-not $env:SUPABASE_DB_URL) { throw "SUPABASE_DB_URL manquant" }

# --- Binaires PostgreSQL (même version majeure que le serveur : 17)
$candidates = @(
  $env:PGBIN,
  "C:\Program Files\PostgreSQL\17\bin",
  "C:\Program Files\pgAdmin 4\runtime",
  "C:\Program Files\pgAdmin 4\v9\runtime",
  "C:\Program Files\pgAdmin 4\v8\runtime"
) | Where-Object { $_ -and (Test-Path -LiteralPath ([IO.Path]::Combine($_, "pg_dump.exe")) -ErrorAction SilentlyContinue) }
if (-not $candidates) { throw "pg_dump.exe introuvable : installez PostgreSQL 17 (Command Line Tools) ou définissez PGBIN" }
$bin = @($candidates)[0]
$pgdump = Join-Path $bin "pg_dump.exe"
$psql = Join-Path $bin "psql.exe"
$clientVersion = (& $pgdump --version)
if ($clientVersion -notmatch "\) 17\.") { Write-Warning "Client $clientVersion : le serveur Supabase est en PostgreSQL 17, un pg_dump plus ancien sera refusé" }

function Invoke-Pg {
  param([string]$Exe, [string[]]$Arguments)
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Échec : $(Split-Path $Exe -Leaf) $($Arguments -join ' ')" }
}
function Write-Lf {
  param([string]$Path, [string[]]$Lines)
  [IO.File]::WriteAllText($Path, (($Lines -join "`n") + "`n"))   # fins de ligne LF (scripts bash)
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$out = Join-Path $ExportDir $stamp
New-Item -ItemType Directory -Force -Path $out | Out-Null
Write-Host "▶ Export vers $out"

Write-Host "▶ Version serveur / client"
$server = & $psql $env:SUPABASE_DB_URL -At -c "select version()"
if ($LASTEXITCODE -ne 0) { throw "Connexion impossible : vérifiez SUPABASE_DB_URL (utilisez l'URL « Session pooler » si l'accès direct IPv6 échoue)" }
Write-Lf (Join-Path $out "server_version.txt") @($server)
Write-Lf (Join-Path $out "client_version.txt") @($clientVersion)
Write-Host "  $server"
Write-Host "  $clientVersion"

Write-Host "▶ Schéma public"
Invoke-Pg $pgdump @($env:SUPABASE_DB_URL, "--schema-only", "--schema=public", "--no-owner", "--no-privileges", "-f", (Join-Path $out "schema_public.sql"))

Write-Host "▶ Données public (format custom)"
Invoke-Pg $pgdump @($env:SUPABASE_DB_URL, "--data-only", "--schema=public", "--no-owner", "--no-privileges", "-Fc", "-f", (Join-Path $out "data_public.dump"))

Write-Host "▶ Comptes auth (auth.users + auth.identities : hash bcrypt inclus)"
Invoke-Pg $pgdump @($env:SUPABASE_DB_URL, "--data-only", "--schema=auth", "--table=auth.users", "--table=auth.identities", "--no-owner", "--no-privileges", "-Fc", "-f", (Join-Path $out "data_auth.dump"))

Write-Host "▶ Métadonnées Storage"
Invoke-Pg $pgdump @($env:SUPABASE_DB_URL, "--data-only", "--schema=storage", "--table=storage.buckets", "--table=storage.objects", "--no-owner", "--no-privileges", "-Fc", "-f", (Join-Path $out "data_storage_meta.dump"))

Write-Host "▶ Comptage des lignes"
$countSql = @"
select 'auth.users', count(*) from auth.users
union all select 'storage.objects', count(*) from storage.objects
union all
select 'public.'||t.tablename, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t.tablename), false, true, '')))[1]::text::bigint
from pg_tables t where t.schemaname='public' order by 1
"@
$rows = & $psql $env:SUPABASE_DB_URL -At -F "," -c $countSql
if ($LASTEXITCODE -ne 0) { throw "Comptage impossible" }
Write-Lf (Join-Path $out "rowcounts.csv") $rows
$rows | ForEach-Object { Write-Host "  $_" }

if ($env:SUPABASE_URL -and $env:SUPABASE_SERVICE_ROLE_KEY) {
  Write-Host "▶ Fichiers Storage"
  $storageScript = Join-Path $PSScriptRoot "export-storage.mjs"
  & node $storageScript (Join-Path $out "storage")
  if ($LASTEXITCODE -ne 0) { Write-Warning "export-storage.mjs a signalé des erreurs (voir storage\manifest.json)" }
} else {
  Write-Warning "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents : fichiers Storage non exportés"
}

Write-Host "▶ Empreintes SHA256"
$sums = Get-ChildItem -Path $out -File | Where-Object { $_.Name -ne "SHA256SUMS" } | ForEach-Object {
  "$((Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash.ToLower())  $($_.Name)"
}
Write-Lf (Join-Path $out "SHA256SUMS") $sums

Write-Host "✔ Export terminé : $out"
Write-Host "  Contrôle (Git Bash ou WSL) : PGBIN='$bin' scripts/supabase/check-export.sh $($out -replace '\\','/')"
