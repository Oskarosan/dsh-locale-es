/**
 * Extractor de diccionarios de idioma de los bundles cliente de DSH.
 *
 * Los bundles son fabricas lazy-CJS con la forma:
 *   window.__ModuleLoader__.load({ id, factory: (require) => { ...; return module.exports } })
 *
 * Ejecutamos cada fabrica con un `require` y un `ctx` simulados para capturar
 * todas las llamadas a `ctx.locale.register(...)` y quedarnos con en/zh.
 *
 * Uso: node extract-locale.cjs <raiz @deepseek-ai> <salida.json>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * Prototipo terminal universal: cualquier propiedad que se consulte sobre el
 * responde con otro stub invocable, y su propia cadena de prototipos termina.
 * Es lo que rescata a los stubs de `__toESM(mod, 1)`, que reconstruye el modulo
 * con `Object.create(Object.getPrototypeOf(mod))` y no copia propiedades.
 */
let TERMINAL_PROTO = null;
function terminalProto() {
  if (TERMINAL_PROTO) return TERMINAL_PROTO;
  const cache = new Map();
  TERMINAL_PROTO = new Proxy(function () {}, {
    get(t, prop) {
      if (prop === Symbol.toPrimitive) return () => 'proto';
      if (prop === 'then') return undefined;
      if (typeof prop === 'symbol') return undefined;
      if (!cache.has(prop)) cache.set(prop, universal('proto.' + String(prop)));
      return cache.get(prop);
    },
    apply() {
      return universal('proto()');
    },
    construct() {
      return universal('new proto');
    },
    getPrototypeOf() {
      return null;
    },
    has() {
      return true;
    },
  });
  return TERMINAL_PROTO;
}

/** Stub universal: invocable, construible y encadenable. */
function universal(name) {
  const target = function () {};
  const cache = new Map();
  return new Proxy(target, {
    get(t, prop) {
      if (prop === Symbol.toPrimitive) return () => name;
      if (prop === Symbol.toStringTag) return 'DshStub';
      if (prop === 'then') return undefined;
      if (prop === '__esModule') return true;
      if (typeof prop === 'symbol') return undefined;
      if (prop === 'toString') return () => name;
      if (!cache.has(prop)) cache.set(prop, universal(name + '.' + String(prop)));
      return cache.get(prop);
    },
    apply() {
      return universal(name + '()');
    },
    construct() {
      return universal('new ' + name);
    },
    getPrototypeOf() {
      return terminalProto();
    },
    has() {
      return true;
    },
  });
}

const NATIVE_RE = /^[a-z@][^/]*(\/[^/]+)*$/i;

/**
 * Objeto plano *cross-realm*: los valores creados dentro de `vm.runInContext`
 * tienen como prototipo el Object.prototype del realm del contexto, no el
 * nuestro. Un objeto plano real cumple que el prototipo de su prototipo es null.
 */
function isPlainObject(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  if (proto === null || proto === Object.prototype) return true;
  return Object.getPrototypeOf(proto) === null;
}

/** Convierte a JSON puro; descarta stubs y funciones. */
function plain(v, depth = 0) {
  if (depth > 12) return undefined;
  if (v === null) return null;
  const t = typeof v;
  if (t === 'string' || t === 'number' || t === 'boolean') return v;
  if (t === 'function' || t === 'symbol' || t === 'undefined' || t === 'bigint') return undefined;
  if (Array.isArray(v)) {
    const out = [];
    for (const item of v) {
      const p = plain(item, depth + 1);
      if (p !== undefined) out.push(p);
    }
    return out;
  }
  if (!isPlainObject(v)) return undefined; // stubs de Proxy, Map, etc.
  const out = {};
  for (const k of Object.keys(v)) {
    const p = plain(v[k], depth + 1);
    if (p !== undefined) out[k] = p;
  }
  return out;
}

/**
 * Describe donde fallo una fabrica sin filtrar rutas absolutas de la maquina
 * que hizo la extraccion: el catalogo se publica, asi que los avisos solo
 * llevan el nombre del paquete y la linea.
 */
