/**
 * Gradi URL embed canvas rute (`apps/web/app/embed/canvas/[kind]/[id]`) za mobilni
 * `WebView` (M4.3). Auth ide tokenom u query parametru — tako nalaže §5.2
 * („Autentikacija tokenom iz query parametra"). Token je osetljiv: WebView učitava
 * isključivo naš web origin, ali svejedno ne loguj ovaj URL.
 *
 * Web bazu daje `EXPO_PUBLIC_WEB_URL` (vidi `.env.example`). Bez nje vraća `null`,
 * pa ekran prikaže jasnu grešku umesto belog WebView-a.
 */
export type CanvasKind = 'thoughts' | 'ideas' | 'area' | 'page';

const webBase = process.env.EXPO_PUBLIC_WEB_URL;

export function embedCanvasUrl(opts: {
  kind: CanvasKind;
  id: string;
  token: string;
  theme: 'light' | 'dark';
}): string | null {
  if (!webBase) return null;
  const base = webBase.replace(/\/+$/, '');
  const query = `token=${encodeURIComponent(opts.token)}&theme=${opts.theme}`;
  return `${base}/embed/canvas/${encodeURIComponent(opts.kind)}/${encodeURIComponent(opts.id)}?${query}`;
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
