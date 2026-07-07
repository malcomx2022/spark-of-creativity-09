"""
Génère la documentation technique & fonctionnelle complète
pour la refonte Domicares :
  - Phase 1 : abandon de Supabase au profit de PostgreSQL natif
  - Phase 2 : portage mobile en Flutter (la version web reste,
              + interface administration uniquement sur le web).
"""

from docx import Document
from docx.shared import Pt, RGBColor, Cm, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


# ---------------------------------------------------------------------------
# Helpers de mise en forme
# ---------------------------------------------------------------------------

PRIMARY = RGBColor(0x0B, 0x3D, 0x91)
SECONDARY = RGBColor(0x33, 0x33, 0x33)
ACCENT = RGBColor(0x00, 0x6E, 0x6E)
MUTED = RGBColor(0x6B, 0x72, 0x80)


def set_cell_bg(cell, color_hex):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), color_hex)
    tc_pr.append(shd)


def add_heading(doc, text, level=1):
    h = doc.add_heading(text, level=level)
    for run in h.runs:
        run.font.name = "Calibri"
        if level == 0:
            run.font.size = Pt(28)
            run.font.color.rgb = PRIMARY
        elif level == 1:
            run.font.size = Pt(20)
            run.font.color.rgb = PRIMARY
        elif level == 2:
            run.font.size = Pt(16)
            run.font.color.rgb = ACCENT
        else:
            run.font.size = Pt(13)
            run.font.color.rgb = SECONDARY
    return h


def add_paragraph(doc, text, bold=False, italic=False, color=None, size=11):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.font.name = "Calibri"
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    if color is not None:
        run.font.color.rgb = color
    return p


def add_bullets(doc, items, style="List Bullet"):
    for it in items:
        p = doc.add_paragraph(style=style)
        run = p.add_run(it)
        run.font.name = "Calibri"
        run.font.size = Pt(11)


def add_numbered(doc, items):
    add_bullets(doc, items, style="List Number")


def add_code(doc, code):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.5)
    run = p.add_run(code)
    run.font.name = "Consolas"
    run.font.size = Pt(9)
    run.font.color.rgb = RGBColor(0x1F, 0x1F, 0x1F)
    # fond gris léger via shading sur le paragraphe
    pPr = p._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), "F2F2F2")
    pPr.append(shd)


def add_table(doc, headers, rows, col_widths=None):
    tbl = doc.add_table(rows=1 + len(rows), cols=len(headers))
    tbl.style = "Light Grid Accent 1"
    hdr_cells = tbl.rows[0].cells
    for i, h in enumerate(headers):
        hdr_cells[i].text = ""
        p = hdr_cells[i].paragraphs[0]
        run = p.add_run(h)
        run.bold = True
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        run.font.size = Pt(10.5)
        run.font.name = "Calibri"
        set_cell_bg(hdr_cells[i], "0B3D91")
    for r, row in enumerate(rows, start=1):
        for c, val in enumerate(row):
            cell = tbl.rows[r].cells[c]
            cell.text = ""
            p = cell.paragraphs[0]
            run = p.add_run(str(val))
            run.font.size = Pt(10)
            run.font.name = "Calibri"
    if col_widths:
        for row in tbl.rows:
            for idx, w in enumerate(col_widths):
                row.cells[idx].width = Cm(w)
    return tbl


def add_page_break(doc):
    doc.add_page_break()


def add_callout(doc, title, text, color_hex="E8F0FE"):
    tbl = doc.add_table(rows=1, cols=1)
    cell = tbl.rows[0].cells[0]
    set_cell_bg(cell, color_hex)
    cell.text = ""
    p1 = cell.paragraphs[0]
    r1 = p1.add_run(title)
    r1.bold = True
    r1.font.size = Pt(11)
    r1.font.color.rgb = PRIMARY
    p2 = cell.add_paragraph()
    r2 = p2.add_run(text)
    r2.font.size = Pt(10.5)
    r2.font.color.rgb = SECONDARY


# ---------------------------------------------------------------------------
# Document
# ---------------------------------------------------------------------------

doc = Document()

# Marges
for section in doc.sections:
    section.top_margin = Cm(2)
    section.bottom_margin = Cm(2)
    section.left_margin = Cm(2.2)
    section.right_margin = Cm(2.2)

# Style normal
style = doc.styles["Normal"]
style.font.name = "Calibri"
style.font.size = Pt(11)


# ===========================================================================
# PAGE DE GARDE
# ===========================================================================

for _ in range(4):
    doc.add_paragraph()

title = doc.add_paragraph()
title.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = title.add_run("DOMICARES")
r.bold = True
r.font.size = Pt(48)
r.font.color.rgb = PRIMARY
r.font.name = "Calibri"

subtitle = doc.add_paragraph()
subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = subtitle.add_run("Refonte technique & ouverture mobile")
r.font.size = Pt(20)
r.font.color.rgb = ACCENT
r.italic = True

doc.add_paragraph()

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run(
    "Documentation technique et fonctionnelle complète\n"
    "Migration Supabase → PostgreSQL natif\n"
    "Portage mobile Flutter (Patients & Praticiens) — Administration sur Web"
)
r.font.size = Pt(13)
r.font.color.rgb = SECONDARY

for _ in range(6):
    doc.add_paragraph()

meta = doc.add_paragraph()
meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = meta.add_run("Document de référence — v1.0\nMai 2026")
r.font.size = Pt(12)
r.font.color.rgb = MUTED

add_page_break(doc)


# ===========================================================================
# SOMMAIRE (statique : Word peut le générer dynamiquement après ouverture)
# ===========================================================================

add_heading(doc, "Sommaire", level=1)

toc = [
    "1. Contexte et objectifs",
    "2. État des lieux de l'application actuelle",
    "3. Périmètre fonctionnel détaillé",
    "4. Architecture cible — Phase 1 (PostgreSQL natif)",
    "5. Modèle de données PostgreSQL",
    "6. Authentification & sécurité (remplacement de Supabase Auth & RLS)",
    "7. Stockage de fichiers (remplacement de Supabase Storage)",
    "8. API back-end (remplacement des Edge Functions)",
    "9. Intégrations tierces (FedaPay, Twilio, Mapbox, Push)",
    "10. Plan de migration phasé",
    "11. Refactor du front-end web",
    "12. DevOps, observabilité, qualité",
    "13. Phase 2 — Version mobile Flutter",
    "14. Architecture Flutter détaillée",
    "15. Spécifications fonctionnelles mobile",
    "16. Synchronisation web / mobile / admin",
    "17. Stratégie de tests",
    "18. Sécurité & conformité (RGPD, données de santé)",
    "19. Roadmap, charges et jalons",
    "20. Risques et mitigations",
    "21. Annexes",
]
add_bullets(doc, toc)

add_callout(
    doc,
    "Astuce Word",
    "Ce sommaire est statique. Vous pouvez insérer un sommaire automatique "
    "via : Références ▸ Table des matières ▸ Table automatique. Les titres "
    "du document utilisent les styles Heading 1/2/3 nécessaires.",
)

add_page_break(doc)


# ===========================================================================
# 1. CONTEXTE
# ===========================================================================

add_heading(doc, "1. Contexte et objectifs", level=1)

add_heading(doc, "1.1 Présentation de Domicares", level=2)
add_paragraph(
    doc,
    "Domicares est une plateforme de mise en relation entre patients, "
    "praticiens de santé et coachs sportifs intervenant à domicile. "
    "L'application gère l'ensemble du cycle de prise en charge : inscription "
    "et vérification d'identité (KYC) des praticiens, recherche "
    "géolocalisée, prise de rendez-vous, paiement via Mobile Money (FedaPay), "
    "suivi des consultations, séances de groupe, messagerie, notifications, "
    "litiges, payouts et reporting administratif.",
)

add_heading(doc, "1.2 Objectifs de la refonte", level=2)
add_bullets(
    doc,
    [
        "Phase 1 — Autonomie technique : sortir de Supabase (Auth, Postgres "
        "managé, Storage, Edge Functions) et redéployer la solution sur un "
        "stack PostgreSQL + back-end Node.js (NestJS recommandé) hébergeable "
        "sur n'importe quel VPS ou cloud.",
        "Conserver la même expérience fonctionnelle (zéro régression "
        "fonctionnelle) et la même base SQL (les 93 migrations existantes "
        "sont déjà du Postgres pur).",
        "Renforcer la sécurité (politiques d'accès dans la couche service "
        "plutôt qu'en RLS distribuée), la testabilité et l'observabilité.",
        "Phase 2 — Élargir l'accès : produire une application mobile "
        "Flutter (Android + iOS) pour les patients et les praticiens, en "
        "réutilisant l'API REST/GraphQL exposée par le nouveau back-end.",
        "Conserver la version Web existante (stack Vite + React) ; "
        "l'administration reste exclusivement sur Web.",
    ],
)

