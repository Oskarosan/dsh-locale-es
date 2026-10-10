/** Muestra los diccionarios ingleses de los namespaces indicados. */
'use strict';
const fs = require('fs');
const cat = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const ns of process.argv.slice(3)) {
  const entry = cat.namespaces[ns];
  const en = (entry && entry.locales && entry.locales.en) || {};
  console.log('### ' + ns + ' (' + Object.keys(en).length + ')');
  for (const [k, v] of Object.entries(en)) console.log(k + ' = ' + v);
  console.log('');
}