function where(error, skip = 2) {
  const lines = String(error.stack || '').split('\n').slice(1, 1 + skip);
  return lines
    .map((l) => l.trim().replace(/^at\s+/, ''))
    .map((l) => {
      const m = /^(.*?)\s*\(?(.*?):(\d+):(\d+)\)?$/.exec(l);
      if (!m) return l.replace(/[A-Za-z]:\\[^\s)]*|\/[^\s)]*node_modules/g, '…');
      // Se conserva solo lo que hay desde el ultimo `node_modules` en adelante.
      const ruta = m[2];
      const corte = ruta.lastIndexOf('node_modules');
      const visible = corte >= 0 ? ruta.slice(corte + 'node_modules'.length + 1) : path.basename(ruta);
      return `${m[1]} (${visible}:${m[3]}:${m[4]})`.replace(/\s+/g, ' ').trim();
    })
    .join(' | ');
}

function extractFile(file, pkgName) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\/\/# sourceMappingURL=.*$/m, '');
  // Etiqueta portable del fichero: los errores de la VM la citan, y el catalogo
  // se publica, asi que no puede llevar rutas de la maquina que lo extrajo.
  const etiqueta = pkgName + '/' + path.basename(file);
  let src = raw;
  let loaded = null;

  const makeSandbox = () => {
    const sandbox = {
      console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      queueMicrotask,
      document: undefined,
      navigator: { languages: ['en'], language: 'en' },
      location: { href: 'http://localhost/', origin: 'http://localhost', pathname: '/', hostname: 'localhost', host: 'localhost', protocol: 'http:', port: '' },
      performance: { now: () => 0 },
      fetch: () => Promise.resolve(universal('fetch')),
      TextEncoder,
      TextDecoder,
      AbortController,
      AbortSignal,
      URL,
      URLSearchParams,
      structuredClone,
      atob,
      btoa,
      Blob,
      Event,
      EventTarget,
      MessageChannel,
      crypto: require('crypto').webcrypto,
      ResizeObserver: universal('ResizeObserver'),
      IntersectionObserver: universal('IntersectionObserver'),
      MutationObserver: universal('MutationObserver'),
      requestAnimationFrame: (cb) => setTimeout(() => cb(0), 0),
      cancelAnimationFrame: (id) => clearTimeout(id),
      getComputedStyle: () => universal('style'),
    };
    sandbox.window = {
      __ModuleLoader__: {
        load(o) {
          loaded = o;
        },
      },
      addEventListener() {},
      removeEventListener() {},
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      location: sandbox.location,
      navigator: sandbox.navigator,
    };
    sandbox.self = sandbox.window;
    sandbox.globalThis = sandbox;
    return sandbox;
  };

  const run = (code) => {
    const sandbox = makeSandbox();
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: etiqueta, timeout: 10000 });
  };

  try {
    run(src);
  } catch (error) {
    if (/import\.meta|Cannot use 'import\.meta'/.test(String(error.message))) {
      src = raw.replace(/import\.meta/g, '({ url: "file:///", env: {} })');
      try {
        run(src);
      } catch (retry) {
        return { error: 'run: ' + retry.message + ' @ ' + where(retry) };
      }
    } else {
      return { error: 'run: ' + error.message + ' @ ' + where(error) };
    }
  }

  if (!loaded || typeof loaded.factory !== 'function') return { error: 'sin fabrica' };

  const records = [];
  let mod;
  try {
    mod = loaded.factory((id) => universal('require:' + id));
  } catch (error) {
    return { error: 'factory: ' + error.message + ' @ ' + where(error) };
  }
  if (!mod || typeof mod.apply !== 'function') return { error: 'sin apply' };

  const locale = {
    register(...args) {
      records.push(args);
      return () => {};
    },
    addLanguage() {
      return () => {};
    },
    bind() {
      return (k) => k;
    },
    resolveText(t) {
      return t;
    },
    getLocale() {
      return 'en';
    },
  };

  const ctx = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'locale') return locale;
        if (prop === 'effect') {
          return (fn) => {
            try {
              const r = typeof fn === 'function' ? fn() : undefined;
              if (r && typeof r.next === 'function') r.next();
            } catch {
              /* efectos ajenos al idioma */
            }
            return () => {};
          };
        }
        if (typeof prop === 'symbol') return undefined;
        return universal('ctx.' + String(prop));
      },
      has() {
        return true;
      },
    },
  );

  try {
    const r = mod.apply(ctx);
    if (r && typeof r.then === 'function') r.catch(() => {});
  } catch (error) {
    if (records.length === 0) return { error: 'apply: ' + error.message + ' @ ' + where(error) };
  }

  const found = [];
  for (const args of records) {
    let ns = args[0];
    if (typeof ns !== 'string') continue;
    if (args.length >= 3 && typeof args[1] === 'string') {
      const dict = plain(args[2]);
      if (dict) found.push({ ns, locale: args[1], dict });
      continue;
    }
    const dicts = plain(args[1]);
    if (!dicts) continue;
    if (isPlainObject(dicts)) {
      for (const key of Object.keys(dicts)) {
        const d = dicts[key];
        if (isPlainObject(d)) found.push({ ns, locale: key, dict: d });
      }
    }
  }
  return { found, pkgName };
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(p, out);
    } else if (entry.name === 'client.js' && path.basename(path.dirname(p)) === 'lib') {
      out.push(p);
    }
  }
  return out;
}

