# dsh-locale-es

Pack de idioma **castellano (es)** para la interfaz de **DeepSeek Harness** (DSH).

- **2.603 de 2.603 claves traducidas (100 %)**, repartidas en **57 namespaces**.
- Entra como **plugin de cliente** del Loader de DSH: **no parchea `app.asar`** ni ningún
  fichero de la aplicación.
- Cualquier clave que falte o que añada una versión nueva de DSH **cae automáticamente al
  inglés**, así que el pack nunca rompe la interfaz.

## Estado

| | |
|---|---|
| Cobertura | 2.603/2.603 claves (100 %), 57/57 namespaces |
| Idioma | `es` — etiqueta «Español», respaldo `en` |
| Paquete | `dsh-locale-es` 1.0.0 |
| Licencia | MIT (ver [LICENSE](LICENSE) y [NOTICE.md](NOTICE.md)) |
| Núcleo de DSH probado | app de escritorio con `app.asar` de 121 MB, 70 plugins de UI |

Las tres comprobaciones se pueden repetir en cualquier momento y no necesitan la aplicación:

```powershell
node tools/build-locale-pack.cjs i18n/catalog.json i18n/es . --check   # cobertura y marcadores
node tools/audit-es.cjs i18n/catalog.json i18n/es                      # claves ausentes y repetidas
node tools/check-portable.cjs i18n                                     # ni rutas ni secretos locales
node tools/verify-pack.cjs lib/client.js                               # ejecuta el bundle como lo hace DSH
```

## Instalación

El perfil de DSH manda: los plugins se declaran en `~/.dsh/profiles/<perfil>/package.json`.
Añade el pack como dependencia **y** como bundle del perfil:

```json
{
  "dependencies": {
    "dsh-locale-es": "link:C:/ruta/a/dsh-locale-es"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-locale-es"
      ]
    }
  }
}
```

Después, en la carpeta del perfil:

```powershell
pnpm install
```

y recarga la interfaz. El idioma se elige en **Ajustes → General → Idioma → Español**.

Notas de la instalación:

- La ruta `link:` es la vía **verificada**. El protocolo `github:Oskarosan/dsh-locale-es`
  debería funcionar igual (pnpm lo resuelve con git), pero no está probado aquí.
- El fichero [cordis.patch.yml](cordis.patch.yml) del paquete es lo que inserta la fila
  `locale-es` en el árbol de plugins; lo aplica DSH al cargar el bundle, no hay que copiarlo
  a mano.
- Si tras instalar el pack no ves «Español» en Ajustes, desactiva y vuelve a activar la fila
  `locale-es` en el gestor de plugins para forzar una revisión nueva del bundle de cliente.
- **Aviso comprobado:** si modificas el perfil **desde dentro de una sesión de DSH**, la
  recarga en caliente dispone esa sesión y la aplicación abre una conversación nueva. Hazlo
  desde fuera o asume que esa conversación se corta (el historial no se pierde).

## Cómo funciona

Los plugins de cliente de DSH son fábricas *lazy-CJS* que el cargador ejecuta en el
navegador:

```js
window.__ModuleLoader__.load({ id, factory: (require) => { /* … */ return module.exports } })
```

`lib/client.js` —generado, no editado a mano— inyecta el servicio `locale` y, cuando está
disponible, registra el idioma y un diccionario por namespace declarando cada registro como
efecto propio del plugin, de modo que se retira limpiamente al descargarlo:

```js
const LANGUAGE = { id: 'es', label: 'Español', fallback: 'en' };

function apply(ctx) {
  ctx.effect(() => ctx.locale.addLanguage(LANGUAGE), 'locale-es: idioma');
  for (const [ns, dict] of Object.entries(DICTIONARIES)) {
    ctx.effect(() => ctx.locale.register(ns, 'es', dict), 'locale-es: ' + ns);
  }
}
```

`lib/index.js` es la mitad host: existe para que el paquete sea una fila cargable del Loader
y para que el escaneo de plugins de cliente encuentre su declaración `dsh.client` del
`package.json`. Todo el trabajo real ocurre en el cliente.

## Estructura del repositorio

