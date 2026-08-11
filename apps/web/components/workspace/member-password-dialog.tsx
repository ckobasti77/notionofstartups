"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { Eye, EyeOff, KeyRound, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/** Isti tekst kao server `validatePasswordRequirements` (auth.ts) i mobilni klijent. */
const PASSWORD_HINT =
  "Lozinka mora imati 12-128 znakova, veliko i malo slovo, broj i specijalni znak.";

/**
 * Mali dijalog za postavljanje NOVE lozinke jednom članu. Otvara ga „Lozinke" tab
 * u `admin-dialog.tsx` (renderovan kao sibling — Radix podržava složene dijaloge).
 * Naslov nosi ime člana (potvrda), a poziv ide na `adminAuth.adminSetPassword`
 * (prva `useAction` u web app). Lozinka se nigde ne pamti niti vraća.
 */
export function MemberPasswordDialog({
  target,
  onOpenChange,
}: {
  target: { profileId: Id<"profiles">; displayName: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const changePassword = useAction(api.adminAuth.adminSetPassword);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  function reset() {
    setPassword("");
    setShow(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!target || !password || busy) return;
    setBusy(true);
    try {
      await changePassword({ profileId: target.profileId, newPassword: password });
      toast.success(`Lozinka za ${target.displayName} je promenjena.`);
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Lozinka nije promenjena.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" /> Nova lozinka
          </DialogTitle>
          <DialogDescription>
            {target
              ? `Postavljaš novu lozinku za ${target.displayName}. Sve njegove/njene ranije prijave se poništavaju.`
              : null}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="member-new-password">Nova lozinka</Label>
            <div className="relative">
              <Input
                id="member-new-password"
                type={show ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Najmanje 12 znakova"
                autoComplete="off"
                autoFocus
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((prev) => !prev)}
                aria-label={show ? "Sakrij lozinku" : "Prikaži lozinku"}
                className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-[11px] leading-5 text-muted-foreground">
              {PASSWORD_HINT}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Otkaži
            </Button>
            <Button type="submit" disabled={busy || !password}>
              {busy ? <LoaderCircle className="animate-spin" /> : <KeyRound />}
              Postavi novu lozinku
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
