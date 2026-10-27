import { describe, expect, it } from 'vitest';

import { extractNoteFileIds } from './note-content';

describe('extractNoteFileIds — prilozi u telu beleške (hrani pageFiles.prune)', () => {
  it('vadi id-jeve iz noteFile blokova, bez duplikata, bez obzira na redosled atributa', () => {
    const html =
      '<p>Tekst</p>' +
      '<div data-note-file="" data-file-id="k17abc" data-category="image" data-name="ekran.png" data-size="20480">ekran.png</div>' +
      '<div data-category="pdf" data-file-id="k17def" data-note-file="">plan.pdf</div>' +
      '<div data-note-file="" data-file-id="k17abc">ekran.png</div>';
    expect(extractNoteFileIds(html)).toEqual(['k17abc', 'k17def']);
  });

  it('običan tekst, tabele i slike bez noteFile bloka nemaju priloga', () => {
    expect(extractNoteFileIds('<p>Samo tekst</p>')).toEqual([]);
    expect(extractNoteFileIds('<table><tr><td>1</td></tr></table>')).toEqual([]);
    expect(extractNoteFileIds('')).toEqual([]);
  });

  it('blok bez id-ja se preskače, jednostruki navodnici se čitaju', () => {
    expect(extractNoteFileIds('<div data-note-file="">bez id-ja</div>')).toEqual([]);
    expect(extractNoteFileIds("<div data-note-file='' data-file-id='k1'>a</div>")).toEqual(['k1']);
  });
});
