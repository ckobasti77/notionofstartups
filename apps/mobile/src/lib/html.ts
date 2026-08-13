/**
 * Jedini put kojim korisnički tekst ili URL ulazi u HTML koji mobilni sam gradi.
 *
 * Postoji zato što dva mesta u aplikaciji sklapaju HTML od podataka koje korisnik
 * kontroliše: `components/stranica/file-preview.tsx` (`<video src="…">` u
 * `WebView`-u) i `lib/note-content.ts` (`noteTextToHtml` — sadržaj beleške upisan
 * u `TextInput`). Bez escape-a naziv fajla sa `"` razbije atribut, a tekst sa `<`
 * postane tag.
 *
 * Nema `DOM`-a na React Native, pa ni `document.createTextNode` — zamena je
 * eksplicitna tabela od pet znakova, ista koju koriste server-side render
 * biblioteke.
 */
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * `& < > " '` → HTML entiteti. Bezbedno i za telo elementa i za vrednost
 * atributa (zato i apostrof i navodnik).
 *
 * Namerno NIJE idempotentno: `&amp;` postaje `&amp;amp;`. Zamena `&` mora da ide
 * prva i bezuslovno — „pametno" preskakanje već escapovanih sekvenci je klasična
 * rupa (`&lt;script&gt;` sklopljen iz dva ulaza bi prošao).
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}
