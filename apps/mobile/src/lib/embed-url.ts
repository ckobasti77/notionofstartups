/**
 * Gradi URL embed canvas rute (`apps/web/app/embed/canvas/[kind]/[id]`) za mobilni
 * `WebView` (M4.3, §5.2). Auth NE ide kroz URL — token bi završio u web access
 * logovima i WebView istoriji. Umesto toga native INJEKTUJE token pre učitavanja
 * stranice (`injectedJavaScriptBeforeContentLoaded` → `window.__DEVOTION_AUTH__`);
 * `ready`/`authed` handshake više ne postoji (ZA-POPRAVKU Z2). URL nosi samo
 * `theme` (nije osetljiv), i to za prvi paint — dalje promene idu kroz most, pa
 * URL ostaje stabilan.
 *
 * Web bazu daje `EXPO_PUBLIC_WEB_URL` (vidi `.env.example`). Bez nje vraća `null`,
 * pa ekran prikaže jasnu grešku umesto belog WebView-a.
 */
export type CanvasKind = 'thoughts' | 'ideas' | 'area' | 'page';

const webBase = process.env.EXPO_PUBLIC_WEB_URL;

export function embedCanvasUrl(opts: {
  kind: CanvasKind;
  id: string;
  theme: 'light' | 'dark';
}): string | null {
  if (!webBase) return null;
  const base = webBase.replace(/\/+$/, '');
  const query = `theme=${opts.theme}`;
  return `${base}/embed/canvas/${encodeURIComponent(opts.kind)}/${encodeURIComponent(opts.id)}?${query}`;
}

/**
 * Gradi URL embed rute editora beleške (`apps/web/app/embed/note/[id]`) za mobilni
 * `WebView` (M3.2). Isti auth model kao canvas embed: token se injektuje u
 * `window.__DEVOTION_AUTH__` PRE učitavanja (ne kroz URL). `theme` je za prvi paint.
 *
 * Poseban `pageId === 'probe'` je merni prototip (KORAK 1): renderuje PRAVI editor sa
 * ~2000 reči, bez auth-a/snimanja, za merenje latencije na uređaju.
 */
export function embedNoteUrl(opts: { pageId: string; theme: 'light' | 'dark' }): string | null {
  if (!webBase) return null;
  const base = webBase.replace(/\/+$/, '');
  return `${base}/embed/note/${encodeURIComponent(opts.pageId)}?theme=${opts.theme}`;
}

/** Nominativ vrste kanvasa za header. */
export function canvasKindLabel(kind: CanvasKind): string {
  switch (kind) {
    case 'ideas':
      return 'Ideje';
    case 'thoughts':
      return 'Misli';
    case 'area':
      return 'Oblast';
    case 'page':
      return 'Stranica';
  }
}

/**
 * Pun pozivni link — pandan `${window.location.origin}/?invite=…` sa weba
 * (`admin-dialog.tsx`). Prima ga osoba koja NEMA aplikaciju, pa mora da vodi na
 * web, ne na `devotion://` shemu; web onda nudi instalaciju.
 *
 * Vraća `null` kad `EXPO_PUBLIC_WEB_URL` nije podešen — pozivalac tada nudi samo
 * kopiranje koda umesto linka koji nikuda ne vodi.
 */
export function inviteLinkUrl(code: string): string | null {
  if (!webBase) return null;
  return `${webBase.replace(/\/+$/, '')}/?invite=${encodeURIComponent(code)}`;
}