add_heading(doc, "1.3 Hors-périmètre", level=2)
add_bullets(
    doc,
    [
        "Refonte UI/UX du site Web (la charte reste celle de shadcn/Tailwind).",
        "Changement du fournisseur de paiement (FedaPay reste, mais l'intégration est isolée).",
        "Réécriture du moteur de triage médical (porté en l'état).",
    ],
)

add_page_break(doc)


# ===========================================================================
# 2. ETAT DES LIEUX
# ===========================================================================

add_heading(doc, "2. État des lieux de l'application actuelle", level=1)

add_heading(doc, "2.1 Stack technique en place", level=2)
add_table(
    doc,
    headers=["Couche", "Technologie", "Commentaire"],
    rows=[
        ["Front-end", "Vite + React 18 + TypeScript + Tailwind + shadcn/ui",
         "258 fichiers, ~28 700 lignes, 30 pages"],
        ["Data fetching", "TanStack Query v5", "Cache 5 min, retry 1"],
        ["Formulaires", "react-hook-form + zod", "Validation côté client"],
        ["BaaS", "Supabase (Postgres 15, Auth, Storage, Edge Functions)",
         "Couplage fort, 47 functions, 93 migrations"],
        ["Paiement", "FedaPay (Mobile Money Bénin)", "Webhook HMAC SHA-256"],
        ["SMS / OTP", "Twilio Verify", ""],
        ["Cartes", "Mapbox GL", "Géocodage + visualisation"],
        ["Stockage", "Supabase Storage (post-migration depuis Wasabi)", ""],
        ["CI/CD", "GitHub Actions → VPS via SSH",
         "Tests/lint en `|| true` (non bloquants)"],
    ],
    col_widths=[3, 5, 8],
)

add_heading(doc, "2.2 Domaines fonctionnels couverts", level=2)
add_bullets(
    doc,
    [
        "Inscription patients (avec onboarding médical).",
        "Inscription praticiens et coachs sportifs (workflow KYC).",
        "Authentification email/password + OTP SMS.",
        "Recherche géolocalisée des praticiens.",
        "Triage clinique (questionnaire d'orientation).",
        "Prise de rendez-vous, paiement, annulation, remboursement.",
        "Séances de groupe (coach sportif).",
        "Messagerie patient ↔ praticien.",
        "Notifications push + e-mail + SMS.",
        "Suivi GPS de l'intervention.",
        "Comptabilité interne (ledger) et payouts vers les praticiens.",
        "Backoffice administrateur (KYC, finance, opérations, conformité, "
        "support, audit, webhooks).",
    ],
)

add_heading(doc, "2.3 Points forts existants", level=2)
add_bullets(
    doc,
    [
        "Webhook FedaPay vérifié en HMAC timing-safe.",
        "Lazy loading systématique des pages secondaires.",
        "Découpage propre `pages / components / hooks / lib / integrations`.",
        "Schéma SQL déjà riche et normalisé (≈ 60 tables).",
        "Documentation produit abondante (docs/, ~70 fichiers).",
    ],
)

add_heading(doc, "2.4 Points faibles à corriger pendant la refonte", level=2)
add_bullets(
    doc,
    [
        "TypeScript en mode permissif (strict:false, strictNullChecks:false, "
        "noImplicitAny:false) — 114 occurrences de `: any`.",
        "Politiques d'accès dispersées (RLS Supabase + checks applicatifs).",
        "1 seul test React, stub non fonctionnel ; couverture quasi-nulle.",
        "154 console.log dans `src/`.",
        "Fichier `.env` versionné dans le dépôt.",
        "`.github/workflows/deploy.yml` masque les erreurs avec `|| true`.",
        "47 Edge Functions Deno, certaines redondantes (cleanup, sync, "
        "diagnose, reconcile…) à consolider.",
        "Documentation racine encombrée (17 REVUE_*.md à déplacer).",
    ],
)

add_page_break(doc)


# ===========================================================================
# 3. PERIMETRE FONCTIONNEL
# ===========================================================================

add_heading(doc, "3. Périmètre fonctionnel détaillé", level=1)

add_heading(doc, "3.1 Acteurs", level=2)
add_table(
    doc,
    headers=["Acteur", "Description", "Canal"],
    rows=[
        ["Patient", "Personne demandant une prise en charge à domicile",
         "Web + Mobile Flutter"],
        ["Praticien", "Professionnel de santé (médecin, infirmier, kiné…)",
         "Web + Mobile Flutter"],
        ["Coach sportif", "Praticien typé 'coach_sportif', anime des "
         "séances individuelles ou de groupe", "Web + Mobile Flutter"],
        ["Administrateur", "Super-admin, finance, ops, compliance, support, analyst",
         "Web uniquement"],
        ["Système", "Tâches planifiées (relances, réconciliation, payouts)",
         "Back-end seul"],
    ],
    col_widths=[3, 9, 4],
)

add_heading(doc, "3.2 Modules fonctionnels", level=2)

modules = [
    ("Inscription & KYC",
     "Création de compte patient/praticien/coach, vérification e-mail, "
     "upload de documents d'identité et diplômes, soumission KYC, validation "
     "par administrateur, notifications de statut, gestion des expirations."),
    ("Authentification",
     "Email + mot de passe, OTP SMS Twilio, récupération de mot de passe, "
     "auto-logout idle, gestion des rôles applicatifs (patient, praticien, "
     "coach, admin, incomplete_practitioner)."),
    ("Recherche & disponibilités",
     "Recherche géolocalisée (rayon, spécialité, note, prix), affichage "
     "carte Mapbox, lecture des plages de disponibilité et exceptions, "
     "consultation des tarifs."),
    ("Prise de rendez-vous",
     "Sélection date/heure, type de consultation, tarif, adresse, "
     "création de l'appointment en pending_payment, expiration auto si "
     "non payé."),
    ("Paiement",
     "Initiation paiement FedaPay (Mobile Money), webhook de confirmation, "
     "réconciliation, ré-essais, remboursements, sauvegarde de moyens de "
     "paiement, ledger interne, rapports financiers."),
    ("Séances de groupe",
     "Création par coach, inscription des participants, gestion places, "
     "paiement par participant, ré-essai paiement, annulation."),
    ("Consultation",
     "Suivi GPS du praticien, notification d'arrivée, démarrage, complétion, "
     "rapport de consultation, avis patient."),
    ("Messagerie",
     "Conversations patient ↔ praticien liées à un rendez-vous, messages "
     "texte et pièces jointes, lecture en temps réel."),
    ("Notifications",
     "Push (Web Push API + APNs/FCM pour mobile), e-mail, SMS, "
     "préférences utilisateur."),
    ("Dossier médical",
     "Profil médical patient, contacts d'urgence, notes de soins partagées, "
     "rapports de consultation."),
    ("Litiges",
     "Création d'un litige, messages, résolution par support."),
    ("Payouts",
     "Calcul du solde praticien (ledger), création de batch, exécution via "
     "FedaPay payouts, ré-essais."),
    ("Administration",
     "Tableaux de bord, KYC queue, finance, payments monitoring, ops, "
     "compliance, support, audit logs, webhooks, gestion utilisateurs."),
]
for name, desc in modules:
    add_heading(doc, name, level=3)
    add_paragraph(doc, desc)

add_page_break(doc)


# ===========================================================================
# 4. ARCHITECTURE CIBLE PHASE 1
# ===========================================================================

add_heading(doc, "4. Architecture cible — Phase 1 (PostgreSQL natif)", level=1)

add_heading(doc, "4.1 Schéma d'architecture", level=2)
add_paragraph(
    doc,
    "L'architecture cible adopte un découpage trois-tiers classique : "
    "client (Web React et Mobile Flutter), API HTTP stateless, base de "
    "données PostgreSQL gérée par l'équipe.",
)

add_code(
    doc,
    """
┌─────────────────────────┐    ┌──────────────────────────┐
│   Web (React + Vite)    │    │  Mobile (Flutter)        │
│   • Patient             │    │  • Patient               │
│   • Praticien / Coach   │    │  • Praticien / Coach     │
│   • Administration      │    │  (PAS d'admin sur mobile)│
└───────────┬─────────────┘    └────────────┬─────────────┘
            │ HTTPS / JSON                  │ HTTPS / JSON
            └──────────────┬────────────────┘
                           ▼
              ┌──────────────────────────┐
              │  API Gateway / Reverse   │
              │  proxy (Nginx, Caddy)    │
              └────────────┬─────────────┘
                           ▼
              ┌──────────────────────────┐
              │ Back-end NestJS (Node.js)│
              │ • Auth (JWT + refresh)   │
              │ • REST + (option GraphQL)│
              │ • Workers BullMQ         │
              │ • WebSocket (chat, GPS)  │
              └─────┬──────────────┬─────┘
                    │              │
        ┌───────────▼──┐    ┌──────▼──────────────┐
        │ PostgreSQL 16│    │ Redis (cache+queue) │
        │ + PostGIS    │    │                     │
        └──────────────┘    └─────────────────────┘
                    │
        ┌───────────▼──────────────┐
        │ Object storage (MinIO ou │
        │ S3 / Wasabi)             │
        └──────────────────────────┘
""",
)

