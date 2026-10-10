/**
 * Reparte el catalogo extraido en lotes equilibrados para traducir.
 * Uso: node split-batches.cjs <catalog.json> <dir salida>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const MAX = 380;
const catalog = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const outDir = process.argv[3];

const entries = Object.entries(catalog.namespaces)
  .map(([ns, v]) => ({ ns, en: (v.locales && v.locales.en) || {}, keys: Object.keys((v.locales && v.locales.en) || {}).length }))
  .filter((e) => e.keys > 0)
  .sort((a, b) => b.keys - a.keys);

const batches = [];
let cur = { keys: 0, items: [] };
for (const e of entries) {
  if (cur.keys + e.keys > MAX && cur.items.length) {
    batches.push(cur);
    cur = { keys: 0, items: [] };
  }
  cur.items.push(e);
  cur.keys += e.keys;
}
if (cur.items.length) batches.push(cur);

fs.mkdirSync(outDir, { recursive: true });
const manifest = [];
batches.forEach((b, i) => {
  const file = 'batch-' + String(i + 1).padStart(2, '0') + '.json';
  const payload = { batch: i + 1, keys: b.keys, namespaces: {} };
  for (const e of b.items) payload.namespaces[e.ns] = e.en;
  fs.writeFileSync(path.join(outDir, file), JSON.stringify(payload, null, 2));
  manifest.push({ file, keys: b.keys, namespaces: b.items.map((e) => e.ns) });
});
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

const total = entries.reduce((s, e) => s + e.keys, 0);
console.log('namespaces: ' + entries.length + ' | claves: ' + total + ' | lotes: ' + batches.length);
for (const m of manifest) console.log(m.file + '\t' + m.keys + '\t' + m.namespaces.join(', '));
