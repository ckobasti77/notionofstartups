/**
 * Sklapa `dist/editor.js` + `template.html` u jedan HTML string i upisuje ga u
 * `src/lib/note-editor-html.ts`.
 *
 * Postupak je isti kao `@10play/tentap-editor/scripts/buildEditor.js`: fajl se
 * commituje, a Metro ga pakuje kao običan string. `JSON.stringify` je jedini
 * bezbedan način da HTML uđe u TS izvor — sadrži i backtick i `${`.
 *
 * Pokreće se kroz `npm run editor:build --workspace @devotion/mobile`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(here, 'dist/editor.js');
const templatePath = path.join(here, 'template.html');
const outPath = path.join(here, '../src/lib/note-editor-html.ts');

const script = readFileSync(scriptPath, 'utf8');
const template = readFileSync(templatePath, 'utf8');

/**
 * Provera da bundle stvarno nosi ono zbog čega postoji. Nula bilo gde znači da
 * je alias ili lista bridge-ova otišla u stranu — bolje pasti ovde nego pustiti
 * editor koji tiho briše tabele.
 */
const REQUIRED = ['tableRow', 'codeBlock', 'data-note-file', 'horizontalRule'];
const missing = REQUIRED.filter((needle) => !script.includes(needle));
if (missing.length > 0) {
  console.error(`Bundle ne sadrži: ${missing.join(', ')} — build se odbija.`);
  process.exit(1);
}

// `</script` unutar JS stringa prekida inline skriptu u HTML parseru. `<\/` je
// unutar string literala identično, pa je zamena bezbedna; van stringa se ta
// sekvenca u minifikovanom kodu ne pojavljuje (provereno brojem pogodaka).
const closingTags = script.match(/<\/script/gi);
const safeScript = script.replace(/<\/script/gi, '<\\/script');
if (closingTags !== null) {
  console.log(`Zamenjeno ${closingTags.length} „</script" pojavljivanja u kodu.`);
}

const html = template.replace(
  '<div id="root"></div>',
  `<div id="root"></div>\n    <script>${safeScript}</script>`,
);
if (!html.includes('<script>')) {
  console.error('Šablon nema mesto za skriptu (`<div id="root"></div>`).');
  process.exit(1);
}

const content =
  '// GENERISANO — ne uređuj ručno. Izvor: apps/mobile/editor-web/.\n' +
  '// Regeneracija: npm run editor:build --workspace @devotion/mobile\n' +
  '/* eslint-disable */\n' +
  `export const NOTE_EDITOR_HTML = ${JSON.stringify(html)};\n`;

writeFileSync(outPath, content);
console.log(
  `Editor bundle: ${(html.length / 1024).toFixed(0)} KB → src/lib/note-editor-html.ts`,
);