add_heading(doc, "4.2 Choix technologiques", level=2)
add_table(
    doc,
    headers=["Couche", "Technologie cible", "Justification"],
    rows=[
        ["Base de données", "PostgreSQL 16 + PostGIS",
         "Conserve toutes les fonctionnalités SQL utilisées (JSONB, RLS "
         "optionnelle, fonctions, triggers). PostGIS pour la recherche géo."],
        ["Back-end", "NestJS (TypeScript) + Fastify",
         "Framework structuré (modules, DI, providers), bien typé, scalable, "
         "écosystème mature (Auth, BullMQ, Swagger)."],
        ["ORM", "Prisma (recommandé) ou Drizzle",
         "Migrations versionnées, typage fort, génération du client à partir du "
         "schéma. Drizzle est plus proche du SQL si on veut piloter manuellement."],
        ["Auth", "Passport.js + JWT access + Refresh tokens (cookies httpOnly)",
         "Remplace Supabase Auth. Argon2id pour les hash."],
        ["OTP / SMS", "Twilio Verify (inchangé)", "Couche de service côté back."],
        ["Cache / Queues", "Redis 7 + BullMQ",
         "File de tâches (webhooks, notifications, payouts), cache des sessions."],
        ["Stockage", "MinIO (on-prem) ou S3 compatible (Wasabi, Backblaze, R2)",
         "Pré-signed URLs, chiffrement côté serveur."],
        ["Temps réel", "Socket.IO ou ws natif",
         "Messagerie, suivi GPS, notifications in-app."],
        ["Notifications push", "Web Push (VAPID) + Firebase Cloud Messaging (FCM) "
         "pour Android/iOS via flutter_local_notifications + firebase_messaging",
         ""],
        ["Observabilité", "OpenTelemetry → Grafana / Loki / Tempo",
         "Logs structurés, traces, métriques."],
        ["CI/CD", "GitHub Actions + Docker + Ansible/Compose",
         "Build images, push registry, déploiement reproductible."],
    ],
    col_widths=[3, 6, 7],
)

add_heading(doc, "4.3 Topologie de déploiement", level=2)
add_bullets(
    doc,
    [
        "1 reverse proxy (Caddy ou Nginx) en frontal, terminaison TLS Let's Encrypt.",
        "1 ou plusieurs nœuds API (Node.js) derrière un load balancer.",
        "1 cluster PostgreSQL (primary + replica + WAL archiving vers S3).",
        "1 Redis (sentinel pour HA).",
        "1 cluster MinIO (4 nœuds minimum) ou S3 managé.",
        "Backups Postgres journaliers + PITR via pgBackRest ou wal-g.",
        "DNS + WAF (Cloudflare).",
    ],
)

add_page_break(doc)


# ===========================================================================
# 5. MODELE DE DONNEES
# ===========================================================================

add_heading(doc, "5. Modèle de données PostgreSQL", level=1)

add_paragraph(
    doc,
    "Le schéma existant est conservé à 95 %. Les seules adaptations "
    "nécessaires concernent le retrait du couplage à `auth.users` de "
    "Supabase et la suppression des RLS au profit d'un filtrage applicatif "
    "centralisé (CASL / policies NestJS).",
)

add_heading(doc, "5.1 Tables principales (par domaine)", level=2)

add_table(
    doc,
    headers=["Domaine", "Tables"],
    rows=[
        ["Identité", "users (nouveau), profiles, admins, user_roles, user_consents, consents, consent_versions"],
        ["Praticiens", "practitioners, practitioner_availability, practitioner_exceptions, "
         "practitioner_rates, practitioner_payment_info, practitioners_public_view, services"],
        ["KYC / Documents", "kyc_documents, files, file_access_logs, service_audit_log"],
        ["Patient", "addresses, emergency_contacts, medical_profiles, triage_results, care_notes, care_notes_sharing_log"],
        ["Rendez-vous", "appointments, consultation_reports, consultation_reports_access_log, reviews"],
        ["Séances de groupe", "group_sessions, group_session_participants"],
        ["Paiements", "payments, payment_attempts, payment_events, payment_events_sanitized, "
         "payment_refunds, payment_reconciliations, saved_payment_methods, webhook_events"],
        ["Comptabilité", "ledger_accounts, ledger_entries, practitioner_balances, "
         "practitioner_payouts, payout_batches, payout_payments, reconciliation_reports"],
        ["Communication", "messages, notifications, notification_preferences, push_subscriptions"],
        ["Litiges / Support", "disputes, dispute_messages, support_tickets, faqs"],
        ["Audit / Sécurité", "admin_audit_logs, search_activity_logs, otp_attempts, otp_rate_limits"],
        ["Configuration", "system_config"],
    ],
    col_widths=[3.5, 12.5],
)

add_heading(doc, "5.2 Modifications à apporter", level=2)
add_bullets(
    doc,
    [
        "Créer une table `users` propre (id UUID, email citext UNIQUE, "
        "password_hash, phone, email_verified_at, phone_verified_at, "
        "created_at, updated_at, deleted_at).",
        "Remplacer toutes les FK `auth.users(id)` par `users(id)`.",
        "Centraliser les rôles dans une seule table `user_roles(user_id, "
        "role, scope)` (la pratique actuelle d'utiliser cette table "
        "uniquement pour les admins est conservée).",
        "Conserver les enums Postgres (`app_role`, `payment_status`, etc.).",
        "Supprimer toutes les policies RLS (ou les garder en defense in "
        "depth si le back-end se connecte avec un rôle restreint).",
        "Migrer les fonctions SQL utilisées (`get_admin_dashboard_stats`, "
        "`approve_practitioner_kyc`, `reserve_group_session_spot`, "
        "`update_practitioner_balance_atomic`, etc.) — elles sont conservées "
        "telles quelles.",
        "Activer l'extension `postgis` pour la recherche par rayon "
        "(coordonnées dans `addresses` et `practitioners`).",
        "Activer `citext`, `pgcrypto`, `uuid-ossp`.",
    ],
)

add_heading(doc, "5.3 Exemple — table users", level=2)
add_code(
    doc,
    """CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             CITEXT NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  phone             VARCHAR(20) UNIQUE,
  email_verified_at TIMESTAMPTZ,
  phone_verified_at TIMESTAMPTZ,
  last_login_at     TIMESTAMPTZ,
  failed_logins     INT NOT NULL DEFAULT 0,
  locked_until      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_users_email          ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_phone          ON users(phone) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_last_login_at  ON users(last_login_at);

CREATE TABLE refresh_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL,
  user_agent   TEXT,
  ip_address   INET,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
""",
)

add_page_break(doc)


# ===========================================================================
# 6. AUTH & SECURITE
# ===========================================================================

add_heading(doc, "6. Authentification & sécurité", level=1)

add_heading(doc, "6.1 Remplacement de Supabase Auth", level=2)
add_table(
    doc,
    headers=["Fonctionnalité", "Solution cible"],
    rows=[
        ["Inscription email/password",
         "POST /auth/register — validation zod, hash argon2id, envoi e-mail "
         "de vérification (token signé, 24 h)."],
        ["Connexion email/password",
         "POST /auth/login — vérification hash, génération access token "
         "JWT (15 min) + refresh token (30 j, en cookie httpOnly Secure SameSite=Lax)."],
        ["OTP SMS",
         "POST /auth/otp/send + /auth/otp/verify — délégation Twilio Verify, "
         "rate-limit Redis."],
        ["Mot de passe oublié",
         "POST /auth/password/forgot + /reset — token signé à usage unique."],
        ["Refresh & révocation",
         "POST /auth/refresh — rotation systématique du refresh, "
         "table `refresh_tokens` (token_hash + révocation)."],
        ["Vérification e-mail",
         "GET /auth/email/verify?token=… — met à jour `email_verified_at`."],
        ["Sessions concurrentes",
         "Listing /me/sessions, révocation unitaire."],
        ["Auto-logout idle",
         "Conservé côté front-end (idle timeout) + côté back, expiration "
         "stricte de l'access token."],
    ],
    col_widths=[5, 11],
)

add_heading(doc, "6.2 Modèle d'autorisation", level=2)
add_paragraph(
    doc,
    "La logique de rôles applicatifs (`patient`, `practitioner`, `coach`, "
    "`admin`, `incomplete_practitioner`) est centralisée dans un service "
    "`UserRoleResolver` côté back-end (mirroir de `src/lib/userRoleResolver.ts`). "
    "L'autorisation est implémentée avec CASL ou les Guards NestJS.",
)
add_bullets(
    doc,
    [
        "Décorateurs `@Roles('admin')` et `@CurrentUser()` sur les contrôleurs.",
        "Policies par ressource : `AppointmentPolicy.canRead(user, appointment)`.",
        "Les administrateurs portent un sous-rôle (`super_admin`, `ops`, "
        "`finance`, `compliance`, `support`, `analyst`) qui détermine les "
        "endpoints accessibles.",
    ],
)

