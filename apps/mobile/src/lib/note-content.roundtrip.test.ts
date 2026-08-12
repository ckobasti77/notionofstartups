/**
 * KAPIJA FAZE P2: dokazuje da telo beleške preživi otvaranje i snimanje sa
 * telefona bez gubitka.
 *
 * Zašto baš ovako. Do lanca 6 mobilni editor je belešku sa tabelom, prilogom ili
 * blokom koda otvarao SAMO ZA ČITANJE — jer njegov Tiptap bundle te čvorove nije
 * imao u šemi, pa bi ih parsiranje tiho pojelo, a prvi autosave upisao gubitak u
 * bazu. P2 dodaje čvorove; ovaj test je jedini dokaz da su stvarno tu.
 *
 * Meri se ŠEMA, ne živi WebView: `DOMParser`/`DOMSerializer` iz ProseMirror-a nad
 * `jsdom`-om, tačno ono što Tiptap radi u `generateJSON`/`generateHTML` (paket
 * `@tiptap/html` u repou nije instaliran, pa su dve pomoćne funkcije ovde).
 * Živi `new Editor(...)` NIJE pokrenut — `EditorView` u jsdom-u traži
 * `getClientRects`, kojih nema. To ograničenje je svesno i zapisano.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { getSchema, type Extensions } from '@tiptap/core';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { DOMParser, DOMSerializer, Node as PMNode } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';

import { NOTE_EDITOR_HTML } from '@/lib/note-editor-html';
import { NOTE_BRIDGES, NoteFile } from '@/lib/note-editor-bridges';
import { noteBlockSignature, noteSignatureLoss } from '@/lib/note-content';
import {
  estimateNoteTableHtmlLength,
  NOTE_BODY_LIMIT_SAFETY,
  NOTE_TABLE_MAX_COLS,
  NOTE_TABLE_MAX_ROWS,
  noteTableContent,
} from '@/lib/note-table';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

/**
 * Šema mobilnog editora — izvedena iz ISTE liste koju troše i aplikacija i web
 * bundle. `useTenTap` radi doslovno ovo (`configureTiptapExtensionsOnRunTime`
 * vraća `[tiptapExtension, ...tiptapExtensionDeps]`), samo uz konfiguraciju koja
 * na šemu ne utiče (placeholder tekst).
 */
const MOBILE_EXTENSIONS = NOTE_BRIDGES.flatMap((bridge) => [
  bridge.tiptapExtension,
  ...(bridge.tiptapExtensionDeps ?? []),
]).filter((extension) => extension !== undefined) as Extensions;

/**
 * Šema web editora — ogledalo `apps/web/components/rich-text-editor.tsx:177-190`.
 * Deklarisana ovde jer je original `.tsx` sa React node view-om i lucide
 * ikonicama; test bi ga povukao u ceo web graf. Da deklaracija ne otruli,
 * `čuvari nad web izvorom` niže čitaju taj fajl sa diska.
 */
const WEB_EXTENSIONS: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Placeholder.configure({ placeholder: 'x' }),
  NoteFile,
  TableKit.configure({ table: { resizable: true } }),
];

/** Port `@tiptap/html#generateJSON` (paket nije instaliran). */
function htmlToJson(html: string, extensions: Extensions): unknown {
  const schema = getSchema(extensions);
  const parsed = new window.DOMParser().parseFromString(
    `<body>${html}</body>`,
    'text/html',
  ).body;
  return DOMParser.fromSchema(schema).parse(parsed).toJSON();
}

/** Port `@tiptap/html#generateHTML`. */
function jsonToHtml(json: unknown, extensions: Extensions): string {
  const schema = getSchema(extensions);
  const doc = PMNode.fromJSON(schema, json as Record<string, unknown>);
  const fragment = DOMSerializer.fromSchema(schema).serializeFragment(doc.content, {
    document,
  });
  const container = document.implementation.createHTMLDocument().createElement('div');
  container.appendChild(fragment);
  return container.innerHTML;
}

/**
 * Fikstura izgleda kao STVARAN izlaz weba: beleška napisana na laptopu koja nosi
 * sve što je mobilni do sada odbijao. Bez `<h4>` (web sužava naslove na 1–3, a
 * mobilni ih ima 1–6) i bez `<img>`/boje (web ih nema u šemi) — te razlike su
 * poznate i namerne, pa ne pripadaju testu pariteta.
 */
