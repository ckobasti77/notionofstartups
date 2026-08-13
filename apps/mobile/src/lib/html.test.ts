import { describe, expect, it } from 'vitest';

import { escapeHtml } from '@/lib/html';

describe('escapeHtml', () => {
  it('T1 — svih pet znakova ide u entitete', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  it('T2 — prazan string ostaje prazan', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('T3 — tekst bez opasnih znakova se ne menja', () => {
    expect(escapeHtml('Beleška o sastanku 14. avgusta')).toBe(
      'Beleška o sastanku 14. avgusta',
    );
  });

  it('T4 — tag u tekstu prestaje da bude tag', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('T5 — URL sa navodnikom ne može da izađe iz atributa', () => {
    // Ovo je stvaran oblik napada na `<video src="…">`: potpisani Convex URL sa
    // ubačenim `"` bi zatvorio atribut i otvorio nov (npr. `onerror=`).
    const url = 'https://x.convex.cloud/f?token=a" onerror="boom';
    const escaped = escapeHtml(url);
    expect(escaped).not.toContain('"');
    expect(escaped).toBe(
      'https://x.convex.cloud/f?token=a&quot; onerror=&quot;boom',
    );
  });

  it('T6 — dvostruki escape je OČEKIVAN, ne bug', () => {
    // Funkcija se namerno ne trudi da prepozna već escapovan ulaz — vidi
    // docstring u `lib/html.ts`. Test zakiva to ponašanje da ga neko ne
    // „popravi" u rupu.
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  it('T7 — svi pogoci u jednom stringu, ne samo prvi', () => {
    expect(escapeHtml('a<b<c')).toBe('a&lt;b&lt;c');
  });
});
