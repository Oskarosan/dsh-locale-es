# Historial de cambios

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto se
acoge a [Versionado semántico](https://semver.org/lang/es/): la versión mayor cambia cuando
cambia el contrato con el Loader de DSH, la menor al añadir idioma o cobertura, y la de
parche al corregir traducciones.

## [1.0.0] — 2026-10-10

Primera publicación.

### Añadido

- Traducción completa al castellano de la interfaz: **2.603 claves** en **57 namespaces**
  (cobertura 100 % sobre el catálogo de la app de escritorio con `app.asar` de 121 MB).
- Pack instalable como plugin de cliente, con respaldo automático a inglés para cualquier
  clave ausente.
- Cadena de herramientas sin dependencias: `extract-app.cjs`, `extract-locale.cjs`,
  `split-batches.cjs`, `split-by-namespace.cjs`, `build-locale-pack.cjs`, `audit-es.cjs` y
  `verify-pack.cjs`.
- Comprobación estricta de cobertura, marcadores y claves repetidas con código de salida
  utilizable en integración continua.
- Integración continua que reconstruye el bundle y falla si el fichero versionado no
  coincide con las fuentes de traducción.
