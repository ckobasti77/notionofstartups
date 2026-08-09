/**
 * Adrese za linkove u telu beleške — mobilni parnjak `apps/web/lib/note-link.ts`.
 *
 * Ista pravila (bez sheme → `https://`, unos sa `@` → `mailto:`, izvršne sheme
 * odbijene), ali **bez `URL`**: React Native ima samo delimičan `URL` polyfill
 * koji nema `protocol`/`hostname` gettere, pa bi web implementacija ovde tiho
 * pukla. Kad se pravilo menja, menja se na oba mesta (nema `packages/shared`).
 */

const ALLOWED_SCHEMES: readonly string[] = ['http:', 'https:', 'mailto:', 'tel:'];

const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Browser tiho briše kontrolne znake iz adrese, pa bi „java<TAB>script:" prošlo
 * proveru sheme a ostalo izvršno. Brišu se pre svega ostalog.
 */
function withoutControlChars(input: string): string {
  let output = '';
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 0x1f && code !== 0x7f) output += char;
  }
  return output;
}

/** Deo pre prve `/`, `?` ili `#` — domen (i eventualni port). */
function hostOf(value: string): string {
  return value.split(/[/?#]/, 1)[0] ?? '';
}

/** Vraća `href` spreman za `setLink`, ili `null` kad unos nije adresa. */
export function normalizeNoteLinkHref(input: string): string | null {
  const value = withoutControlChars(input).trim();
  if (value === '') return null;

  const scheme = SCHEME.exec(value);
  if (scheme !== null) {
    const protocol = `${scheme[1].toLowerCase()}:`;
    if (!ALLOWED_SCHEMES.includes(protocol)) return null;
    const rest = value.slice(scheme[0].length);
    if (protocol === 'mailto:' || protocol === 'tel:') {
      return rest.trim() === '' ? null : value;
    }
    // http(s) bez domena („https://") vodi u prazno.
    return hostOf(rest.replace(/^\/+/, '')) === '' ? null : value;
  }

  if (EMAIL.test(value)) return `mailto:${value}`;
  if (/\s/.test(value)) return null;

  const host = hostOf(value);
  // Bez izričite sheme „/moja-strana" bi dalo domen „moja-strana" i link u
  // prazno; sa shemom se veruje unosu, pa `http://server/app` u lokalnoj mreži
  // i dalje radi (isto pravilo kao na webu).
  if (host === '' || (!host.includes('.') && !/^localhost(:\d+)?$/.test(host))) {
    return null;
  }
  return `https://${value}`;
}
