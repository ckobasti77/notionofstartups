"use client";

/**
 * Lokalna granica greške za embed kanvas — bez chrome-a, čitljiva u `WebView`-u.
 * Uhvati npr. `requireStartupMember` bacanje kad token nema pristup startupu.
 */
export default function EmbedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-background px-6 text-center text-foreground">
      <div className="max-w-sm">
        <p className="text-base font-semibold">Kanvas se ne može učitati</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {error.message || "Nemaš pristup ovom kanvasu ili je token istekao."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
        >
          Pokušaj ponovo
        </button>
      </div>
    </div>
  );
}