const FIXTURE = [
  '<h1>Plan lansiranja</h1>',
  '<p>Uvod sa <strong>podebljanim</strong>, <em>kurzivom</em> i <a href="https://devotion.app">linkom</a>.</p>',
  '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Prvi korak</p></div></li>',
  '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Drugi korak</p></div></li></ul>',
  '<blockquote><p>Citat iz razgovora sa korisnikom.</p></blockquote>',
  '<hr>',
  '<pre><code class="language-ts">const a = 1;\nconsole.log(a);</code></pre>',
  '<table><colgroup><col><col style="width: 220px;"></colgroup>',
  '<tbody><tr><th colspan="1" rowspan="1"><p>Faza</p></th><th colspan="1" rowspan="1"><p>Rok</p></th></tr>',
  '<tr><td colspan="1" rowspan="1"><p>Alfa</p></td><td colspan="1" rowspan="1"><p>15.09.</p></td></tr></tbody></table>',
  '<div data-note-file="" data-file-id="k17abc" data-category="image" data-name="ekran.png" data-size="20480">ekran.png</div>',
  '<p>Zaključak.</p>',
].join('');

describe('šema mobilnog editora beleške', () => {
  it('nosi tabelu, blok koda, prilog i vodoravnu crtu', () => {
    const schema = getSchema(MOBILE_EXTENSIONS);
    for (const nodeName of [
      'table',
      'tableRow',
      'tableCell',
      'tableHeader',
      'codeBlock',
      'noteFile',
      'horizontalRule',
      'taskList',
      'taskItem',
    ]) {
      expect(Object.keys(schema.nodes)).toContain(nodeName);
    }
  });

  it('lista bridge-ova ima jedinstvena imena (inače poslednji tiho pobedi)', () => {
    const names = NOTE_BRIDGES.map((bridge) => bridge.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(['tableKit', 'codeBlock', 'noteFile']));
  });
});

describe('round-trip tela beleške', () => {
  it('otvori → snimi bez izmene → JSON je identičan', () => {
    const first = htmlToJson(FIXTURE, MOBILE_EXTENSIONS);
    const saved = jsonToHtml(first, MOBILE_EXTENSIONS);
    const second = htmlToJson(saved, MOBILE_EXTENSIONS);
    expect(second).toEqual(first);
  });

  it('ništa ne nestaje: mobilni JSON je isti kao web JSON', () => {
    expect(htmlToJson(FIXTURE, MOBILE_EXTENSIONS)).toEqual(
      htmlToJson(FIXTURE, WEB_EXTENSIONS),
    );
  });

  it('serijalizovan HTML i dalje nosi sve blokove', () => {
    const saved = jsonToHtml(htmlToJson(FIXTURE, MOBILE_EXTENSIONS), MOBILE_EXTENSIONS);
    expect(saved).toContain('<table');
    expect(saved).toContain('<pre');
    expect(saved).toContain('data-note-file');
    expect(saved).toContain('<hr');
    expect(saved).toContain('language-ts');
    expect(saved).toContain('data-type="taskList"');
  });
});

describe('čuvar gubitka (noteSignatureLoss)', () => {
  it('ne javlja gubitak na punom round-tripu', () => {
    const saved = jsonToHtml(htmlToJson(FIXTURE, MOBILE_EXTENSIONS), MOBILE_EXTENSIONS);
    expect(
      noteSignatureLoss(noteBlockSignature(FIXTURE), noteBlockSignature(saved)),
    ).toEqual([]);
  });

  it('rast (npr. colgroup, prazan pasus na kraju) NIJE gubitak', () => {
    const before = noteBlockSignature('<p>a</p>');
    const after = noteBlockSignature('<p>a</p><table></table><p></p>');
    expect(noteSignatureLoss(before, after)).toEqual([]);
  });

  it('puca kad šema pojede tabelu', () => {
    // Šema bez `TableKit` — tačno ono što je mobilni bio pre ove faze.
    const withoutTable = MOBILE_EXTENSIONS.filter(
      (extension) => extension.name !== 'tableKit',
    );
    const saved = jsonToHtml(htmlToJson(FIXTURE, withoutTable), withoutTable);
    expect(
      noteSignatureLoss(noteBlockSignature(FIXTURE), noteBlockSignature(saved)),
    ).toContain('table');
  });

  it('puca kad šema pojede prilog i blok koda', () => {
    const withoutFileAndCode = MOBILE_EXTENSIONS.filter(
      (extension) => extension.name !== 'noteFile' && extension.name !== 'codeBlock',
    );
    const saved = jsonToHtml(
      htmlToJson(FIXTURE, withoutFileAndCode),
      withoutFileAndCode,
    );
    const loss = noteSignatureLoss(noteBlockSignature(FIXTURE), noteBlockSignature(saved));
    expect(loss).toContain('attachment');
    expect(loss).toContain('codeBlock');
  });
});

