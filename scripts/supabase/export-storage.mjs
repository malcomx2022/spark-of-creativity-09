#!/usr/bin/env node
// =============================================================================
// export-storage.mjs — Télécharge tous les objets de tous les buckets Supabase Storage
// Usage : SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node export-storage.mjs <dossier> [bucket ...]
//   SUPABASE_SERVICE_ROLE_KEY : clé `service_role` (ancien format) ou `sb_secret_…` (nouveau format).
//   LIST_ONLY=1 : inventaire seul (manifest.json), sans téléchargement.
// Produit <dossier>/<bucket>/<chemin> + <dossier>/manifest.json (bucket, path, size, mime, updated_at)
// Aucune dépendance : API REST Storage via fetch (Node ≥ 18).
// =============================================================================
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const out = process.argv[2] ?? "export/storage";
const only = process.argv.slice(3);
const listOnly = process.env.LIST_ONLY === "1";
if (!url || !key) { console.error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis"); process.exit(1); }
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function api(path, init = {}) {
  const res = await fetch(`${url}/storage/v1${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function listBuckets() {
  return (await api("/bucket")).json();
}

async function listRecursive(bucket, prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await (await api(`/object/list/${bucket}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    })).json();
    for (const e of page) {
      const p = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) files.push(...(await listRecursive(bucket, p))); // dossier
      else files.push({ bucket, path: p, size: e.metadata?.size ?? null, mime: e.metadata?.mimetype ?? null, updated_at: e.updated_at });
    }
    if (page.length < 1000) break;
  }
  return files;
}

const buckets = (await listBuckets()).filter((b) => only.length === 0 || only.includes(b.name));
const manifest = [];
for (const b of buckets) {
  const files = await listRecursive(b.name);
  console.log(`▶ ${b.name} : ${files.length} objet(s)${listOnly ? " (inventaire seul)" : ""}`);
  for (const f of files) {
    if (listOnly) { manifest.push(f); continue; }
    try {
      const res = await api(`/object/${b.name}/${f.path.split("/").map(encodeURIComponent).join("/")}`);
      const dest = join(out, b.name, f.path);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, Buffer.from(await res.arrayBuffer()));
      manifest.push(f);
    } catch (err) {
      console.error(`  ✖ ${b.name}/${f.path}: ${err.message}`);
      manifest.push({ ...f, error: err.message });
    }
  }
}
await mkdir(out, { recursive: true });
await writeFile(join(out, "manifest.json"), JSON.stringify({ exported_at: new Date().toISOString(), list_only: listOnly, buckets: buckets.map((b) => ({ name: b.name, public: b.public })), files: manifest }, null, 2));
const errors = manifest.filter((f) => f.error).length;
console.log(`✔ ${manifest.length} objet(s) → ${out}${errors ? ` (${errors} erreur(s))` : ""}`);
process.exit(errors ? 1 : 0);
