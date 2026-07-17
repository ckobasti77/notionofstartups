"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, LogOut } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { AppMark } from "@/components/app-mark";
import { AuthScreen } from "@/components/auth/auth-screen";
import { Button } from "@/components/ui/button";

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
      setOnboardingError(
        error instanceof Error
          ? error.message
          : "Profil nije mogao da se poveže sa pozivnicom. Otvori pozivni link ponovo.",
      );
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
        setOnboardingError(
          error instanceof Error ? error.message : "Pozivnica nije mogla da se prihvati.",
        );
      });
  }, [claimInvite, inviteCode, profile, router]);

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
    void signOut();
  };

  if (isLoading) return <FullScreenLoader />;
  if (!isAuthenticated) return <AuthScreen inviteCode={inviteCode} />;
  if (onboardingError) {
    return (
      <AccessProblem
        message={`${onboardingError.replace(/^\[CONVEX[^\]]*\]\s*/, "")} Ako je poziv istekao, administrator može napraviti novi.`}
        onSignOut={handleSignOut}
      />
    );
  }
  if (profile === undefined || profile === null) return <FullScreenLoader />;

  return <WorkspaceShell profile={profile} onSignOut={handleSignOut} />;
}
