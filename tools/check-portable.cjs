#!/usr/bin/env node
/**
 * Comprueba que el catalogo y las traducciones no filtran nada de la maquina que
 * los genero: rutas absolutas de Windows, rutas de usuario, nombres de fichero
 * con directorios personales o posibles credenciales.
 *
 * El catalogo se publica, y una extraccion descuidada deja dentro rutas como
 * `C:\…\node_modules\@deepseek-ai\…`. Esto lo detecta antes de subirlo.
 *
 * Uso: node check-portable.cjs <fichero o directorio> [more…] [--all]
 *
 *   Por defecto revisa solo los ficheros `.json` (el catalogo y las
 *   traducciones, que son los datos que se publican). Con `--all` revisa todo,
 *   util antes de una publicacion manual; entonces hay que esperar avisos en la
 *   documentacion, donde las rutas son ejemplos.
 *
 * Devuelve 1 si encuentra algo, para poder usarlo en integracion continua.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const TODOS = args.includes('--all');
const RAICES = args.filter((a) => a !== '--all');
if (RAICES.length === 0) {
  console.error('uso: node check-portable.cjs <fichero o directorio> [more…] [--all]');
  process.exit(2);
}

const PATRONES = [
  [/[A-Za-z]:\\[^\s"']{0,120}/, 'ruta absoluta de Windows'],
  [/\/(Users|home)\/[^\s"']{0,80}/, 'ruta de usuario (Unix)'],
  [/sk-[A-Za-z0-9]{16,}|gho_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{20,}|nvapi-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,}/, 'posible credencial'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'clave privada'],
];

/** Rutas de ejemplo, marcadas como tales en la documentacion. */
const EJEMPLOS = /C:\\(ruta|…|\.\.\.|<)|\/ruta\//;

const hallazgos = [];
let ficheros = 0;

function revisar(file) {
  const st = fs.statSync(file);
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(file, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      revisar(path.join(file, e.name));
    }
    return;
  }
  if (!TODOS && !file.endsWith('.json')) return;
  // El propio comprobador contiene los patrones que busca: no se revisa a si mismo.
  if (path.basename(file) === 'check-portable.cjs') return;
  if (st.size > 16 * 1024 * 1024) return;
  ficheros++;
  const lineas = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lineas.forEach((linea, i) => {
    if (EJEMPLOS.test(linea)) return;
    for (const [re, que] of PATRONES) {
      const m = re.exec(linea);
      if (m) {
        hallazgos.push({ file, linea: i + 1, que, muestra: m[0].slice(0, 100) });
        break;
      }
    }
  });
}

for (const raiz of RAICES) revisar(raiz);

console.log('ficheros revisados : ' + ficheros);
console.log('hallazgos          : ' + hallazgos.length);
for (const h of hallazgos) console.log(`${h.file}:${h.linea}\t[${h.que}]\t${h.muestra}`);

if (hallazgos.length) {
  console.log('\nRESULTADO: FALLO — algo de la maquina local se colaria en la publicacion');
  process.exit(1);
}
console.log('\nRESULTADO: OK');
