"use client";

/**
 * Error boundary embed rute editora (kao `embed/canvas/.../error.tsx`) — hvata greške u
 * renderu i nudi „Pokušaj ponovo" umesto belog WebView-a. Pun ekran, tokeni iz globals.
 */
export default function EmbedNoteError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 grid place-items-center bg-background px-6 text-center"
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Beleška se ne može učitati.</p>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-accent"
        >
          Pokušaj ponovo
        </button>
      </div>
    </div>
  );
}
