"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, LogOut, RefreshCw, X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { AppMark } from "@/components/app-mark";
import { AuthScreen } from "@/components/auth/auth-screen";
import { Button } from "@/components/ui/button";
import { accessErrorMessage } from "@/lib/errors";

function FullScreenLoader() {
  return (
    <main className="app-canvas grid min-h-svh place-items-center px-6">
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <AppMark className="size-12" />
          <span className="absolute -inset-2 -z-10 animate-pulse rounded-2xl bg-primary/10" />
        </div>
        <p className="mt-5 text-sm font-semibold">Pripremam radni prostor</p>
        <p className="mt-1 text-xs text-muted-foreground">Povezujem tvoje startupove i zadatke…</p>
      </div>
    </main>
  );
}

const WorkspaceShell = dynamic(
  () => import("@/components/workspace/workspace-shell").then((module) => module.WorkspaceShell),
  { loading: () => <FullScreenLoader /> },
);

function AccessProblem({ message, onSignOut }: { message: string; onSignOut: () => void }) {
  return (
    <main className="app-canvas grid min-h-svh place-items-center px-5">
      <div className="w-full max-w-md rounded-3xl border bg-card p-7 text-center shadow-[var(--shadow-desk)]">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="size-5" />
        </span>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">Pristup nije završen</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
        <Button variant="outline" className="mt-6 w-full" onClick={onSignOut}>
          <LogOut className="size-4" />
          Odjavi se
        </Button>
      </div>
    </main>
  );
}

function InviteProblem({
  message,
  onRetry,
  onDismiss,
}: {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[80] flex justify-center sm:inset-x-auto sm:right-5 sm:top-5">
      <div
        role="alert"
        className="pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-2xl border border-amber-500/30 bg-card/95 p-4 shadow-[var(--shadow-desk)] backdrop-blur-xl"
      >
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-amber-500/12 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Poziv nije prihvaćen</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{message}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3 h-8"
            onClick={onRetry}
          >
            <RefreshCw className="size-3.5" />
            Pokušaj ponovo
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label="Zatvori poruku"
          onClick={onDismiss}
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function AppRoot() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const searchParams = useSearchParams();
  const router = useRouter();
  const inviteCode = searchParams.get("invite")?.trim() || undefined;
  const profile = useQuery(api.profiles.getCurrent, isAuthenticated ? {} : "skip");
  const ensureCurrent = useMutation(api.profiles.ensureCurrent);
  const claimInvite = useMutation(api.invites.claim);
  const onboardingStarted = useRef(false);
  const inviteClaimStarted = useRef(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteRetry, setInviteRetry] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || profile !== null || onboardingStarted.current) return;
    onboardingStarted.current = true;

    const displayName = window.sessionStorage.getItem("notion-clone-pending-name") ?? undefined;
    const storedInvite = window.sessionStorage.getItem("notion-clone-invite") ?? inviteCode;

    void ensureCurrent({
      ...(displayName ? { displayName } : {}),
      ...(storedInvite ? { inviteCode: storedInvite } : {}),
    }).catch((error: unknown) => {
      onboardingStarted.current = false;
      setOnboardingError(accessErrorMessage(
        error,
        "Profil nije mogao da se poveže sa pozivnicom. Otvori pozivni link ponovo.",
      ));
    });
  }, [ensureCurrent, inviteCode, isAuthenticated, profile]);

  useEffect(() => {
    if (!profile || !inviteCode || inviteClaimStarted.current) return;

    const justSignedUp = window.sessionStorage.getItem("notion-clone-invite") === inviteCode;
    if (justSignedUp) {
      window.sessionStorage.removeItem("notion-clone-pending-name");
      window.sessionStorage.removeItem("notion-clone-invite");
      router.replace("/");
      return;
    }

    inviteClaimStarted.current = true;
    void claimInvite({
      email: profile.email,
      code: inviteCode,
      displayName: profile.displayName,
    })
      .then(() => router.replace("/"))
      .catch((error: unknown) => {
        inviteClaimStarted.current = false;
        setInviteError(accessErrorMessage(
          error,
          "Pozivnica nije mogla da se prihvati.",
        ));
      });
  }, [claimInvite, inviteCode, inviteRetry, profile, router]);

  useEffect(() => {
    if (profile && !inviteCode) {
      window.sessionStorage.removeItem("notion-clone-pending-name");
      window.sessionStorage.removeItem("notion-clone-invite");
    }
  }, [inviteCode, profile]);

  const handleSignOut = () => {
    onboardingStarted.current = false;
    inviteClaimStarted.current = false;
    setOnboardingError(null);
    setInviteError(null);
    void signOut();
  };

  if (isLoading) return <FullScreenLoader />;
  if (!isAuthenticated) return <AuthScreen inviteCode={inviteCode} />;
  if (profile === undefined) return <FullScreenLoader />;
  if (profile === null && onboardingError) {
    return (
      <AccessProblem
        message={onboardingError}
        onSignOut={handleSignOut}
      />
    );
  }
  if (profile === null) return <FullScreenLoader />;

  return (
    <>
      <WorkspaceShell profile={profile} onSignOut={handleSignOut} />
      {inviteCode && inviteError ? (
        <InviteProblem
          message={inviteError}
          onRetry={() => {
            inviteClaimStarted.current = false;
            setInviteError(null);
            setInviteRetry((current) => current + 1);
          }}
          onDismiss={() => {
            setInviteError(null);
            router.replace("/");
          }}
        />
      ) : null}
    </>
  );
}
