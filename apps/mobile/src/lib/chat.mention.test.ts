/**
 * KAPIJA FAZE P3 (sekcija D): pomen `@` u SREDINI teksta ne sme da pojede ostatak
 * poruke.
 *
 * Do ove faze je mobilni kompozer tražio `lastIndexOf('@')` nad celim unosom i
 * pri izboru radio `draft.slice(0, at) + '@Ime '` — dakle brisao sve posle
 * kursora. Web to nikad nije radio (`chat/mention-textarea.tsx` traži token
 * unazad OD KURSORA i umeće na tu poziciju). Ovaj test meri portovanu funkciju,
 * ne komponentu: `findMentionQuery` je jedina razlika u ponašanju, a testiranje
 * čiste funkcije ne traži RN renderer.
 */
import { describe, expect, test } from 'vitest';

import { findMentionQuery } from '@/lib/chat';

describe('findMentionQuery', () => {
  test('pomen na kraju unosa se otvara', () => {
    const value = 'zdravo @Mar';
    expect(findMentionQuery(value, value.length)).toEqual({
      start: 7,
      query: 'Mar',
    });
  });

  test('pomen u SREDINI gleda samo reč pod kursorom', () => {
    // „posle @Mar podne" — kursor je iza „Mar", tekst posle njega postoji.
    const value = 'posle @Mar podne';
    const caret = 'posle @Mar'.length;
    expect(findMentionQuery(value, caret)).toEqual({ start: 6, query: 'Mar' });
  });

  test('umetanje na poziciju kursora čuva tekst iza njega', () => {
    // Isti izračun koji `message-composer.tsx` radi u `selectMention`.
    const value = 'posle @ podne';
    const caret = 'posle @'.length;
    const found = findMentionQuery(value, caret);
    expect(found).not.toBeNull();
    const next =
      value.slice(0, found!.start) + '@Marko ' + value.slice(caret);
    expect(next).toBe('posle @Marko  podne');
  });

  test('`@` unutar reči (mejl) ne otvara pomen', () => {
    const value = 'pisi na jovan@example.test';
    expect(findMentionQuery(value, value.length)).toBeNull();
  });

  test('razmak posle imena zatvara token', () => {
    const value = 'zdravo @Marko ';
    expect(findMentionQuery(value, value.length)).toBeNull();
  });

  test('novi red zatvara token (ne prelazi u prethodni)', () => {
    const value = '@Marko\nsledeci red';
    expect(findMentionQuery(value, value.length)).toBeNull();
  });

  test('`@` posle zagrade i na samom početku se otvaraju', () => {
    expect(findMentionQuery('@An', 3)).toEqual({ start: 0, query: 'An' });
    expect(findMentionQuery('(@An', 4)).toEqual({ start: 1, query: 'An' });
  });

  test('kursor pre `@` ne vidi token koji sledi', () => {
    const value = 'zdravo @Marko';
    expect(findMentionQuery(value, 6)).toBeNull();
  });
});