```
dsh-locale-es/
├── package.json            ficha del paquete y contrato con el Loader (dsh.bundle / dsh.client)
├── cordis.patch.yml        fila que inserta el plugin en el árbol (generado)
├── lib/
│   ├── client.js           bundle del cliente con los 57 diccionarios (generado)
│   └── index.js            mitad host (generado)
├── i18n/
│   ├── catalog.json        catálogo inglés extraído de la app (claves + textos de origen)
│   └── es/<namespace>.json un fichero por namespace con la traducción castellana
└── tools/                  cadena de herramientas, sin dependencias externas
    ├── extract-app.cjs          extrae el código de app.asar verificando SHA-256
    ├── extract-locale.cjs       extrae los diccionarios en/zh de los plugins de UI
    ├── split-batches.cjs        reparte el catálogo en lotes para traducir en paralelo
    ├── split-by-namespace.cjs   convierte los lotes en un fichero por namespace
    ├── build-locale-pack.cjs    emite lib/ y cordis.patch.yml, e informa de la cobertura
    ├── audit-es.cjs             busca claves ausentes, ficheros mal alineados y repetidas
    ├── check-portable.cjs       evita publicar rutas de la máquina que extrajo el catálogo
    └── verify-pack.cjs          ejecuta el bundle en un cargador simulado y lo comprueba
```

## Flujo de trabajo

### Traducir o corregir

1. Edita `i18n/es/<namespace>.json` (un namespace por fichero).
2. **Conserva los marcadores** `{count}`, `{label}`, `{toolName}`… exactamente como están en
   `i18n/catalog.json`: el compilador rechaza cualquier traducción que pierda o invente uno.
3. Reconstruye y comprueba:

```powershell
node tools/build-locale-pack.cjs i18n/catalog.json i18n/es . --check
node tools/build-locale-pack.cjs i18n/catalog.json i18n/es .
node tools/verify-pack.cjs lib/client.js
```

`--check` sale con código 1 si falta alguna clave o hay marcadores mal, así que sirve como
puerta en integración continua.

### Actualizar el catálogo tras una actualización de DSH

```powershell
node tools/extract-app.cjs "C:\ruta\a\resources\app.asar" _referencia-dsh
node tools/extract-locale.cjs _referencia-dsh/dsh/node_modules/@deepseek-ai i18n/catalog.json
node tools/check-portable.cjs i18n                                     # el catalogo no lleva rutas locales
node tools/build-locale-pack.cjs i18n/catalog.json i18n/es . --check   # lista lo nuevo por traducir
```

Las claves nuevas aparecen como «sin traducir» y en la interfaz se ven en inglés hasta que
alguien las traduzca.

### Empezar otro idioma con este repositorio como plantilla

Haz un *fork* y cambia tres constantes en `tools/build-locale-pack.cjs`
(`PKG_NAME`, `LANG_ID`, `LANG_LABEL`), el identificador de la fila en el generador de
`cordis.patch.yml` (`- id: locale-es`) y los campos `name` del `package.json`. El catálogo
inglés y toda la cadena de herramientas se reutilizan tal cual.

### Traducir en paralelo con agentes o por lotes

```powershell
node tools/split-batches.cjs i18n/catalog.json _i18n/batches     # lotes equilibrados
# … cada lote se traduce a _i18n/es/batch-NN.json …
node tools/split-by-namespace.cjs _i18n/es i18n/es               # vuelve al formato del repositorio
```

## Contribuir

Las correcciones de traducción son bienvenidas, y también los avisos de textos que suenen a
máquina. Lee [CONTRIBUTING.md](CONTRIBUTING.md): es corto y evita que un envío se quede sin
poder fusionar por un marcador perdido.

## Aviso legal

DeepSeek Harness es una aplicación de DeepSeek; este repositorio **no contiene código de la
aplicación**. El catálogo inglés (`i18n/catalog.json`) se extrae de una instalación local
únicamente para poder verificar la cobertura, la paridad de claves y los marcadores. Los
detalles y las marcas están en [NOTICE.md](NOTICE.md). La licencia MIT cubre el contenido
original de este repositorio: las traducciones y las herramientas.

---

## English

Spanish (`es`) language pack for the **DeepSeek Harness** (DSH) web interface: **2,603 of
2,603 keys (100 %) across 57 namespaces**, shipped as a client plugin — the application's
`app.asar` is never patched, and untranslated keys fall back to English automatically.

Install it by adding `dsh-locale-es` to `dependencies` and to `dsh.profile.bundles` in your
DSH profile's `package.json`, then run `pnpm install` in the profile folder and pick
**Español** in *Settings → General → Language*. See [Cómo funciona](#cómo-funciona) for the
plugin protocol, and [CONTRIBUTING.md](CONTRIBUTING.md) to send translation fixes
(keep placeholders such as `{count}` intact). Licensed under MIT.