describe('čuvari nad web izvorom (da lokalna kopija šeme ne otruli)', () => {
  const readWeb = (relative: string) =>
    readFileSync(path.join(REPO_ROOT, relative), 'utf8');

  it('web editor i dalje koristi isti skup ekstenzija', () => {
    const source = readWeb('apps/web/components/rich-text-editor.tsx');
    for (const marker of [
      'StarterKit.configure(',
      'heading: { levels: [1, 2, 3] }',
      'link: { openOnClick: false }',
      'TaskList',
      'TaskItem.configure({ nested: true })',
      'NoteFile',
      'TableKit.configure({ table: { resizable: true } })',
    ]) {
      expect(source).toContain(marker);
    }
  });

  it('web `noteFile` čvor se serijalizuje isto kao mobilna kopija', () => {
    const source = readWeb('apps/web/components/workspace/files/note-file-node.tsx');
    for (const marker of [
      'name: "noteFile"',
      'atom: true',
      'div[data-note-file]',
      'mergeAttributes({ "data-note-file": "" }, HTMLAttributes)',
      '"data-file-id"',
      '"data-category"',
      '"data-name"',
      '"data-size"',
    ]) {
      expect(source).toContain(marker);
    }
  });
});

describe('uvoz tabele u telo (note-table.ts)', () => {
  it('matrica postaje čvor koji šema prihvata i serijalizuje kao tabelu', () => {
    const node = noteTableContent(
      [
        ['Faza', 'Rok'],
        ['Alfa', '15.09.'],
        ['Beta', ''],
      ],
      true,
    );
    expect(node.content[0].content[0].type).toBe('tableHeader');
    expect(node.content[1].content[0].type).toBe('tableCell');
    // Prazna ćelija ide bez `content` — inače Tiptap odbija prazan `text` čvor.
    expect(node.content[2].content[1].content[0].content).toBeUndefined();

    const html = jsonToHtml(
      { type: 'doc', content: [node] },
      MOBILE_EXTENSIONS,
    );
    expect(html).toContain('<table');
    expect(html).toContain('Alfa');
    expect(htmlToJson(html, MOBILE_EXTENSIONS)).toEqual(
      htmlToJson(html, WEB_EXTENSIONS),
    );
  });

  it('procena dužine raste sa sadržajem (odbija uvoz pre upisa)', () => {
    const small = estimateNoteTableHtmlLength([['a']]);
    const big = estimateNoteTableHtmlLength([['a'.repeat(500)]]);
    expect(big).toBeGreaterThan(small);
    expect(small).toBeGreaterThan(0);
  });

  it('web kopija iste funkcije i istih granica se nije razišla', () => {
    const tableFile = readFileSync(
      path.join(REPO_ROOT, 'apps/web/lib/table-file.ts'),
      'utf8',
    );
    for (const marker of [
      'firstRowIsHeader && rowIndex === 0',
      '("tableHeader" as const)',
      '("tableCell" as const)',
      'let total = 250;',
      'total += 44 + cell.length;',
    ]) {
      expect(tableFile).toContain(marker);
    }
    const dialog = readFileSync(
      path.join(REPO_ROOT, 'apps/web/components/workspace/tables/note-table-import-dialog.tsx'),
      'utf8',
    );
    expect(dialog).toContain(`NOTE_TABLE_MAX_ROWS = ${NOTE_TABLE_MAX_ROWS}`);
    expect(dialog).toContain(`NOTE_TABLE_MAX_COLS = ${NOTE_TABLE_MAX_COLS}`);
    expect(dialog).toContain('BODY_LIMIT_SAFETY = 78_000');
    expect(NOTE_BODY_LIMIT_SAFETY).toBe(78_000);
  });
});

describe('izgrađen web bundle', () => {
  it('nosi nove ekstenzije (inače je editor stariji od šeme)', () => {
    for (const marker of ['tableRow', 'codeBlock', 'data-note-file', 'horizontalRule']) {
      expect(NOTE_EDITOR_HTML).toContain(marker);
    }
  });

  it('nema `react-native` u sebi (alias vodi na web izvor paketa)', () => {
    expect(NOTE_EDITOR_HTML).not.toContain('react-native/Libraries');
  });
});
