#!/usr/bin/env node
/**
 * Convierte un directorio de lotes de traduccion (varios `*.json`, cada uno con
 * `{ "<namespace>": { "<clave>": "<texto>" } }`) en un fichero por namespace:
 * `<salida>/<namespace>.json`, que es el formato que consume
 * `build-locale-pack.cjs`.
 *
 * Sirve para pasar de la fase de traduccion por lotes (reparto de trabajo entre
 * varios traductores o agentes) a un arbol revisable en el repositorio: un
 * fichero por namespace, diffs pequenos y sin conflictos entre areas.
 *
 * Uso: node split-by-namespace.cjs <dir de lotes> <dir de salida>
 *
 * Los lotes se leen en orden alfabetico; si una clave aparece dos veces con
 * valores distintos gana el ultimo fichero y se avisa por stderr.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const [, , srcDir, outDir] = process.argv;
if (!srcDir || !outDir) {
  console.error('uso: node split-by-namespace.cjs <dir de lotes> <dir de salida>');
  process.exit(2);
}

const byNs = new Map();
const conflicts = [];
let keys = 0;

for (const file of fs.readdirSync(srcDir).filter((f) => f.endsWith('.json')).sort()) {
  const data = JSON.parse(fs.readFileSync(path.join(srcDir, file), 'utf8'));
  for (const [ns, dict] of Object.entries(data)) {
    if (dict === null || typeof dict !== 'object' || Array.isArray(dict)) {
      conflicts.push({ kind: 'ns-no-objeto', file, ns });
      continue;
    }
    if (!byNs.has(ns)) byNs.set(ns, new Map());
    const target = byNs.get(ns);
    for (const [key, value] of Object.entries(dict)) {
      if (typeof value !== 'string') {
        conflicts.push({ kind: 'valor-no-texto', file, ns, key });
        continue;
      }
      if (target.has(key) && target.get(key) !== value) {
        conflicts.push({ kind: 'duplicado-distinto', file, ns, key, previo: target.get(key), nuevo: value });
      }
      target.set(key, value);
      keys++;
    }
  }
}

fs.mkdirSync(outDir, { recursive: true });
let written = 0;
for (const [ns, dict] of [...byNs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const payload = { [ns]: Object.fromEntries(dict) };
  fs.writeFileSync(path.join(outDir, ns + '.json'), JSON.stringify(payload, null, 2) + '\n');
  written++;
}

console.log(`namespaces escritos : ${written}`);
console.log(`claves escritas     : ${keys}`);
console.log(`destino             : ${outDir}`);
if (conflicts.length) {
  console.error('\n--- CONFLICTOS ---');
  for (const c of conflicts) console.error(JSON.stringify(c));
  process.exitCode = 1;
}