add_heading(doc, "6.3 Sécurité transport et infrastructure", level=2)
add_bullets(
    doc,
    [
        "HTTPS obligatoire, HSTS, Content-Security-Policy stricte.",
        "Cookies access/refresh : httpOnly, Secure, SameSite=Lax (Web).",
        "Mobile : access token en mémoire, refresh token chiffré dans "
        "secure storage (Keychain iOS / Keystore Android via "
        "`flutter_secure_storage`).",
        "CORS restreint aux origines déclarées.",
        "Rate-limiting Redis (auth, OTP, recherche).",
        "Validation systématique des entrées avec zod / class-validator.",
        "Vérification HMAC SHA-256 des webhooks (déjà en place — à porter "
        "tel quel).",
        "Audit log immuable (`admin_audit_logs`) avec horodatage et IP.",
        "Chiffrement at-rest des fichiers sensibles (KYC, rapports "
        "médicaux) via SSE-S3 ou SSE-KMS.",
        "Rotation des secrets via Vault ou variables CI chiffrées.",
    ],
)

add_page_break(doc)


# ===========================================================================
# 7. STOCKAGE
# ===========================================================================

add_heading(doc, "7. Stockage de fichiers", level=1)

add_paragraph(
    doc,
    "Supabase Storage est remplacé par un service S3 compatible. Deux "
    "options recommandées : MinIO (auto-hébergé, idéal pour souveraineté "
    "et coûts) ou un fournisseur S3-compatible (Wasabi, Backblaze B2, "
    "Cloudflare R2). L'API reste S3, donc le code d'upload côté back-end "
    "est portable.",
)

add_heading(doc, "7.1 Buckets et politiques", level=2)
add_table(
    doc,
    headers=["Bucket", "Contenu", "Accès"],
    rows=[
        ["kyc-documents", "Pièces d'identité, diplômes, certifications", "Privé, signé"],
        ["consultation-reports", "PDF de rapports", "Privé, signé"],
        ["care-notes", "Notes de soins", "Privé, signé"],
        ["avatars", "Photos de profil", "Public (read), signé (write)"],
        ["messages", "Pièces jointes de la messagerie", "Privé, signé"],
        ["exports", "Exports CSV / rapports admin", "Privé, signé, TTL court"],
    ],
    col_widths=[5, 7, 4],
)

add_heading(doc, "7.2 Flux d'upload", level=2)
add_numbered(
    doc,
    [
        "Le client demande une URL pré-signée via "
        "`POST /files/presign` (bucket, mime, taille).",
        "Le back-end valide le droit (rôle + quota), génère l'URL signée "
        "(PUT, expiration 5 min) et enregistre une entrée `files` en statut "
        "`pending`.",
        "Le client envoie le fichier directement à l'objet store.",
        "Le client confirme via `POST /files/{id}/confirm` ; le back-end "
        "vérifie l'existence S3, le hash, scanne via ClamAV (worker BullMQ) "
        "et passe en `ready`.",
        "Toute lecture passe par une URL signée GET (TTL 60 s) générée à "
        "la demande, journalisée dans `file_access_logs`.",
    ],
)

add_page_break(doc)


# ===========================================================================
# 8. API
# ===========================================================================

add_heading(doc, "8. API back-end (remplacement des Edge Functions)", level=1)

add_paragraph(
    doc,
    "Les 47 Edge Functions Deno sont regroupées en modules NestJS. "
    "Beaucoup d'entre elles (cleanup-*, diagnose-*, sync-*, repair-*, "
    "reconcile-*) sont fusionnées en un module `payments-ops` exposant "
    "des endpoints administratifs et des jobs CRON.",
)

add_heading(doc, "8.1 Cartographie Edge Function → Module NestJS", level=2)
add_table(
    doc,
    headers=["Edge Function actuelle", "Module / endpoint cible"],
    rows=[
        ["send-otp, verify-otp", "AuthModule (OTPService)"],
        ["secure-phone", "AuthModule (PhoneUpdateService)"],
        ["complete-user-registration", "RegistrationModule"],
        ["create-practitioner-account, create-test-users", "AdminUsersModule"],
        ["admin-management, cleanup-non-test-accounts, delete-single-user",
         "AdminUsersModule"],
        ["find-available-practitioner", "SearchModule"],
        ["create-appointment-with-payment, handle-appointment-response",
         "AppointmentsModule"],
        ["create-payment, payment-webhook, sync-payment-status, "
         "auto-sync-pending-payments, cancel-pending-payment, "
         "cleanup-stuck-payments, diagnose-stuck-payments, "
         "reconcile-fedapay, retry-failed-webhooks, simulate-webhook, "
         "test-fedapay-connectivity",
         "PaymentsModule + PaymentsOpsModule (jobs CRON)"],
        ["create-payout, create-payout-batch, process-payout-batch, "
         "process-refund, release-held-funds, repair-balances, "
         "apply-ledger-entries, manage-momo-wallet",
         "PayoutsModule + LedgerModule"],
        ["register-group-session, retry-group-session-payment",
         "GroupSessionsModule"],
        ["notify-appointment-request, send-account-activation, "
         "send-kyc-status-notification, send-payment-reminders, "
         "send-registration-notification, send-push-notification",
         "NotificationsModule (canaux : push / email / sms)"],
        ["schedule-consultation-tasks", "SchedulerModule (BullMQ)"],
        ["get-fedapay-config, get-mapbox-token, get-webhook-url",
         "ConfigModule"],
        ["get-presigned-url, upload-to-wasabi", "FilesModule (S3 service)"],
        ["export-database, import-database",
         "AdminOpsModule (jobs longs, BullMQ)"],
    ],
    col_widths=[8, 8],
)

add_heading(doc, "8.2 Conventions REST", level=2)
add_bullets(
    doc,
    [
        "Base URL : `https://api.domicares.life/v1`.",
        "Versionnement par préfixe URL (`/v1`, `/v2`).",
        "Format JSON, dates en ISO-8601 UTC.",
        "Pagination : `?page=1&pageSize=20` ; réponses enveloppées "
        "`{ data, meta: { page, pageSize, total } }`.",
        "Filtres : `?status=paid&from=...&to=...`.",
        "Erreurs normalisées : `{ error: { code, message, details } }`.",
        "OpenAPI 3 généré automatiquement via `@nestjs/swagger`, exposé sur "
        "`/docs` (protégé en prod).",
    ],
)

add_heading(doc, "8.3 Exemples d'endpoints", level=2)
add_code(
    doc,
    """POST   /v1/auth/register
POST   /v1/auth/login
POST   /v1/auth/refresh
POST   /v1/auth/logout
POST   /v1/auth/otp/send
POST   /v1/auth/otp/verify
POST   /v1/auth/password/forgot
POST   /v1/auth/password/reset
GET    /v1/me
PATCH  /v1/me
GET    /v1/me/sessions
DELETE /v1/me/sessions/:id

GET    /v1/practitioners?lat=&lng=&radius=&specialty=
GET    /v1/practitioners/:id
GET    /v1/practitioners/:id/availability?from=&to=
GET    /v1/practitioners/:id/reviews

POST   /v1/appointments
GET    /v1/appointments?role=patient|practitioner
GET    /v1/appointments/:id
PATCH  /v1/appointments/:id/cancel
POST   /v1/appointments/:id/start
POST   /v1/appointments/:id/complete
POST   /v1/appointments/:id/report
POST   /v1/appointments/:id/review

POST   /v1/payments                        # initiation FedaPay
GET    /v1/payments/:id
POST   /v1/payments/:id/refund
POST   /v1/webhooks/fedapay                # signé HMAC

POST   /v1/files/presign
POST   /v1/files/:id/confirm
GET    /v1/files/:id/url

GET    /v1/messages/conversations
GET    /v1/messages/conversations/:id
POST   /v1/messages/conversations/:id/messages

GET    /v1/notifications
POST   /v1/notifications/preferences
POST   /v1/notifications/push/subscribe    # Web Push (VAPID)
POST   /v1/notifications/push/register     # FCM token (mobile)

GET    /v1/admin/dashboard
GET    /v1/admin/kyc?status=pending
POST   /v1/admin/kyc/:id/approve
POST   /v1/admin/kyc/:id/reject
GET    /v1/admin/payments
GET    /v1/admin/payouts
POST   /v1/admin/payouts/batch
GET    /v1/admin/disputes
GET    /v1/admin/audit-logs
""",
)

add_page_break(doc)


# ===========================================================================
# 9. INTEGRATIONS TIERCES
# ===========================================================================

add_heading(doc, "9. Intégrations tierces", level=1)

