import type { Id } from '@/convex/_generated/dataModel';

/**
 * Otpremanje fajla u Convex storage sa telefona — **jedno mesto za sva tri
 * poziva** (prilozi stranice, prilog u telu beleške, prilog u chatu).
 *
 * ZAŠTO POSTOJI: React Native, kad je telo zahteva `Blob`, uzima `Content-Type`
 * iz SAMOG BLOBA i gazi zaglavlje koje si prosledio u `fetch`. A `fetch('file://…')`
 * vraća odgovor bez `Content-Type`, pa `.blob()` daje blob sa `type === ""` —
 * zahtev onda ode sa praznim `Content-Type` i Convex ga odbije sa
 * `400 {"code":"BadHeader","message":"Bad header for content-type"}`.
 *
 * Simptom je bio potpuno nem: „Otpremanje nije uspelo." na svaki prilog, a
 * zaglavlje `{'Content-Type': mimeType}` je u kodu stajalo i izgledalo ispravno.
 * Zato se blob ovde PRESLIKAVA sa tipom (`new Blob([blob], { type })`) — RN tada
 * pošalje pravi `Content-Type`.
 *
 * Ne zovi `fetch(uploadUrl, { body: blob })` mimo ovog modula.
 */

/** Kad birač ne zna tip: Convex traži bilo koji ISPRAVAN header, ne prazan. */
const FALLBACK_MIME = 'application/octet-stream';

/**
 * Čita lokalni fajl u blob KOJI NOSI SVOJ TIP. Vraća i `size`, jer galerija ume
 * da ne da `fileSize`, a chat mora da zna veličinu pre nego što traži URL.
 */
export async function readUploadBlob(
  uri: string,
  mimeType: string | null | undefined,
): Promise<Blob> {
  const response = await fetch(uri);
  const raw = await response.blob();
  const type = mimeType?.trim() ? mimeType.trim() : FALLBACK_MIME;
  // Novi blob, ne `raw`: `raw.type` je prazan i RN bi ga poslao takvog.
  return new Blob([raw], { type });
}

/** POST na potpisani Convex URL. Vraća `storageId` ili baca sa jasnim razlogom. */
export async function postUploadBlob(
  uploadUrl: string,
  blob: Blob,
): Promise<Id<'_storage'>> {
  const response = await fetch(uploadUrl, {
    method: 'POST',
    // Zaglavlje se NE šalje: RN ga svejedno prepisuje iz `blob.type`, a dva
    // izvora istine za istu stvar su poziv na sledeći ovakav bag.
    body: blob,
  });
  if (!response.ok) {
    throw new Error(`Otpremanje nije uspelo (${response.status}).`);
  }
  const { storageId } = (await response.json()) as { storageId: Id<'_storage'> };
  return storageId;
}
