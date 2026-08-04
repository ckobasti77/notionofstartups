"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { ArrowRight, CheckCircle2, LockKeyhole, Network, Sparkles } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { AppMark } from "@/components/app-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuthScreenProps = {
  inviteCode?: string;
};

function cleanAuthError(error: unknown) {
  const fallback = "Prijava nije uspela. Proveri podatke i pokušaj ponovo.";
  if (!(error instanceof Error)) return fallback;
  const match = error.message.match(/Uncaught (?:ConvexError: )?(.+?)(?:\n|$)/);
  return (match?.[1] ?? error.message).replace(/^\[CONVEX[^\]]*\]\s*/, "") || fallback;
}

export function AuthScreen({ inviteCode }: AuthScreenProps) {
  const { signIn } = useAuthActions();
  const bootstrapState = useQuery(api.profiles.getBootstrapState);
  const canCreateAccount = Boolean(inviteCode) || bootstrapState?.needsBootstrap === true;
  const [mode, setMode] = useState<"signIn" | "signUp">(
    inviteCode ? "signUp" : "signIn",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    formData.set("flow", mode);
    if (inviteCode) formData.set("inviteCode", inviteCode);

    if (mode === "signUp") {
      const displayName = String(formData.get("displayName") ?? "").trim();
      window.sessionStorage.setItem("notion-clone-pending-name", displayName);
      if (inviteCode) {
        window.sessionStorage.setItem("notion-clone-invite", inviteCode);
      }
    }

    try {
      await signIn("password", formData);
    } catch (submissionError) {
      if (mode === "signUp") {
        window.sessionStorage.removeItem("notion-clone-pending-name");
        window.sessionStorage.removeItem("notion-clone-invite");
      }
      setError(cleanAuthError(submissionError));
      setPending(false);
    }
  }

  return (
    <main className="app-canvas relative grid min-h-svh overflow-hidden lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_34%)]" />

      <section className="relative hidden min-h-svh overflow-hidden border-r border-border/70 px-[clamp(2.5rem,6vw,7rem)] py-12 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <AppMark className="size-9" />
          <div>
            <p className="text-sm font-semibold tracking-tight">Notion Clone</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Privatni radni prostor
            </p>
          </div>
        </div>

        <div className="max-w-2xl">
          <p className="mb-5 font-mono text-xs uppercase tracking-[0.18em] text-primary">
            Jedno mesto za oba startupa
          </p>
          <h2 className="max-w-xl text-balance text-5xl font-semibold leading-[1.04] tracking-[-0.055em] xl:text-6xl">
            Misli postaju odluke. Odluke postaju sledeći koraci.
          </h2>
          <p className="mt-7 max-w-xl text-pretty text-lg leading-8 text-muted-foreground">
            Beleške, zadaci i odgovornost ostaju povezani sa startupom, oblašću i ljudima koji ih pokreću.
          </p>

          <div className="threadline mt-12 space-y-1 pl-7">
            {[
              [Network, "Startup → oblast → stranica → sledeći korak"],
              [CheckCircle2, "Danas i Moji zadaci bez traženja po folderima"],
              [LockKeyhole, "Privatan pristup i članstvo po startupu"],
            ].map(([Icon, text], index) => {
              const FeatureIcon = Icon as typeof Network;
              return (
                <div key={String(text)} className="threadline-item flex items-center gap-3 py-3 text-sm font-medium">
                  <span className="grid size-8 place-items-center rounded-xl border border-border bg-card text-primary shadow-sm">
                    <FeatureIcon className="size-4" />
                  </span>
                  <span>{String(text)}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">0{index + 1}</span>
                </div>
              );
            })}
          </div>
        </div>

        <p className="max-w-lg text-xs leading-5 text-muted-foreground">
          Napravljeno za mali tim koji želi manje administracije i više jasnoće.
        </p>
      </section>

      <section className="relative flex min-h-svh items-center justify-center px-5 py-10 sm:px-8">
        <div className="absolute right-5 top-5 sm:right-8 sm:top-8">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-[420px]">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <AppMark className="size-9" />
            <div>
              <p className="font-semibold">Notion Clone</p>
              <p className="text-xs text-muted-foreground">Privatni radni prostor</p>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-border/80 bg-card p-6 shadow-[var(--shadow-desk)] sm:p-8">
            {inviteCode && mode === "signUp" ? (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/7 p-3.5 text-sm">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="font-semibold">Pozivni link je otvoren</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    Pristup će biti potvrđen nakon što uneseš email adresu na koju si pozvan.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="mb-7">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                {mode === "signIn" ? "Dobro došao nazad" : "Pristupi timu"}
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
                {mode === "signIn" ? "Prijavi se" : "Kreiraj svoj profil"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {mode === "signIn"
                  ? "Nastavi tamo gde je tim stao."
                  : bootstrapState?.needsBootstrap
                    ? "Ovo će biti glavni administratorski nalog."
                    : "Pozivnica određuje kojem startupu pripadaš."}
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              {mode === "signUp" ? (
                <div className="space-y-2">
                  <Label htmlFor="displayName">Ime i prezime</Label>
                  <Input
                    id="displayName"
                    name="displayName"
                    autoComplete="name"
                    placeholder="Kako će te tim videti"
                    required
                    maxLength={80}
                  />
                </div>
              ) : null}

              {mode === "signUp" && bootstrapState?.needsBootstrap && !inviteCode ? (
                <div className="space-y-2">
                  <Label htmlFor="inviteCode">Osnivački kod</Label>
                  <Input
                    id="inviteCode"
                    name="inviteCode"
                    type="password"
                    autoComplete="off"
                    placeholder="Kod koji je podešen na serveru"
                    required
                    maxLength={128}
                    aria-describedby="bootstrap-code-help"
                  />
                  <p id="bootstrap-code-help" className="text-[11px] leading-5 text-muted-foreground">
                    Jednokratna zaštita koja sprečava da prvi posetilac preuzme administratorski nalog.
                  </p>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="ime@startup.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Lozinka</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                  placeholder={mode === "signIn" ? "Tvoja lozinka" : "Najmanje 12 znakova"}
                  required
                  minLength={mode === "signUp" ? 12 : undefined}
                  aria-describedby={mode === "signUp" ? "password-requirements" : undefined}
                />
                {mode === "signUp" ? (
                  <p id="password-requirements" className="text-[11px] leading-5 text-muted-foreground">
                    Veliko i malo slovo, broj i specijalni znak.
                  </p>
                ) : null}
              </div>

              {error ? (
                <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/8 px-3.5 py-3 text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <Button className="mt-2 h-11 w-full rounded-xl" disabled={pending}>
                {pending ? "Proveravam…" : mode === "signIn" ? "Prijavi se" : "Kreiraj nalog"}
                {!pending ? <ArrowRight className="size-4" /> : null}
              </Button>
            </form>

            <div className="mt-6 border-t border-border/70 pt-5 text-center text-sm text-muted-foreground">
              {mode === "signIn" && canCreateAccount ? (
                <button
                  type="button"
                  className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setMode("signUp");
                    setError(null);
                  }}
                >
                  {bootstrapState?.needsBootstrap ? "Kreiraj osnivački nalog" : "Prihvati pozivnicu"}
                </button>
              ) : mode === "signUp" ? (
                <button
                  type="button"
                  className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setMode("signIn");
                    setError(null);
                  }}
                >
                  Već imaš nalog? Prijavi se
                </button>
              ) : (
                <p>Nemaš pristup? Zatraži pozivnicu od administratora.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