add_table(
    doc,
    headers=["Service", "Usage", "Adaptation requise"],
    rows=[
        ["FedaPay", "Création de transactions, webhook, payouts, refunds",
         "Module `FedapayService` isolé, secrets via .env, HMAC vérifié "
         "(timing-safe) — code existant porté tel quel."],
        ["Twilio Verify", "OTP SMS, vérification phone",
         "Module `TwilioService`, rate-limit Redis."],
        ["Mapbox", "Géocodage adresse, tuiles carte",
         "Endpoint `GET /v1/config/mapbox-token` (token public à durée limitée)."],
        ["Web Push (VAPID)", "Notifications push web",
         "Génération de clés VAPID, table `push_subscriptions`."],
        ["Firebase Cloud Messaging", "Push iOS/Android",
         "Nouveau pour le mobile, intégré côté back via `firebase-admin`."],
        ["SMTP", "Emails transactionnels",
         "Nodemailer + provider (Postmark, Mailgun ou SES). Templates MJML."],
        ["S3 / MinIO", "Stockage", "AWS SDK v3."],
        ["Redis", "Cache + queues BullMQ + rate-limit", ""],
    ],
    col_widths=[3.5, 5.5, 7],
)

add_page_break(doc)


# ===========================================================================
# 10. PLAN DE MIGRATION
# ===========================================================================

add_heading(doc, "10. Plan de migration phasé", level=1)

add_heading(doc, "10.1 Phases", level=2)
phases = [
    ("Phase 0 — Préparation (1 sem.)",
     "Mise au propre du repo : suppression des `.env` versionnés, "
     "activation de `strict: true`, retrait des `|| true` CI, écriture "
     "d'un vrai README, structuration de `docs/`."),
    ("Phase 1 — Bootstrap back-end (2 sem.)",
     "Initialisation NestJS, Prisma, Docker Compose (Postgres+Redis+MinIO), "
     "module Auth complet (register, login, refresh, OTP, password reset), "
     "tests d'intégration."),
    ("Phase 2 — Schéma & migrations (1 sem.)",
     "Reprise des 93 migrations Supabase, adaptation des FK vers la "
     "nouvelle table `users`, génération du client Prisma, scripts de "
     "seed."),
    ("Phase 3 — Migration des données (1 sem.)",
     "Script ETL : export depuis Supabase (pg_dump), mapping auth.users → "
     "users, ré-import, vérification de cohérence (counts, FK)."),
    ("Phase 4 — Domaine cœur (3 sem.)",
     "Modules Users, Practitioners, Search, Appointments, Files. "
     "Couverture tests > 70 %."),
    ("Phase 5 — Paiements & ledger (2 sem.)",
     "Modules Payments, PaymentsOps, Payouts, Ledger, webhooks FedaPay, "
     "jobs BullMQ. Re-jeu de tous les scénarios e2e existants "
     "(`payment-workflow.e2e.test.ts`)."),
    ("Phase 6 — Messagerie, notifications, GPS (2 sem.)",
     "WebSockets, push web + FCM, suivi GPS."),
    ("Phase 7 — Backoffice admin (2 sem.)",
     "Endpoints administratifs, audit logs, exports."),
    ("Phase 8 — Bascule front-end Web (2 sem.)",
     "Remplacement de `@/integrations/supabase` par un client HTTP "
     "généré depuis OpenAPI, migration de tous les hooks `useXxx`, "
     "remplacement de l'auth client."),
    ("Phase 9 — Recette & cutover (1 sem.)",
     "Tests utilisateurs, bascule DNS, désactivation Supabase."),
    ("Phase 10 — Mobile Flutter (8 sem.)",
     "Voir section 13."),
]
for name, desc in phases:
    add_heading(doc, name, level=3)
    add_paragraph(doc, desc)

add_heading(doc, "10.2 Stratégie de coexistence pendant la bascule", level=2)
add_bullets(
    doc,
    [
        "Le nouveau back-end est déployé en parallèle de Supabase pendant "
        "toute la migration.",
        "Synchronisation des données via réplication logique Postgres → "
        "Postgres natif (publication / subscription) pendant la phase 8.",
        "Feature flag côté front-end : `USE_NEW_API=true/false`, "
        "permettant un rollback en < 5 min.",
        "Bascule des webhooks FedaPay en dernier (un seul webhook actif "
        "à la fois pour éviter les doubles encaissements).",
    ],
)

add_page_break(doc)


# ===========================================================================
# 11. REFACTOR WEB
# ===========================================================================

add_heading(doc, "11. Refactor du front-end Web", level=1)

add_heading(doc, "11.1 Couche d'accès aux données", level=2)
add_bullets(
    doc,
    [
        "Création d'un client HTTP `src/integrations/api/client.ts` basé "
        "sur `fetch` + intercepteurs (refresh token, gestion 401).",
        "Génération automatique des types et hooks React Query à partir "
        "de l'OpenAPI (orval ou openapi-typescript-codegen).",
        "Suppression complète de `src/integrations/supabase/`.",
        "Réécriture de `useProfile`, `useAppointments`, `usePayments`, "
        "`useMessages`, etc. en utilisant le nouveau client.",
        "Remplacement de l'auth helper Supabase par un `AuthProvider` "
        "React (Context) qui stocke l'access token en mémoire et utilise "
        "le cookie httpOnly pour le refresh.",
    ],
)

add_heading(doc, "11.2 Nettoyage à effectuer en parallèle", level=2)
add_bullets(
    doc,
    [
        "Activer `strict: true` dans `tsconfig.app.json`.",
        "Activer les règles ESLint `@typescript-eslint/no-explicit-any: warn` "
        "et `no-unused-vars: error`.",
        "Stripper les `console.log` en production (`vite-plugin-remove-console`).",
        "Centraliser les appels temps réel via un `RealtimeProvider` (Socket.IO).",
        "Réorganiser `docs/` (déplacer les `REVUE_*.md` racine).",
        "Réécrire le `README.md` (la version actuelle est le template Lovable).",
    ],
)

add_heading(doc, "11.3 Périmètre conservé", level=2)
add_paragraph(
    doc,
    "L'arborescence `pages/`, `components/`, `hooks/`, `lib/`, "
    "`schemas/`, `contexts/` reste identique. Aucune refonte UI/UX. "
    "Seule la couche data change.",
)

add_page_break(doc)


# ===========================================================================
# 12. DEVOPS
# ===========================================================================

add_heading(doc, "12. DevOps, observabilité, qualité", level=1)

add_heading(doc, "12.1 CI/CD", level=2)
add_bullets(
    doc,
    [
        "GitHub Actions : lint + tests + build obligatoires (PR bloquante).",
        "Retrait de tous les `|| true`.",
        "Pipeline back-end : build image Docker, push GHCR, déploiement via "
        "`docker compose pull && up -d` sur le VPS (ou Kubernetes).",
        "Pipeline front : build statique, déploiement sur le reverse proxy "
        "+ invalidation CDN.",
        "Migrations Prisma exécutées en pré-déploiement avec verrou "
        "(`prisma migrate deploy`).",
    ],
)

add_heading(doc, "12.2 Observabilité", level=2)
add_bullets(
    doc,
    [
        "Logs structurés JSON (pino) → Loki via Promtail.",
        "Traces OpenTelemetry → Tempo.",
        "Métriques Prometheus → Grafana (latence p95, taux d'erreur, "
        "longueur des queues BullMQ, événements paiement).",
        "Alertes (Slack / Email) : taux d'erreur > 1 %, latence > 1 s, "
        "webhook FedaPay en échec > 5/min, queue saturée.",
        "Sentry pour les erreurs front-end et mobile.",
    ],
)

add_heading(doc, "12.3 Qualité", level=2)
add_bullets(
    doc,
    [
        "Tests unitaires : Jest (back), Vitest (front), flutter_test (mobile).",
        "Tests d'intégration : Postgres testcontainers + Supertest.",
        "Tests e2e Web : Playwright (3 scénarios critiques minimum : "
        "inscription patient, prise de RDV+paiement, complétion consultation).",
        "Tests e2e mobile : integration_test (Flutter) + tests d'écran.",
        "Couverture cible : 70 % global, 90 % sur Payments et Auth.",
        "Pre-commit hooks (husky + lint-staged) : prettier + eslint + "
        "typecheck.",
    ],
)

add_page_break(doc)


# ===========================================================================
# 13. PHASE 2 : MOBILE FLUTTER
# ===========================================================================

add_heading(doc, "13. Phase 2 — Version mobile Flutter", level=1)

add_heading(doc, "13.1 Objectifs", level=2)
add_bullets(
    doc,
    [
        "Fournir une expérience native Android et iOS pour les Patients "
        "et les Praticiens / Coachs.",
        "Couvrir 100 % du périmètre fonctionnel utilisateur final (hors "
        "administration).",
        "L'interface d'administration reste exclusivement sur le Web "
        "(complexité, fréquence d'usage, équipement bureau).",
        "Co-existence parfaite avec la version Web : même back-end, mêmes "
        "données, sessions indépendantes.",
        "Performances natives, mode offline limité (consultation profil, "
        "historique RDV en lecture).",
    ],
)

