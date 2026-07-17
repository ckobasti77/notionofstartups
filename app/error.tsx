"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { AlertTriangle, LogOut, RefreshCw } from "lucide-react";

import { AppMark } from "@/components/app-mark";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { signOut } = useAuthActions();

  return (
    <main className="app-canvas grid min-h-svh place-items-center px-5 py-10">
      <section className="w-full max-w-lg rounded-3xl border bg-card p-7 text-center shadow-[var(--shadow-desk)] sm:p-9">
        <AppMark className="mx-auto size-11" />
        <span className="mx-auto mt-6 grid size-11 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Veza je nakratko prekinuta</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Pokušaj ponovo, a ako se problem ponovi proveri da li je Convex razvojni servis pokrenut.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-[10px] text-muted-foreground">Kod: {error.digest}</p>
        ) : null}
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
