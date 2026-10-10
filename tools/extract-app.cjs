/**
 * Extrae el codigo de la app desde app.asar a un arbol de referencia, verificando
 * cada fichero contra el SHA-256 que el propio indice del asar incorpora.
 *
 * Uso: node extract-app.cjs <ruta app.asar> <directorio salida> [filtro de rutas]
 *
 * El filtro por defecto extrae los paquetes de DSH y el shell web. Los `offset`
 * del indice son relativos al inicio del area de datos: hay que sumar
 * 16 + tamano de la cabecera.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const asarPath = process.argv[2];
const outDir = process.argv[3];
const only = process.argv[4];

const bytes = fs.readFileSync(asarPath);
const fd = fs.openSync(asarPath, 'r');
const head = Buffer.alloc(16);
fs.readSync(fd, head, 0, 16, 0);
const headerSize = head.readUInt32LE(12);
const base = 16 + headerSize;
const headerBuf = Buffer.alloc(headerSize);
fs.readSync(fd, headerBuf, 0, headerSize, 16);
const index = JSON.parse(headerBuf.toString('utf8').replace(/\u0000+$/, ''));

const keep = (p) =>
  only
    ? new RegExp(only).test(p)
    : p.startsWith('/dsh/node_modules/@deepseek-ai/') ||
      p.startsWith('/renderer/') ||
      p.startsWith('/lib/') ||
      p === '/package.json' ||
      p === '/dsh/package.json';

let files = 0;
let total = 0;
let mismatched = 0;
let unpacked = 0;
const mismatches = [];

(function walk(node, prefix) {
  const entries = node.files || {};
  for (const name of Object.keys(entries)) {
    const entry = entries[name];
    const full = prefix + '/' + name;
    if (entry.files) {
      walk(entry, full);
      continue;
    }
    if (!keep(full)) continue;
    if (entry.unpacked) {
      unpacked++;
      continue;
    }
    const start = base + Number(entry.offset);
    const data = bytes.subarray(start, start + entry.size);
    if (entry.integrity && entry.integrity.hash) {
      const actual = crypto.createHash('sha256').update(data).digest('hex');
      if (actual !== entry.integrity.hash) {
        mismatched++;
        if (mismatches.length < 10) mismatches.push(full);
      }
    }
    const dest = path.join(outDir, full.replace(/^\//, '').split('/').join(path.sep));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
    files++;
    total += entry.size;
  }
})(index, '');

console.log('extraidos: ' + files + ' ficheros, ' + (total / 1048576).toFixed(1) + ' MB');
console.log('discrepancias de hash: ' + mismatched + ' | no empaquetados omitidos: ' + unpacked);
for (const m of mismatches) console.log('  DISCREPANCIA ' + m);
if (mismatched) process.exit(1);
