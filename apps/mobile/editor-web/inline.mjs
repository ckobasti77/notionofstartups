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

/**
 * Zamena ide kroz FUNKCIJU, ne kroz string. `String.replace` u string-zameni
 * tumači `$&`, `` $` ``, `$'` i `$$` kao naredbe: `` $` `` ubacuje ceo tekst PRE
 * pogotka, `$&` sam pogodak, `$$` se skuplja na jedan `$`. Minifikovani bundle
 * piše stringove kao template literale, pa `` $` `` u njemu ima na desetine —
 * sa string-zamenom se šablon ubaci toliko puta, `<script>` ostane nezatvoren i
 * WebView padne na „Uncaught SyntaxError" pre nego što React uopšte montira.
 * Funkcija-zamena ne tumači ništa (MDN: „specialna zamena se ne primenjuje").
 */
const html = template.replace(
  '<div id="root"></div>',
  () => `<div id="root"></div>\n    <script>${safeScript}</script>`,
);

/**
 * Kapija koja bi gornji kvar uhvatila i pre uređaja. Provera „ima li `<script>`"
 * je propuštala, jer iskvaren izlaz IMA script tag — samo ih ima 33 i nijedan
 * zatvoren. Meri se ono što HTML parser stvarno gleda: tačno jedan dokument i
 * tačno jedan par script tagova.
 */
const counts = {
  doctype: (html.match(/<!DOCTYPE/gi) ?? []).length,
  html: (html.match(/<html\b/gi) ?? []).length,
  root: (html.match(/<div id="root">/g) ?? []).length,
  close: (html.match(/<\/script\s*>/gi) ?? []).length,
};
if (counts.doctype !== 1 || counts.html !== 1 || counts.root !== 1 || counts.close !== 1) {
  console.error(
    `Iskvaren izlaz — očekivano po 1, dobijeno: <!DOCTYPE ${counts.doctype}, ` +
      `<html ${counts.html}, #root ${counts.root}, </script> ${counts.close}.`,
  );
  process.exit(1);
}
if (!html.includes(safeScript)) {
  console.error('Skripta nije ušla u HTML doslovno — zamena je nešto pojela.');
  process.exit(1);
}

/**
 * Otvoreno `<script` u kodu (React ga ima: `o.innerHTML = "<script><\/script>"`)
 * je bezopasno SAMO dok u skripti nema `<!--`. Zajedno ta dva HTML parser guraju
 * u „script data double escaped" stanje, u kom `</script>` više ne zatvara
 * element — isti ishod kao kvar iznad, samo teže vidljiv.
 */
if (safeScript.includes('<!--')) {
  console.error('Skripta sadrži `<!--` — u kombinaciji sa `<script` razbija HTML parser.');
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
