#!/usr/bin/env node
// =============================================================================
// export-storage.mjs — Télécharge tous les objets de tous les buckets Supabase Storage
// Usage : SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node export-storage.mjs <dossier>
// Produit <dossier>/<bucket>/<chemin> + <dossier>/manifest.json (bucket, path, size, mime)
// Buckets connus du projet : documents, avatars, message-attachments.
// =============================================================================
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const out = process.argv[2] ?? "export/storage";
if (!url || !key) { console.error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis"); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function listRecursive(bucket, prefix = "") {
  const files = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const e of data) {
      const p = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) files.push(...(await listRecursive(bucket, p))); // dossier
      else files.push({ bucket, path: p, size: e.metadata?.size ?? null, mime: e.metadata?.mimetype ?? null, updated_at: e.updated_at });
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return files;
}

const { data: buckets, error } = await supabase.storage.listBuckets();
if (error) throw error;
const manifest = [];
for (const b of buckets) {
  const files = await listRecursive(b.name);
  console.log(`▶ bucket ${b.name} (${b.public ? "public" : "privé"}) : ${files.length} fichier(s)`);
  for (const f of files) {
    const { data, error: dlErr } = await supabase.storage.from(b.name).download(f.path);
    if (dlErr) { console.error(`  ✖ ${b.name}/${f.path}: ${dlErr.message}`); manifest.push({ ...f, error: dlErr.message }); continue; }
    const dest = join(out, b.name, f.path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, Buffer.from(await data.arrayBuffer()));
    manifest.push(f);
  }
}
await mkdir(out, { recursive: true });
await writeFile(join(out, "manifest.json"), JSON.stringify({ exported_at: new Date().toISOString(), buckets, files: manifest }, null, 2));
console.log(`✔ ${manifest.length} objet(s) → ${out}`);