/** Recorta un literal `{...}` equilibrado desde la llave de apertura. */
function balanced(src, start) {
  let depth = 0;
  let i = start;
  let str = null;
  let esc = false;
  let tpl = false;
  let line = false;
  let block = false;
  for (; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (line) {
      if (c === '\n') line = false;
      continue;
    }
    if (block) {
      if (c === '*' && n === '/') {
        block = false;
        i++;
      }
      continue;
    }
    if (str) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === str) str = null;
      continue;
    }
    if (tpl) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '`') tpl = false;
      continue;
    }
    if (c === '/' && n === '/') {
      line = true;
      i++;
      continue;
    }
    if (c === '/' && n === '*') {
      block = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      str = c;
      continue;
    }
    if (c === '`') {
      tpl = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Reserva estatica: cuando la fabrica no puede ejecutarse (por ejemplo los
 * plugins que pasan react por `__toESM`), se evaluan los literales
 * `const en = {...}` / `const zh = {...}` y se asocian a cada `locale.register`.
 */
function extractStatic(file) {
  const src = fs.readFileSync(file, 'utf8');
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const constCache = new Map();
  let m;
  /** Resuelve un identificador a su literal `{...}` evaluado, si lo es. */
  const literalOf = (name) => {
    if (constCache.has(name)) return constCache.get(name);
    let value = null;
    const re = new RegExp('\\b(?:const|let|var)\\s+' + escape(name) + '\\s*=\\s*\\{');
    const hit = re.exec(src);
    if (hit) {
      const lit = balanced(src, hit.index + hit[0].length - 1);
      if (lit) {
        try {
          const v = new Function('return (' + lit + ')')();
          if (v && typeof v === 'object' && !Array.isArray(v)) value = v;
        } catch {
          /* literal no evaluable */
        }
      }
    }
    constCache.set(name, value);
    return value;
  };

  const found = [];
  const regRe = /\blocale\.register\(\s*([^,]+?)\s*,\s*\{/g;
  while ((m = regRe.exec(src))) {
    const arg = m[1].trim();
    let ns = null;
    const direct = /^["'`]([^"'`]+)["'`]$/.exec(arg);
    if (direct) ns = direct[1];
    else {
      const idRe = new RegExp('\\b(?:const|let|var)\\s+' + escape(arg) + '\\s*=\\s*["\'`]([^"\'`]+)["\'`]');
      const idm = idRe.exec(src);
      if (idm) ns = idm[1];
    }
    if (!ns) continue;
    const objLit = balanced(src, m.index + m[0].length - 1);
    if (!objLit) continue;
    // `{ zh, en }`, `{ en: chatEn, zh: chatZh }` o `{ "en": {...} }`
    const propRe = /(?:^|[{,])\s*(?:(["'])([A-Za-z0-9_.-]+)\1|([A-Za-z_$][\w$]*))\s*(?::\s*([A-Za-z_$][\w$]*))?/g;
    let p;
    while ((p = propRe.exec(objLit))) {
      const key = p[2] || p[3];
      if (!key || !/^(en|zh)([-_].*)?$/i.test(key)) continue;
      const id = p[4] || p[3];
      if (!id) continue;
      const dict = literalOf(id);
      if (dict && Object.keys(dict).length > 0) {
        found.push({ ns, locale: /^zh/i.test(key) ? 'zh' : 'en', dict });
      }
    }
  }
  return { found };
}

function main() {
  // Los bundles lanzan trabajo asincrono propio (observadores, colas) que puede
  // rechazar sin gestor; eso no debe tumbar la extraccion.
  process.on('unhandledRejection', () => {});
  process.on('uncaughtException', () => {});

  const root = process.argv[2];
  const outFile = process.argv[3];
  const files = walk(root, []).sort();

  const namespaces = {};
  const problems = [];
  const perPlugin = {};
  const methods = {};

  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep);
    const pkgName = rel[1] && rel[0].startsWith('@') ? rel[0] + '/' + rel[1] : rel[0];
    const dynamic = extractFile(file, pkgName);
    let res = dynamic;
    let method = 'dinamico';
    if (dynamic.error || !dynamic.found || dynamic.found.length === 0) {
      const stat = extractStatic(file);
      if (stat.found.length > 0) {
        res = stat;
        method = 'estatico' + (dynamic.error ? ' (fabrica: ' + dynamic.error.slice(0, 70) + ')' : '');
      } else {
        problems.push({ pkg: pkgName, file: rel.join('/'), error: dynamic.error || 'sin diccionarios' });
        continue;
      }
    }
    methods[pkgName] = method;
    let keys = 0;
    for (const { ns, locale, dict } of res.found) {
      if (!namespaces[ns]) namespaces[ns] = { locales: {}, sources: [] };
      if (!namespaces[ns].sources.includes(pkgName)) namespaces[ns].sources.push(pkgName);
      namespaces[ns].locales[locale] = Object.assign(namespaces[ns].locales[locale] || {}, dict);
      if (locale === 'en') keys += Object.keys(dict).length;
    }
    perPlugin[pkgName] = keys;
  }

  let enKeys = 0;
  const summary = [];
  for (const [ns, v] of Object.entries(namespaces)) {
    const en = v.locales.en ? Object.keys(v.locales.en).length : 0;
    const zh = v.locales.zh ? Object.keys(v.locales.zh).length : 0;
    enKeys += en;
    summary.push({ ns, en, zh, sources: v.sources.join(',') });
  }
  summary.sort((a, b) => b.en - a.en);

  const payload = { generatedAt: new Date().toISOString(), namespaces, problems, perPlugin, methods };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));

  console.log('bundle ficheros analizados: ' + files.length);
  console.log('plugins con diccionarios: ' + Object.keys(perPlugin).length);
  console.log('namespaces: ' + summary.length);
  console.log('claves en (total): ' + enKeys);
  console.log('problemas: ' + problems.length);
  console.log('');
  console.log('ns\ten\tzh\tplugins');
  for (const row of summary) console.log(row.ns + '\t' + row.en + '\t' + row.zh + '\t' + row.sources);
  console.log('\n--- METODO POR PLUGIN ---');
  for (const [p, meth] of Object.entries(methods).sort()) console.log(p + ' :: ' + meth);
  if (problems.length) {
    console.log('\n--- PROBLEMAS ---');
    for (const p of problems) console.log(p.pkg + ': ' + p.error);
  }
}

main();
