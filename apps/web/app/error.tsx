"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexConnectionState } from "convex/react";
import { AlertTriangle, LogOut, RefreshCw, WifiOff } from "lucide-react";

import { AppMark } from "@/components/app-mark";
import { Button } from "@/components/ui/button";
import { accessErrorMessage } from "@/lib/errors";

/**
 * Koreni error boundary. Do lanca 7 je SVAKI pad — uključujući serversku grešku
 * Convex upita — pripisivao „nakratko prekinutoj vezi", pa je slao korisnika da
 * traži mrežni problem koji ne postoji. Ta dva stanja su odvojena: `useQuery`
 * BACA samo kad funkcija na serveru prijavi grešku, dok pukla veza ništa ne
 * baca (upiti samo stoje u učitavanju, o tome brine `ConnectionBanner`). Zato
 * je podrazumevani prikaz „Greška na serveru" sa stvarnom porukom i tehničkim
 * detaljem, a mrežna varijanta se prikazuje SAMO kad WebSocket zaista nije
 * povezan u trenutku prikaza.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { signOut } = useAuthActions();
  const connection = useConvexConnectionState();
  const offline = !connection.isWebSocketConnected;
  const message = accessErrorMessage(error, "Nepoznata greška.");

  return (
    <main className="app-canvas grid min-h-svh place-items-center px-5 py-10">
      <section className="w-full max-w-lg rounded-3xl border bg-card p-7 text-center shadow-[var(--shadow-desk)] sm:p-9">
        <AppMark className="mx-auto size-11" />
        <span className="mx-auto mt-6 grid size-11 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          {offline ? (
            <WifiOff className="size-5" aria-hidden="true" />
          ) : (
            <AlertTriangle className="size-5" aria-hidden="true" />
          )}
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          {offline ? "Nema veze sa serverom" : "Greška na serveru"}
        </h1>
        {offline ? (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            WebSocket veza ka Convex serveru nije uspostavljena. Proveri internet
            vezu, a u razvoju i da li je Convex dev servis pokrenut, pa pokušaj
            ponovo.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Funkcija na serveru je prijavila grešku — veza je u redu, problem
              nije u mreži.
            </p>
            <p className="mt-3 rounded-xl bg-muted/50 px-4 py-3 text-sm font-medium leading-6">
              {message}
            </p>
          </>
        )}
        <details className="mt-3 text-left">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            Tehnički detalji
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-muted/50 p-3 font-mono text-[11px] leading-5 text-muted-foreground">
            {error.message}
            {error.digest ? `\n\nKod: ${error.digest}` : ""}
          </pre>
        </details>
        <div className="mt-7 grid gap-2 sm:grid-cols-2">
          <Button onClick={reset}>
            <RefreshCw className="size-4" />
            Pokušaj ponovo
          </Button>
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut className="size-4" />
            Odjavi se
          </Button>
        </div>
      </section>
    </main>
  );
}