add_heading(doc, "13.2 Périmètre mobile (synthèse)", level=2)
add_table(
    doc,
    headers=["Fonctionnalité", "Patient mobile", "Praticien mobile", "Admin"],
    rows=[
        ["Inscription / KYC", "Oui", "Oui (upload depuis caméra)", "Non"],
        ["Login email + OTP", "Oui", "Oui", "Non"],
        ["Biométrie (FaceID, empreinte)", "Oui", "Oui", "Non"],
        ["Recherche praticien (carte)", "Oui", "—", "Non"],
        ["Triage", "Oui", "—", "Non"],
        ["Prise de RDV + paiement", "Oui", "—", "Non"],
        ["Gestion disponibilités", "—", "Oui", "Non"],
        ["Réception demandes RDV", "—", "Oui (push)", "Non"],
        ["Suivi GPS live", "Oui (suivre)", "Oui (partager)", "Non"],
        ["Démarrage / complétion consult.", "—", "Oui", "Non"],
        ["Rapport de consultation", "Lecture", "Saisie", "Non"],
        ["Messagerie", "Oui", "Oui", "Non"],
        ["Notifications push", "Oui (FCM)", "Oui (FCM)", "Non"],
        ["Avis et notation", "Oui", "Lecture", "Non"],
        ["Séances de groupe", "Oui (s'inscrire)", "Oui (créer)", "Non"],
        ["Portefeuille / payouts", "—", "Oui (lecture)", "Non"],
        ["Backoffice complet", "—", "—", "Web uniquement"],
    ],
    col_widths=[5, 3.5, 3.5, 3],
)

add_page_break(doc)


# ===========================================================================
# 14. ARCHITECTURE FLUTTER
# ===========================================================================

add_heading(doc, "14. Architecture Flutter détaillée", level=1)

add_heading(doc, "14.1 Stack", level=2)
add_table(
    doc,
    headers=["Couche", "Technologie", "Rôle"],
    rows=[
        ["SDK", "Flutter 3.22+ / Dart 3.4+", "UI multiplateforme"],
        ["State management", "Riverpod 2 (recommandé) ou BLoC",
         "Gestion d'état réactive, testable, typée"],
        ["Routage", "go_router", "Navigation déclarative, deep links"],
        ["HTTP client", "Dio + retrofit", "Client REST typé, intercepteurs auth"],
        ["Génération API", "OpenAPI Generator (dart-dio)", "Types et clients depuis l'OpenAPI back"],
        ["Stockage local", "Hive ou Drift (SQLite)", "Cache offline, file d'attente"],
        ["Secure storage", "flutter_secure_storage", "Refresh token, biométrie"],
        ["Notifications", "firebase_messaging + flutter_local_notifications",
         "Push iOS/Android"],
        ["Cartes", "mapbox_gl_flutter", "Affichage et tracé GPS"],
        ["GPS", "geolocator + background_locator",
         "Position en avant- et arrière-plan (consult.)"],
        ["Paiement", "WebView intégrée pour FedaPay + deep link de retour",
         "Identique au flux Web, callback custom scheme"],
        ["Internationalisation", "intl + arb", "FR par défaut, EN à prévoir"],
        ["Analytics / crash", "Firebase Analytics + Sentry", ""],
        ["Tests", "flutter_test + integration_test + mocktail", ""],
    ],
    col_widths=[3, 6, 7],
)

add_heading(doc, "14.2 Structure du projet", level=2)
add_code(
    doc,
    """domicares_mobile/
├── lib/
│   ├── main.dart
│   ├── app/
│   │   ├── app.dart                 # MaterialApp, theming, router
│   │   ├── router.dart              # go_router config
│   │   └── theme.dart
│   ├── core/
│   │   ├── api/                     # Dio + intercepteurs + generated client
│   │   ├── auth/                    # AuthRepository, token storage, biométrie
│   │   ├── errors/                  # AppException, mapping HTTP → UI
│   │   ├── notifications/           # FCM, local notifications
│   │   ├── storage/                 # Hive boxes, cache
│   │   ├── network/                 # Connectivity, retry, offline queue
│   │   └── utils/                   # date, money, phone, geo helpers
│   ├── features/
│   │   ├── auth/
│   │   │   ├── data/                # repositories, datasources
│   │   │   ├── domain/              # entities, usecases
│   │   │   └── presentation/        # screens, controllers (Riverpod)
│   │   ├── onboarding/
│   │   ├── patient_signup/
│   │   ├── practitioner_signup/
│   │   ├── search/
│   │   ├── triage/
│   │   ├── appointments/
│   │   ├── payments/
│   │   ├── consultations/
│   │   ├── messaging/
│   │   ├── notifications/
│   │   ├── group_sessions/
│   │   ├── reviews/
│   │   ├── profile/
│   │   └── practitioner_dashboard/  # disponibilités, payouts, KYC
│   ├── shared/
│   │   ├── widgets/                 # composants UI réutilisables
│   │   └── models/                  # modèles partagés
│   └── l10n/                        # fichiers ARB
├── test/
├── integration_test/
├── android/
├── ios/
└── pubspec.yaml
""",
)

add_heading(doc, "14.3 Architecture en couches (par feature)", level=2)
add_paragraph(
    doc,
    "Chaque feature suit une architecture Clean Architecture allégée :",
)
add_bullets(
    doc,
    [
        "presentation/ : écrans (StatelessWidget / HookConsumerWidget), "
        "contrôleurs Riverpod, états (freezed).",
        "domain/ : entités métier (immutables, freezed), use cases (1 "
        "classe = 1 action métier).",
        "data/ : repositories (interfaces dans domain, impl dans data), "
        "sources distantes (Dio) et locales (Hive).",
    ],
)

add_heading(doc, "14.4 Authentification mobile", level=2)
add_numbered(
    doc,
    [
        "Login : POST /auth/login → accessToken (mémoire) + refreshToken "
        "(stocké chiffré dans flutter_secure_storage).",
        "À chaque requête, l'intercepteur Dio ajoute "
        "`Authorization: Bearer <access>`.",
        "Sur 401, l'intercepteur tente un refresh ; si échec, "
        "déconnexion → route /login.",
        "Activation optionnelle de FaceID/empreinte pour déverrouiller "
        "l'app au lancement (local_auth).",
        "OTP : flux identique au Web (Twilio).",
    ],
)

add_heading(doc, "14.5 Notifications push", level=2)
add_bullets(
    doc,
    [
        "Initialisation FCM au premier lancement, demande de permission "
        "(iOS).",
        "Enregistrement du token via POST /notifications/push/register "
        "(plate-forme, modèle, app version).",
        "Réception en foreground → affichage via "
        "flutter_local_notifications avec deep link.",
        "Catégories : nouvelle demande de RDV, confirmation paiement, "
        "rappel consultation, message reçu, statut KYC.",
    ],
)

add_heading(doc, "14.6 Suivi GPS de l'intervention", level=2)
add_bullets(
    doc,
    [
        "Côté praticien : `background_locator` envoie la position toutes "
        "les 10 s pendant le statut `in_progress`.",
        "Transmission via WebSocket au back, broadcast au patient concerné.",
        "Côté patient : affichage de la position sur Mapbox, ETA recalculé.",
        "Arrêt automatique à la complétion ou si la batterie est < 10 %.",
        "Permissions iOS : `Always` justifiée par le suivi en arrière-plan ; "
        "écran d'explication obligatoire avant la demande.",
    ],
)

add_heading(doc, "14.7 Paiement FedaPay sur mobile", level=2)
add_paragraph(
    doc,
    "Le SDK FedaPay JS étant pensé pour le Web, la solution la plus simple "
    "et la plus sûre consiste à ouvrir une WebView intégrée pointant vers "
    "une page hébergée par notre back-end qui lance le widget. Le retour "
    "se fait via un deep link `domicares://payment/callback?status=...&id=...` "
    "intercepté par l'app pour rafraîchir l'état du RDV. Cela évite de "
    "manipuler les clés FedaPay côté natif.",
)

add_heading(doc, "14.8 Mode hors-ligne", level=2)
add_bullets(
    doc,
    [
        "Lecture seule des dernières données synchronisées (profil, "
        "prochain RDV, messages récents, documents téléchargés).",
        "File d'attente locale pour les actions non critiques (mise à "
        "jour profil, marquage message lu).",
        "Indicateur de connectivité global.",
        "Aucune création de RDV ni paiement hors-ligne.",
    ],
)

