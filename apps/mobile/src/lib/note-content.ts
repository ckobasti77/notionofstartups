/**
 * Telo beleške — isti format kao na webu: **HTML koji proizvodi Tiptap**
 * (`apps/web/components/rich-text-editor.tsx`), snimljen u `pageBodies.content`.
 * Mobilni ga NE konvertuje ni u markdown ni u JSON — svaka konverzija bi gubila
 * blokove koje ne razume (vidi `noteBlockSignature`).
 */

/**
 * Granica servera — `cleanPageContent` u
 * `packages/backend/convex/lib/page_creation.ts` baca preko 80.000 znakova.
 * Ogledalo je ovde da autosave ne bi ulazio u petlju „pokušaj → greška".
 */
export const NOTE_CONTENT_LIMIT = 80_000;

/** Prazan Tiptap dokument. Editor nikad ne snima goli prazan string. */
export const EMPTY_NOTE_HTML = '<p></p>';

/**
 * „Potpis" tela — koliko kojih blokova ima u HTML-u.
 *
 * Zamena za nekadašnji `unsupportedNoteBlocks()`, koji je nabrajao blokove za
 * koje se ZNALO da ih tentap bundle nema (tabela, prilog, blok koda) i zbog njih
 * otvarao belešku samo za čitanje. Od lanca 6 / P2 mobilni ima sopstveni bundle
 * sa istom Tiptap šemom kao web, pa zabrana više nema smisla — ali provera ima.
 *
 * Ovaj čuvar ne zna šta je „nepodržano": on MERI stvaran gubitak. Uporedi se
 * telo pre učitavanja u editor i telo koje editor vrati; ako je nečega manje,
 * telo se ne snima. Zato preživi i sledeću promenu šeme na webu.
 *
 * Namerno regex, ne parser: React Native nema DOM, a ulaz je Tiptap HTML.
 */
const NOTE_BLOCK_PATTERNS = [
  ['table', /<table[\s/>]/gi],
  ['attachment', /data-note-file/gi],
  ['codeBlock', /<pre[\s/>]/gi],
  ['horizontalRule', /<hr[\s/>]/gi],
  ['image', /<img[\s/>]/gi],
  ['blockquote', /<blockquote[\s/>]/gi],
  ['taskList', /data-type="taskList"/gi],
  ['list', /<[uo]l[\s/>]/gi],
  ['heading', /<h[1-6][\s/>]/gi],
] as const;

export type NoteBlockKind = (typeof NOTE_BLOCK_PATTERNS)[number][0];

/** Imena blokova u akuzativu — ulaze u rečenicu „…sadrži tabelu i prilog". */
const NOTE_BLOCK_LABEL: Record<NoteBlockKind, string> = {
  table: 'tabelu',
  attachment: 'prilog',
  codeBlock: 'blok koda',
  horizontalRule: 'vodoravnu crtu',
  image: 'sliku',
  blockquote: 'citat',
  taskList: 'čekiranu listu',
  list: 'listu',
  heading: 'naslov',
};

export function noteBlockSignature(html: string): Record<NoteBlockKind, number> {
  const signature = {} as Record<NoteBlockKind, number>;
  for (const [kind, pattern] of NOTE_BLOCK_PATTERNS) {
    signature[kind] = html ? (html.match(pattern)?.length ?? 0) : 0;
  }
  return signature;
}

/**
 * Blokovi kojih posle ima MANJE nego pre. Rast je uredu i očekivan — Tiptap
 * dodaje `<colgroup>` u tabelu i prazan `<p>` na kraj (`trailingNode`).
 */
export function noteSignatureLoss(
  before: Record<NoteBlockKind, number>,
  after: Record<NoteBlockKind, number>,
): NoteBlockKind[] {
  return NOTE_BLOCK_PATTERNS.map(([kind]) => kind).filter(
    (kind) => (after[kind] ?? 0) < (before[kind] ?? 0),
  );
}

/** „tabelu", „tabelu i prilog", „tabelu, prilog i blok koda". */
export function noteBlockLossSentence(blocks: NoteBlockKind[]): string {
  const labels = blocks.map((block) => NOTE_BLOCK_LABEL[block]);
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} i ${labels[labels.length - 1]}`;
}

/**
 * Čist tekst iz HTML tela — za kopiranje nacrta i za proveru „ima li išta".
 * Namerno regex, ne parser: na React Native nema DOM-a, a ovde je dovoljno
 * pouzdano (izlaz je Tiptap HTML, ne proizvoljan dokument).
 */
export function noteHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|tr|blockquote|pre)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Prazno telo: nema teksta i nema atomskog bloka (prilog, tabela, slika). */
export function isEmptyNoteHtml(html: string): boolean {
  if (!html.trim()) return true;
  if (/<(?:img|table|hr)[\s/>]/i.test(html) || /data-note-file/i.test(html)) return false;
  return noteHtmlToText(html) === '';
}

/**
 * Da li su dva tela ista *sadržinski*. Server prazno telo čuva kao `""`, a
 * Tiptap ga serijalizuje kao `<p></p>` — bez ovoga bi otvaranje prazne beleške
 * odmah izgledalo kao izmena i pokrenulo autosave bez razloga.
 */
export function noteContentEquals(a: string, b: string): boolean {
  if (a === b) return true;
  return isEmptyNoteHtml(a) && isEmptyNoteHtml(b);
}

/** Podskup tokena teme koji ulazi u CSS beleške (čitanje i editor). */
export type NoteDocumentColors = {
  background: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  muted: string;
  surface: string;
  primary: string;
};

/**
 * Telo za `WebView` u režimu čitanja. Sve boje dolaze iz tokena teme, a ne iz
 * `globals.css` weba — mobilna paleta je namerno drugačija (vidi `theme/tokens.ts`).
 *
 * `bottomInset` je razmak za home indicator; WebView viewport je u dp, pa se
 * inset upisuje direktno kao px.
 */
export function noteReaderDocument({
  html,
  colors,
  scheme,
  bottomInset = 0,
}: {
  html: string;
  colors: NoteDocumentColors;
  scheme: 'light' | 'dark';
  bottomInset?: number;
}): string {
  return `<!DOCTYPE html>
