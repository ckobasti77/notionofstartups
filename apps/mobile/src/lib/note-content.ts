/**
 * Telo beleške — isti format kao na webu: **HTML koji proizvodi Tiptap**
 * (`apps/web/components/rich-text-editor.tsx`), snimljen u `pageBodies.content`.
 * Mobilni ga NE konvertuje ni u markdown ni u JSON — svaka konverzija bi gubila
 * blokove koje ne razume (vidi `unsupportedNoteBlocks`).
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
 * Blokovi koje mobilni editor (tentap, prethodno izgrađen web bundle) ne ume da
 * predstavi. Tiptap šema u tom bundle-u nema `table`, `codeBlock` ni naš
 * `noteFile` čvor, pa bi učitavanje takvog tela u editor tiho obrisalo te
 * blokove, a prvi autosave bi taj gubitak upisao u bazu.
 *
 * Zato se telo sa ovakvim blokom otvara **samo za čitanje** (`NoteReader`).
 */
export type UnsupportedNoteBlock = 'table' | 'attachment' | 'codeBlock';

const UNSUPPORTED_PATTERNS: ReadonlyArray<readonly [UnsupportedNoteBlock, RegExp]> = [
  ['table', /<table[\s/>]/i],
  ['attachment', /data-note-file/i],
  ['codeBlock', /<pre[\s/>]/i],
];

/** Imena blokova u akuzativu — ulaze u rečenicu „…ne prikazuje tabele i priloge". */
const UNSUPPORTED_LABEL: Record<UnsupportedNoteBlock, string> = {
  table: 'tabele',
  attachment: 'priloge',
  codeBlock: 'blokove koda',
};

export function unsupportedNoteBlocks(html: string): UnsupportedNoteBlock[] {
  if (!html) return [];
  return UNSUPPORTED_PATTERNS.filter(([, pattern]) => pattern.test(html)).map(
    ([kind]) => kind,
  );
}

/** „tabele", „tabele i priloge", „tabele, priloge i blokove koda". */
export function unsupportedNoteBlocksSentence(blocks: UnsupportedNoteBlock[]): string {
  const labels = blocks.map((block) => UNSUPPORTED_LABEL[block]);
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
  /* Tiptap Placeholder ekstenzija (prazan prvi pasus). */
  .ProseMirror p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    color: ${colors.mutedForeground};
    float: left; height: 0; pointer-events: none;
  }
  ::selection { background: ${colors.primary}55; }
`;
}
