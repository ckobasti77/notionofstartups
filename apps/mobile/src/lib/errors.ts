type AccessErrorData = {
  code?: string;
  message?: string;
};

/**
 * Izvlači čitljivu poruku iz ConvexError-a. Backend baca `accessError(code, msg)`
 * (`lib/access_errors.ts`) sa `data: { code, message }`; ako toga nema, pada na
 * "Uncaught ConvexError: …" tekst. Preslikava web helper iz [app-root.tsx].
 */
export function accessErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  const data = (error as Error & { data?: unknown }).data;
  if (
    data !== null &&
    typeof data === 'object' &&
    'message' in data &&
    typeof (data as AccessErrorData).message === 'string'
  ) {
    return (data as AccessErrorData).message!;
  }

  const uncaught = error.message.match(/Uncaught (?:ConvexError: )?(.+?)(?:\n|$)/);
  const text = (uncaught?.[1] ?? error.message).replace(/^\[CONVEX[^\]]*\]\s*/, '').trim();
  // Tehnički tekst servera (Server Error, Request ID) korisniku ne govori ništa: srpski rezervni tekst.
  if (!text || /Server Error|Request ID|Called by client|^Error:/i.test(text)) return fallback;
  return text;
}

/** Vraća `code` iz ConvexError data, ako postoji (npr. "INVITE_REQUIRED"). */
export function accessErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const data = (error as Error & { data?: unknown }).data;
  if (data !== null && typeof data === 'object' && 'code' in data) {
    const code = (data as AccessErrorData).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}
