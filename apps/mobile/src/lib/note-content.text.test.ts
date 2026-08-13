import { describe, expect, it } from 'vitest';

import {
  EMPTY_NOTE_HTML,
  noteHtmlToText,
  noteTextToHtml,
} from '@/lib/note-content';

/**
 * `noteHtmlToText` menja SVAKI tag razmakom (`<[^>]+>` → ' '), pa svaki red posle
 * povratka počinje jednim vodećim razmakom. To je zatečeno ponašanje koje jednako
 * važi i za pravo Tiptap telo sa weba (`<p>a</p><p>b</p>`), pa se ovde NE menja —
 * round-trip se meri po redovima, sa dokumentovanim trim-om.
 */
function roundTrip(text: string): string {
  return noteHtmlToText(noteTextToHtml(text))
    .split('\n')
    .map((line) => line.trim())
    .join('\n');
}

describe('noteTextToHtml', () => {
  it('T1 — prazan ulaz daje prazan Tiptap dokument', () => {
    expect(noteTextToHtml('')).toBe(EMPTY_NOTE_HTML);
    expect(noteTextToHtml('   \n  \n ')).toBe(EMPTY_NOTE_HTML);
  });

  it('T2 — jedan red je jedan pasus', () => {
    expect(noteTextToHtml('Zdravo')).toBe('<p>Zdravo</p>');
  });

  it('T3 — tri reda daju tri pasusa', () => {
    expect(noteTextToHtml('a\nb\nc')).toBe('<p>a</p><p>b</p><p>c</p>');
  });

  it('T4 — prazan red između postaje prazan pasus', () => {
    expect(noteTextToHtml('a\n\nb')).toBe('<p>a</p><p></p><p>b</p>');
  });

  it('T5 — Windows prelomi (\\r\\n) ne prave duple pasuse', () => {
    expect(noteTextToHtml('a\r\nb')).toBe('<p>a</p><p>b</p>');
  });

  it('T6 — `<script>` iz unosa OSTAJE tekst, ne postaje tag', () => {
    const html = noteTextToHtml('<script>alert(1)</script>');
    expect(html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(html).not.toContain('<script');
  });

  it('T7 — `&` se escapuje pa telo ostaje validan HTML', () => {
    expect(noteTextToHtml('Miš & Maca')).toBe('<p>Miš &amp; Maca</p>');
  });

  it('T8 — round-trip vraća polazni tekst (jedan red)', () => {
    expect(roundTrip('Zapisano na telefonu')).toBe('Zapisano na telefonu');
  });

  it('T9 — round-trip vraća polazni tekst (više redova i prazan red)', () => {
    const input = 'Prvi red\nDrugi red\n\nPosle praznog';
    expect(roundTrip(input)).toBe(input);
  });

  it('T10 — round-trip vraća i znakove koji su escapovani', () => {
    const input = 'a < b & c > d "citat" \'jednostruki\'';
    expect(roundTrip(input)).toBe(input);
  });
});
