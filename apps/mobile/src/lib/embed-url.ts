/**
 * Gradi URL embed canvas rute (`apps/web/app/embed/canvas/[kind]/[id]`) za mobilni
 * `WebView` (M4.3, §5.2). Auth NE ide kroz URL — token bi završio u web access
 * logovima i WebView istoriji. Umesto toga: embed se učita bez tokena, javi `ready`
 * preko `postMessage` mosta, a native mu pošalje `{type:"auth", token}` (i osvežava
 * ga na svaku promenu). URL nosi samo `theme` (nije osetljiv), i to za prvi paint —
 * dalje promene teme idu takođe kroz most, pa URL ostaje stabilan.
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