add_heading(doc, "14.9 Distribution", level=2)
add_bullets(
    doc,
    [
        "Android : build AAB signé, distribution Google Play (canal "
        "interne → fermé → production).",
        "iOS : build IPA, TestFlight → App Store Connect.",
        "Versionning : sémantique `MAJOR.MINOR.PATCH+BUILD`.",
        "OTA limitée : seulement le contenu remote-config (pas de "
        "mise à jour de code via shorebird en MVP).",
    ],
)

add_page_break(doc)


# ===========================================================================
# 15. SPECIFICATIONS FONCTIONNELLES MOBILE
# ===========================================================================

add_heading(doc, "15. Spécifications fonctionnelles mobile", level=1)

specs = [
    ("15.1 Onboarding / Splash",
     "Splash 1,5 s avec logo, vérification version min (force-update si "
     "obsolète), bascule auto vers l'écran d'accueil si session active, "
     "sinon vers /welcome.",
     ["Carrousel 3 écrans (avantages, comment ça marche, sécurité).",
      "Choix : 'Je suis patient' / 'Je suis professionnel'."]),
    ("15.2 Inscription patient",
     "Formulaire en 3 étapes (identité, contact, mot de passe). "
     "Validation OTP SMS obligatoire avant accès au dashboard. "
     "Onboarding médical (allergies, antécédents) proposé après login.",
     ["Validation des champs en temps réel.",
      "Téléphone au format international.",
      "CGU/Politique de confidentialité à accepter."]),
    ("15.3 Inscription praticien / coach",
     "Workflow en 5 étapes : identité, spécialité, tarifs, documents KYC "
     "(photo pièce d'identité + diplôme via caméra), revue. "
     "Statut `incomplete_practitioner` tant que validation admin pendante.",
     ["Upload depuis caméra ou galerie.",
      "Compression image client (≤ 2 Mo).",
      "Suivi du statut KYC dans l'app."]),
    ("15.4 Connexion",
     "Email + mot de passe OU téléphone + OTP. "
     "Option 'Se souvenir de moi' (refresh token long).",
     ["Activation biométrie après 1er login.",
      "Lien 'mot de passe oublié'."]),
    ("15.5 Dashboard patient",
     "Vue d'accueil avec : prochain RDV, raccourcis (Trouver un praticien, "
     "Triage, Mes consultations, Messages, Mon profil).",
     ["Bandeau urgence (numéro local).",
      "Promo séances de groupe à venir."]),
    ("15.6 Recherche praticien",
     "Carte plein écran (Mapbox) + liste basculable. Filtres : spécialité, "
     "distance, prix, note minimale. Détail praticien : avis, tarifs, "
     "disponibilités sur 14 j.",
     ["Géolocalisation auto (avec permission).",
      "Saisie d'adresse alternative.",
      "Tri par distance / note / prix."]),
    ("15.7 Triage",
     "Questionnaire dynamique d'orientation (symptômes, urgence). "
     "Résultat = orientation vers spécialité + sévérité.",
     ["Sauvegarde du résultat dans `triage_results`.",
      "Bouton direct 'Trouver un praticien adapté'."]),
    ("15.8 Prise de RDV + paiement",
     "Sélection créneau, motif, adresse, mode de paiement (MoMo). "
     "Lancement WebView FedaPay, retour via deep link, confirmation.",
     ["RDV en `pending_payment` pendant 15 min max.",
      "Notification push à confirmation.",
      "Ajout au calendrier (option)."]),
    ("15.9 Suivi de consultation",
     "Écran live : position praticien sur carte, ETA, statut "
     "(en route / arrivé / en cours / terminé), bouton appel.",
     ["Refresh WebSocket toutes les 10 s.",
      "Notification push à chaque changement d'état."]),
    ("15.10 Rapport de consultation",
     "Affichage du rapport rédigé par le praticien, possibilité de "
     "télécharger en PDF, partage médecin traitant.",
     ["Lecture seule.",
      "Téléchargement chiffré (URL signée 60 s)."]),
    ("15.11 Messagerie",
     "Liste des conversations (1 par RDV actif/récent), bulle de "
     "messages, indicateur lecture, envoi pièce jointe (photo, doc).",
     ["Temps réel via Socket.IO.",
      "Notification push en background."]),
    ("15.12 Avis",
     "Note 1-5 étoiles + commentaire après complétion. Modifiable 48 h.",
     ["Modération automatique (mots-clés).",
      "Visible sur la fiche praticien."]),
    ("15.13 Séances de groupe (patient)",
     "Liste des séances proposées par les coachs, inscription, paiement, "
     "rappels.",
     []),
    ("15.14 Dashboard praticien",
     "Vue d'accueil : demandes en attente, RDV du jour, solde, "
     "raccourcis disponibilités/payouts.",
     ["Badge sur l'onglet 'Demandes' si nouvelle.",
      "Push systématique sur nouvelle demande."]),
    ("15.15 Gestion des disponibilités",
     "Calendrier hebdomadaire, plages récurrentes, exceptions ponctuelles.",
     []),
    ("15.16 Démarrage / complétion de consultation",
     "Bouton 'En route' → activation GPS background ; bouton 'Arrivé' ; "
     "bouton 'Démarrer' ; formulaire de rapport ; bouton 'Terminer'.",
     ["Verrouillage anti-clic accidentel (confirmation).",
      "Sauvegarde brouillon rapport offline."]),
    ("15.17 Portefeuille et payouts",
     "Solde courant, historique des paiements reçus, demandes de payout, "
     "informations bancaires/MoMo.",
     ["Lecture seule des montants.",
      "Demande de payout via formulaire validé."]),
]

for title, intro, bullets in specs:
    add_heading(doc, title, level=2)
    add_paragraph(doc, intro)
    if bullets:
        add_bullets(doc, bullets)

add_page_break(doc)


# ===========================================================================
# 16. SYNCHRONISATION
# ===========================================================================

add_heading(doc, "16. Synchronisation web / mobile / admin", level=1)

add_bullets(
    doc,
    [
        "Source de vérité unique : la base PostgreSQL exposée par l'API "
        "NestJS. Aucune logique métier dupliquée sur les clients.",
        "Sessions indépendantes par device (table `refresh_tokens`), "
        "déconnexion globale possible depuis /me/sessions.",
        "Toute mutation passe par l'API → propagation temps réel via "
        "Socket.IO aux clients connectés (canaux : `user:{id}`, "
        "`practitioner:{id}`, `appointment:{id}`).",
        "Webhook FedaPay reçu une seule fois (back-end) ; les clients "
        "sont notifiés via WebSocket et invalidation TanStack Query / "
        "Riverpod.",
        "L'admin Web utilise les mêmes endpoints `/v1/admin/*`, protégés "
        "par rôle.",
        "Versionnement API : le mobile envoie son numéro de version dans "
        "le header `X-Client-Version` ; le back peut renvoyer un "
        "`426 Upgrade Required` pour forcer la mise à jour.",
    ],
)

add_page_break(doc)


# ===========================================================================
# 17. TESTS
# ===========================================================================

add_heading(doc, "17. Stratégie de tests", level=1)

add_table(
    doc,
    headers=["Niveau", "Web", "Back", "Mobile"],
    rows=[
        ["Unitaire", "Vitest + Testing Library",
         "Jest + ts-jest", "flutter_test + mocktail"],
        ["Intégration", "MSW (mock API)",
         "Supertest + testcontainers Postgres", "Riverpod overrides"],
        ["E2E", "Playwright (3 scénarios critiques)",
         "Re-jeu des suites e2e existantes (payment workflow)",
         "integration_test (parcours patient + praticien)"],
        ["Charge", "—",
         "k6 (auth, search, payment webhook 100 req/s)", "—"],
        ["Sécurité", "—",
         "OWASP ZAP en CI (scan passif)", "MobSF (Android), nettoyage cordova"],
    ],
    col_widths=[3, 5, 5, 5],
)

add_paragraph(
    doc,
    "Objectif global : 70 % de couverture, 90 % sur les modules Payments, "
    "Auth, Appointments. Les modules Ledger et Payouts font l'objet de "
    "tests de propriétés (fast-check) sur la cohérence des soldes.",
)

add_page_break(doc)


# ===========================================================================
# 18. SECURITE & CONFORMITE
# ===========================================================================

add_heading(doc, "18. Sécurité & conformité", level=1)

add_heading(doc, "18.1 Données de santé", level=2)
add_bullets(
    doc,
    [
        "Les rapports de consultation, les notes de soins et les "
        "documents KYC sont considérés comme données sensibles.",
        "Chiffrement at-rest (SSE-S3 ou SSE-KMS) et in-transit (TLS 1.3).",
        "Journalisation systématique de tout accès dans "
        "`file_access_logs` et `consultation_reports_access_log`.",
        "Anonymisation des exports analytiques (table "
        "`payment_events_sanitized`).",
        "Politique de conservation : 10 ans pour les rapports médicaux, "
        "5 ans pour les paiements, 3 ans pour les logs d'audit, suppression "
        "compte sous 30 j sur demande.",
    ],
)

