#!/usr/bin/env node
/**
 * Comprueba los metadatos que DSH lee para pintar la tarjeta de un plugin y para
 * aceptarlo como bundle del perfil. Replica, sin depender de la aplicación, las
 * condiciones que aplica `dsh-app-boot` al leer un plugin:
 *
 *   - `package.json` con `name`, `version`, `description`.
 *   - `dsh.bundle.patch` — sin esto el gestor lo trata como dependencia plana.
 *   - `dsh.client` con `platform` e `inject`, y su `exports["./client"]`.
 *   - `exports` con `.`, `./package.json` y `./locale/*.json` (si falta el mapa de
 *     `locale`, el resolutor ESM devuelve ERR_PACKAGE_PATH_NOT_EXPORTED y la
 *     tarjeta se queda sin título ni descripción).
 *   - `locale/en.json` obligatorio, y cada `locale/<idioma>.json` con
 *     `meta.title` y `meta.description`; el nombre del fichero debe ser un id de
 *     idioma (letras, dígitos, guion o guion bajo).
 *   - `icon` opcional en `package.json`: ruta relativa, dentro del paquete, SVG,
 *     PNG, JPEG o WebP, y como mucho 256 KiB.
 *
 * Uso: node check-plugin-meta.cjs [directorio del paquete]
 *
 * Devuelve 1 si algo falla, para usarlo en integracion continua.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const dir = process.argv[2] ?? '.';
const fallos = [];
const avisos = [];

const pkgPath = path.join(dir, 'package.json');
if (!fs.existsSync(pkgPath)) {
  console.error(`no encuentro ${pkgPath}`);
  process.exit(2);
}
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const exige = (condicion, mensaje) => {
  if (!condicion) fallos.push(mensaje);
};

// --- identidad -------------------------------------------------------------
exige(typeof pkg.name === 'string' && pkg.name.length > 0, 'package.json: falta name');
exige(typeof pkg.version === 'string' && /^\d+\.\d+\.\d+/.test(pkg.version), 'package.json: falta version (o no es semver)');
exige(typeof pkg.description === 'string' && pkg.description.length > 0, 'package.json: falta description (es el texto de reserva de la tarjeta)');

// --- contrato con el Loader ------------------------------------------------
const patch = pkg.dsh?.bundle?.patch;
exige(patch !== undefined, 'package.json: falta dsh.bundle.patch (sin esto DSH lo instala como dependencia plana, no como capa del perfil)');
for (const p of [].concat(patch ?? [])) {
  exige(fs.existsSync(path.join(dir, p)), `dsh.bundle.patch apunta a un fichero que no existe: ${p}`);
}
exige(pkg.dsh?.client !== undefined, 'package.json: falta dsh.client (la mitad navegador del plugin)');
exige(pkg.dsh?.client?.platform === 'web', 'package.json: dsh.client.platform deberia ser "web"');
exige(Array.isArray(pkg.dsh?.client?.inject) && pkg.dsh.client.inject.length > 0, 'package.json: dsh.client.inject vacio');
if (pkg.dsh?.client !== undefined) {
  exige(pkg.exports?.['./client'] !== undefined, 'package.json: declara dsh.client pero no exports["./client"]');
}

// --- mapa de exports ------------------------------------------------------
const exp = pkg.exports ?? {};
exige(exp['.'] !== undefined, 'package.json: falta exports["."]');
exige(exp['./package.json'] !== undefined, 'package.json: falta exports["./package.json"] (sin el no hay metadatos)');
exige(exp['./locale/*.json'] !== undefined, 'package.json: falta exports["./locale/*.json"] (sin el, la tarjeta se queda sin titulo ni descripcion)');
for (const [clave, destino] of Object.entries(exp)) {
  if (clave.includes('*')) continue;
  const fichero = path.join(dir, String(destino).replace(/^\.\//, ''));
  exige(fs.existsSync(fichero), `exports["${clave}"] apunta a un fichero que no existe: ${destino}`);
}

// --- diccionarios de la tarjeta -------------------------------------------
const localeDir = path.join(dir, 'locale');
if (!fs.existsSync(path.join(localeDir, 'en.json'))) {
  fallos.push('falta locale/en.json: es el ancla desde la que DSH descubre los demas idiomas');
} else {
  for (const fichero of fs.readdirSync(localeDir).filter((f) => f.endsWith('.json'))) {
    const idioma = fichero.slice(0, -5);
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(idioma)) fallos.push(`locale/${fichero}: el nombre del fichero debe ser un id de idioma`);
    let datos;
    try {
      datos = JSON.parse(fs.readFileSync(path.join(localeDir, fichero), 'utf8'));
    } catch (error) {
      fallos.push(`locale/${fichero}: JSON invalido (${error.message})`);
      continue;
    }
    if (typeof datos.meta?.title !== 'string' || datos.meta.title.trim() === '') fallos.push(`locale/${fichero}: falta meta.title`);
    if (typeof datos.meta?.description !== 'string' || datos.meta.description.trim() === '') fallos.push(`locale/${fichero}: falta meta.description`);
  }
}

// --- icono ----------------------------------------------------------------
if (pkg.icon !== undefined) {
  const EXTS = new Map([['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp']]);
  const icono = String(pkg.icon);
  if (path.isAbsolute(icono) || /^[A-Za-z][A-Za-z\d+.-]*:/.test(icono)) {
    fallos.push('icon: tiene que ser una ruta relativa');
  } else {
    const destino = path.resolve(dir, icono);
    if (path.relative(path.resolve(dir), destino).startsWith('..')) fallos.push('icon: se sale de la carpeta del paquete');
    else if (!fs.existsSync(destino)) fallos.push(`icon: no existe ${icono}`);
    else {
      if (!EXTS.has(path.extname(destino).toLowerCase())) fallos.push('icon: solo se admiten SVG, PNG, JPEG o WebP');
      const bytes = fs.statSync(destino).size;
      if (bytes > 256 * 1024) fallos.push(`icon: ${bytes} bytes, el tope son 262144`);
    }
  }
} else {
  avisos.push('sin icon: la tarjeta del plugin se vera solo con texto');
}

// --- resultado ------------------------------------------------------------
console.log(`paquete   : ${pkg.name}@${pkg.version}`);
console.log(`carpeta   : ${path.resolve(dir)}`);
console.log(`idiomas   : ${fs.existsSync(localeDir) ? fs.readdirSync(localeDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).join(', ') || '(ninguno)' : '(sin locale/)'}`);
console.log(`icono     : ${pkg.icon ?? '(no declarado)'}`);
console.log(`avisos    : ${avisos.length}`);
for (const a of avisos) console.log('  - ' + a);
console.log(`fallos    : ${fallos.length}`);
for (const f of fallos) console.log('  - ' + f);

if (fallos.length) {
  console.log('\nRESULTADO: FALLO — DSH no leera bien la tarjeta o no aceptara el plugin como bundle');
  process.exit(1);
}
console.log('\nRESULTADO: OK');
