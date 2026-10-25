type AccessErrorData = {
  code?: string;
  message?: string;
};

/**
 * Izvlači čitljivu poruku iz greške Convex funkcije. Backend baca
 * `accessError(code, msg)` (`convex/lib/access_errors.ts`) sa
 * `data: { code, message }`; ako toga nema, pada na tekst
 * "Uncaught ConvexError: …" / "[CONVEX …]" omotača. Ogledalo mobilnog
 * `apps/mobile/src/lib/errors.ts` — izmene idu u oba fajla.
 */
export function accessErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  const data = (error as Error & { data?: unknown }).data;
  if (
    data !== null &&
    typeof data === "object" &&
    "message" in data &&
    typeof (data as AccessErrorData).message === "string"
  ) {
    return (data as AccessErrorData).message!;
  }

  const uncaught = error.message.match(/Uncaught (?:ConvexError: )?(.+?)(?:\n|$)/);
  const text = (uncaught?.[1] ?? error.message)
    .replace(/^\[CONVEX[^\]]*\]\s*/, "")
    // Razvoj: „Uncaught Error: <poruka>" — skida se samo prefiks, poruka servera
    // ostaje (produkcija tekst obične greške ionako krije iza „Server Error").
    .replace(/^Error:\s*/, "")
    .trim();
  // Tehnički tekst servera (Server Error, Request ID) korisniku ne govori ništa: srpski rezervni tekst.
  if (!text || /Server Error|Request ID|Called by client/i.test(text)) return fallback;
  return text;
}

/** Vraća `code` iz ConvexError data, ako postoji (npr. "INVITE_REQUIRED"). */
export function accessErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const data = (error as Error & { data?: unknown }).data;
  if (data !== null && typeof data === "object" && "code" in data) {
    const code = (data as AccessErrorData).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}