add_heading(doc, "18.2 RGPD", level=2)
add_bullets(
    doc,
    [
        "Page CGU + Politique de confidentialité versionnées via la table "
        "`consent_versions` ; consentement enregistré dans `user_consents`.",
        "Droit à l'export : endpoint `/me/export` (ZIP : profil, RDV, "
        "messages, rapports).",
        "Droit à l'oubli : suppression soft (`deleted_at`) puis hard delete "
        "après période de conservation légale.",
        "DPO et registre des traitements à formaliser.",
    ],
)

add_heading(doc, "18.3 Sécurité applicative (rappel)", level=2)
add_bullets(
    doc,
    [
        "Argon2id pour les mots de passe, peppered.",
        "Verrouillage de compte après 10 tentatives (champ "
        "`failed_logins` + `locked_until`).",
        "Rate-limit Redis sur toutes les routes d'auth et de paiement.",
        "Headers sécurité : HSTS, CSP, X-Frame-Options, X-Content-Type-"
        "Options, Referrer-Policy.",
        "Tests de pénétration externes annuels.",
    ],
)

add_page_break(doc)


# ===========================================================================
# 19. ROADMAP
# ===========================================================================

add_heading(doc, "19. Roadmap, charges et jalons", level=1)

add_table(
    doc,
    headers=["Sprint", "Périmètre", "Charge (j.h.)", "Jalon"],
    rows=[
        ["S1", "Préparation, audit, mise au propre repo, CI stricte", "8", "Repo prod-ready"],
        ["S2-S3", "Bootstrap NestJS, Auth complet, tests Auth", "20", "Auth-v1"],
        ["S4", "Schéma + migrations Prisma, seed", "8", "DB-v1"],
        ["S5", "ETL Supabase → PG natif, validation", "8", "Données migrées"],
        ["S6-S8", "Modules Users / Practitioners / Search / Files", "25", "Domaine cœur"],
        ["S9-S10", "Modules Payments / Ledger / Payouts + jobs", "20", "Paiements"],
        ["S11-S12", "Messagerie, notifications, GPS WebSocket", "18", "Temps réel"],
        ["S13-S14", "Backoffice admin endpoints", "18", "Admin-v1"],
        ["S15-S16", "Bascule front Web (suppression Supabase client)", "18", "Web sur nouveau back"],
        ["S17", "Recette, cutover, désactivation Supabase", "8", "Go-live Phase 1"],
        ["S18-S19", "Bootstrap Flutter, auth, design system", "20", "Mobile-v0"],
        ["S20-S22", "Features patient (search, RDV, paiement, GPS)", "30", "Mobile patient α"],
        ["S23-S24", "Features praticien (dispos, demandes, consult.)", "20", "Mobile praticien α"],
        ["S25", "Notifications push, deep links, biométrie", "10", "Mobile complet"],
        ["S26", "QA, tests sur devices, polish UI", "12", "Release Candidate"],
        ["S27", "Soumission stores (TestFlight, Play interne)", "5", "Beta publique"],
        ["S28", "Corrections feedback, soumission prod", "8", "Mobile-v1"],
    ],
    col_widths=[2, 8, 2, 4],
)

add_paragraph(
    doc,
    "Charge totale indicative : ~260 j.h. (≈ 13 sem. équipe de 4 ETP).",
    italic=True,
)

add_page_break(doc)


# ===========================================================================
# 20. RISQUES
# ===========================================================================

add_heading(doc, "20. Risques et mitigations", level=1)

add_table(
    doc,
    headers=["Risque", "Impact", "Probabilité", "Mitigation"],
    rows=[
        ["Perte de données pendant la migration ETL", "Critique", "Faible",
         "Dry-run complet en pré-prod, checksum par table, snapshot "
         "Supabase juste avant cutover, rollback DNS sous 5 min."],
        ["Régression dans le flux paiement FedaPay", "Critique", "Moyen",
         "Re-jeu intégral des suites e2e existantes, environnement sandbox "
         "FedaPay, double-écoute webhook pendant 48 h."],
        ["Sécurité : exposition de routes admin", "Critique", "Faible",
         "Guards globaux, tests d'autorisation systématiques, audit "
         "externe avant go-live."],
        ["Retard sur la phase mobile (FCM iOS, App Store review)", "Modéré",
         "Moyen", "Démarrage TestFlight en parallèle dès Mobile-v0, "
         "réserve d'une itération de revue Apple."],
        ["Effet tunnel pendant la refonte", "Modéré", "Moyen",
         "Déploiements incrémentaux toutes les 2 sem., feature flags, "
         "démos régulières."],
        ["Surcoût RH / compétences NestJS / Flutter", "Modéré", "Moyen",
         "Formation interne sur S1, recours ponctuel à un prestataire."],
        ["Performance recherche géographique sans PostGIS optimisé",
         "Faible", "Moyen", "Activation PostGIS, index GIST, benchmarks "
         "dès S6."],
        ["Compatibilité versions Android anciennes", "Faible", "Faible",
         "Cible minSdk 24 (Android 7.0+), tests sur émulateurs API 24-34."],
    ],
    col_widths=[5, 2.5, 2.5, 6],
)

add_page_break(doc)


# ===========================================================================
# 21. ANNEXES
# ===========================================================================

add_heading(doc, "21. Annexes", level=1)

add_heading(doc, "21.1 Glossaire", level=2)
add_table(
    doc,
    headers=["Terme", "Définition"],
    rows=[
        ["KYC", "Know Your Customer — vérification d'identité et de qualification."],
        ["RLS", "Row Level Security — politiques d'accès au niveau de la ligne en Postgres."],
        ["JWT", "JSON Web Token — jeton signé pour authentification stateless."],
        ["BullMQ", "Bibliothèque Node.js de file de tâches basée sur Redis."],
        ["FCM", "Firebase Cloud Messaging — service push de Google."],
        ["VAPID", "Voluntary Application Server Identification, pour Web Push."],
        ["Ledger", "Comptabilité interne en partie double (débits/crédits)."],
        ["Payout", "Versement effectué vers un praticien."],
        ["ETA", "Estimated Time of Arrival — heure estimée d'arrivée."],
    ],
    col_widths=[4, 12],
)

add_heading(doc, "21.2 Références code (existant)", level=2)
add_table(
    doc,
    headers=["Élément", "Chemin"],
    rows=[
        ["Client Supabase Web", "src/integrations/supabase/client.ts"],
        ["Types DB générés", "src/integrations/supabase/types.ts"],
        ["Résolveur de rôle", "src/lib/userRoleResolver.ts"],
        ["Webhook FedaPay (HMAC timing-safe)",
         "supabase/functions/payment-webhook/index.ts:14-26"],
        ["Routing applicatif", "src/App.tsx"],
        ["Protected routes", "src/components/ProtectedRoute.tsx"],
        ["Configuration Vite", "vite.config.ts"],
        ["CI/CD VPS", ".github/workflows/deploy.yml"],
        ["Migrations SQL", "supabase/migrations/ (93 fichiers)"],
        ["Edge functions", "supabase/functions/ (47 dossiers)"],
        ["Doc produit historique", "docs/ (~70 fichiers)"],
    ],
    col_widths=[6, 10],
)

add_heading(doc, "21.3 Checklist de cutover", level=2)
add_bullets(
    doc,
    [
        "Snapshot Supabase + dump Postgres archivés.",
        "Tests e2e verts sur l'environnement de pré-prod.",
        "Webhook FedaPay configuré sur la nouvelle URL (en sandbox + prod).",
        "DNS prêt à basculer (TTL réduit à 60 s 24 h avant).",
        "Page de maintenance préparée (30 min max).",
        "Astreinte 24/24 sur les 48 h suivant la bascule.",
        "Monitoring Grafana : tableaux de bord prêts.",
        "Rollback DNS documenté et testé.",
    ],
)

add_heading(doc, "21.4 Conventions de code", level=2)
add_bullets(
    doc,
    [
        "TypeScript strict (back-end + front Web).",
        "Naming : camelCase (variables/fonctions), PascalCase (types/classes/composants), kebab-case (fichiers).",
        "Commits : Conventional Commits (feat:, fix:, refactor:, chore:, docs:, test:).",
        "PR : description obligatoire, tests verts, 1 reviewer min.",
        "Branches : main protégé, develop intermédiaire, feature/* éphémères.",
        "Flutter : `dart format`, `flutter analyze` en CI, "
        "lints `flutter_lints` + règles internes (no-print, "
        "always-declare-return-types).",
    ],
)

add_paragraph(doc, "")
add_paragraph(doc, "— Fin du document —", italic=True, color=MUTED)

# ---------------------------------------------------------------------------
# Sauvegarde
# ---------------------------------------------------------------------------

output_path = "/home/user/spark-of-creativity-09/docs/refactor/Domicares-Refonte-PG-Flutter.docx"
doc.save(output_path)
print(f"OK -> {output_path}")