<html lang="sr"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
<style>
  :root { color-scheme: ${scheme}; }
  html, body { margin: 0; padding: 0; background: ${colors.background}; }
  body {
    color: ${colors.foreground};
    font: 400 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 16px 16px ${24 + bottomInset}px;
    -webkit-text-size-adjust: 100%;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  p { margin: 0 0 12px; }
  h1 { font-size: 26px; line-height: 1.25; margin: 20px 0 10px; font-weight: 700; }
  h2 { font-size: 21px; line-height: 1.3; margin: 18px 0 8px; font-weight: 700; }
  h3 { font-size: 18px; line-height: 1.35; margin: 16px 0 8px; font-weight: 600; }
  h1:first-child, h2:first-child, h3:first-child, p:first-child { margin-top: 0; }
  ul, ol { margin: 0 0 12px; padding-left: 22px; }
  li { margin: 4px 0; }
  ul[data-type="taskList"] { list-style: none; padding-left: 2px; }
  ul[data-type="taskList"] li { display: flex; gap: 8px; align-items: flex-start; }
  ul[data-type="taskList"] li > label { flex: 0 0 auto; }
  ul[data-type="taskList"] li > div { flex: 1 1 auto; min-width: 0; }
  blockquote {
    margin: 0 0 12px; padding: 2px 0 2px 14px;
    border-left: 3px solid ${colors.border}; color: ${colors.mutedForeground};
  }
  code {
    background: ${colors.muted}; border-radius: 4px; padding: 1px 5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px;
  }
  pre {
    background: ${colors.muted}; border: 1px solid ${colors.border};
    border-radius: 10px; padding: 12px; overflow-x: auto; margin: 0 0 12px;
  }
  pre code { background: none; padding: 0; font-size: 13.5px; line-height: 1.5; }
  a { color: ${colors.primary}; }
  hr { border: 0; border-top: 1px solid ${colors.border}; margin: 20px 0; }
  img, video { max-width: 100%; height: auto; border-radius: 10px; }
  table {
    border-collapse: collapse; width: 100%; margin: 0 0 12px;
    display: block; overflow-x: auto; font-size: 14px;
  }
  th, td {
    border: 1px solid ${colors.border}; padding: 7px 9px;
    text-align: left; vertical-align: top; min-width: 96px;
  }
  th { background: ${colors.surface}; font-weight: 600; }
  /* Prilog: u HTML-u je goli div sa imenom fajla — ovde postaje čitljiv čip. */
  [data-note-file] {
    display: block; margin: 0 0 12px; padding: 12px 14px;
    border: 1px solid ${colors.border}; border-radius: 10px;
    background: ${colors.surface}; color: ${colors.foreground};
    font-size: 14px; font-weight: 600;
  }
  [data-note-file]::before { content: "📎 "; }
</style>
</head><body>${html}</body></html>`;
}

/**
 * CSS koji se ubrizgava u tentap WebView (`editor.injectCSS`). Isti tipografski
 * ritam kao `noteReaderDocument` — čitanje i pisanje ne smeju da izgledaju kao
 * dva različita dokumenta.
 *
 * `margin-bottom` (a ne `padding-bottom`) na `.ProseMirror`: tentap sam upisuje
 * inline `padding-bottom` radi izbegavanja tastature, pa bi ga padding iz CSS-a
 * izgubio bitku (i obrnuto — mi bismo pokvarili njegovo računanje).
 */
export function noteEditorCss({
  colors,
  bottomInset = 0,
}: {
  colors: NoteDocumentColors;
  bottomInset?: number;
}): string {
  return `
  html, body { background: ${colors.background}; }
  .ProseMirror {
    color: ${colors.foreground};
    background: ${colors.background};
    font: 400 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 12px 16px 0;
    margin-bottom: ${32 + bottomInset}px;
    caret-color: ${colors.primary};
    -webkit-text-size-adjust: 100%;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  .ProseMirror:focus { outline: none; }
  .ProseMirror p { margin: 0 0 12px; }
  .ProseMirror h1 { font-size: 26px; line-height: 1.25; margin: 20px 0 10px; font-weight: 700; }
  .ProseMirror h2 { font-size: 21px; line-height: 1.3; margin: 18px 0 8px; font-weight: 700; }
  .ProseMirror h3 { font-size: 18px; line-height: 1.35; margin: 16px 0 8px; font-weight: 600; }
  .ProseMirror > :first-child { margin-top: 0; }
  .ProseMirror ul, .ProseMirror ol { margin: 0 0 12px; padding-left: 22px; }
  .ProseMirror li { margin: 4px 0; }
  .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 2px; }
  .ProseMirror ul[data-type="taskList"] li { display: flex; gap: 8px; align-items: flex-start; }
  .ProseMirror ul[data-type="taskList"] li > div { flex: 1 1 auto; min-width: 0; }
  .ProseMirror blockquote {
    margin: 0 0 12px; padding: 2px 0 2px 14px;
    border-left: 3px solid ${colors.border}; color: ${colors.mutedForeground};
  }
  .ProseMirror code {
    background: ${colors.muted}; color: ${colors.foreground};
    border-radius: 4px; padding: 1px 5px; font-size: 14px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .ProseMirror a { color: ${colors.primary}; }
  .ProseMirror img { max-width: 100%; height: auto; border-radius: 10px; }
  .ProseMirror pre {
    background: ${colors.muted}; border: 1px solid ${colors.border};
    border-radius: 10px; padding: 12px; overflow-x: auto; margin: 0 0 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .ProseMirror pre code {
    background: none; padding: 0; font-size: 13.5px; line-height: 1.5;
    color: ${colors.foreground};
  }
  .ProseMirror hr { border: 0; border-top: 1px solid ${colors.border}; margin: 20px 0; }
  .ProseMirror hr.ProseMirror-selectednode { border-top-color: ${colors.primary}; }
  /* Tabela: bez vidljivih ivica se u editoru ne vidi ni gde je ćelija.
     min-width po ćeliji drži je čitljivom na uskom ekranu; ceo blok se skroluje
     vodoravno. table-layout: fixed je uslov da colgroup širine iz web tela važe. */
  .ProseMirror .tableWrapper { overflow-x: auto; margin: 0 0 12px; }
  .ProseMirror table {
    border-collapse: collapse; table-layout: fixed; width: 100%;
    margin: 0 0 12px; font-size: 14px; overflow: hidden;
  }
  .ProseMirror th, .ProseMirror td {
    border: 1px solid ${colors.border}; padding: 7px 9px;
    text-align: left; vertical-align: top; min-width: 96px; position: relative;
  }
  .ProseMirror th { background: ${colors.surface}; font-weight: 600; }
  .ProseMirror th > p, .ProseMirror td > p { margin: 0; }
  /* ProseMirror-tables obeležava izabranu ćeliju ovom klasom — bez sloja preko
     nje se na telefonu ne vidi u kojoj si ćeliji. */
  .ProseMirror .selectedCell:after {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background: ${colors.primary}26;
  }
  /* Prilog u telu. Node view crta ili sliku ili čip — oba dobijaju isti okvir.
     Selektor [data-note-file] je rezerva ako node view ne stigne. */
  .ProseMirror [data-note-file-view], .ProseMirror [data-note-file] {
    display: block; margin: 12px 0;
  }
  .ProseMirror [data-note-file-view] img { display: block; margin: 0 auto; }
  .ProseMirror [data-note-file-chip], .ProseMirror [data-note-file] {
    display: block; padding: 12px 14px;
    border: 1px solid ${colors.border}; border-radius: 10px;
    background: ${colors.surface}; color: ${colors.foreground};
    font-size: 14px; font-weight: 600;
  }
  .ProseMirror [data-note-file]::before { content: "📎 "; }
  .ProseMirror .ProseMirror-selectednode [data-note-file-chip],
  .ProseMirror [data-note-file-view].ProseMirror-selectednode {
    outline: 2px solid ${colors.primary}; outline-offset: 1px; border-radius: 10px;
  }
  /* Gapcursor: bez ovoga kursor ISPRED ili IZA tabele postoji ali se ne vidi, pa
     izgleda kao da se iz tabele ne može izaći. Pravila su iz
     prosemirror-gapcursor/style/gapcursor.css (paket nosi samo logiku).
     BEZ BACKTICK-a u ovom stringu: injectCSS ga umeće u template literal
     (RichText/utils.ts:14), pa bi backtick prekinuo injektovani JS. */
  .ProseMirror-gapcursor { display: none; pointer-events: none; position: absolute; margin: 0; }
  .ProseMirror-gapcursor:after {
    content: ""; display: block; position: absolute; top: -2px; width: 20px;
    border-top: 2px solid ${colors.primary};
  }
  .ProseMirror-focused .ProseMirror-gapcursor { display: block; }
  /* Tiptap Placeholder ekstenzija (prazan prvi pasus). */
  .ProseMirror p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    color: ${colors.mutedForeground};
    float: left; height: 0; pointer-events: none;
  }
  ::selection { background: ${colors.primary}55; }
`;
}
