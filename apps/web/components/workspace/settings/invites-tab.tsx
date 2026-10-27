"use client";

import { useState } from "react";
import { Copy, MailPlus } from "lucide-react";
import { INVITE_STATUS_LABEL, canRevokeInvite, inviteStatus } from "@devotion/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/workspace/workspace-ui";

import { SettingsListError, SettingsListSkeleton, type SettingsListState } from "./settings-view";

export type SettingsInvite = {
  _id: string;
  email: string;
  claimedAt: number | null;
  revokedAt: number | null;
  expiresAt: number;
};

export type InvitesTabProps = {
  invites: SettingsListState<SettingsInvite>;
  now: number;
  busy: boolean;
  /** Kod nove pozivnice, ili `null` kad nije napravljena. */
  onCreate: (email: string) => Promise<string | null>;
  onRevoke: (inviteId: string) => void;
  onCopyLink: (code: string) => void;
};

/** Pozivnice (samo admin): nova pozivnica sa linkom i lista postojećih. */
export function InvitesTab({ invites, now, busy, onCreate, onRevoke, onCopyLink }: InvitesTabProps) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    const created = await onCreate(email.trim());
    if (created) {
      setCode(created);
      setEmail("");
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <form className="flex flex-wrap items-center gap-2" onSubmit={submit}>
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="ime@firma.com"
          aria-label="Email za pozivnicu"
          className="min-w-56 flex-1"
        />
        <Button type="submit" variant="outline" disabled={!email.trim() || busy}>
          <MailPlus aria-hidden="true" /> Pozovi
        </Button>
      </form>
      {code ? (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <span className="w-full text-xs text-muted-foreground">Link se prikazuje samo sada.</span>
          <code className="min-w-0 flex-1 break-all text-xs">/?invite={code}</code>
          <Button type="button" variant="outline" size="sm" onClick={() => onCopyLink(code)}>
            <Copy aria-hidden="true" /> Kopiraj link
          </Button>
        </div>
      ) : null}
      {invites.status === "loading" ? (
        <SettingsListSkeleton label="Učitavanje pozivnica" />
      ) : invites.status === "error" ? (
        <SettingsListError what="Pozivnice" onRetry={invites.onRetry} />
      ) : invites.items.length === 0 ? (
        <EmptyState size="section" title="Još nema pozivnica." />
      ) : (
        <ul className="space-y-0.5" aria-label="Pozivnice">
          {invites.items.map((invite) => {
            const status = inviteStatus(invite, now);
            return (
              <li key={invite._id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1 hover:bg-muted/60">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{invite.email}</span>
                  <span className="block text-xs text-muted-foreground">{INVITE_STATUS_LABEL[status]}</span>
                </span>
                {canRevokeInvite(status) ? (
                  <Button type="button" variant="ghost" size="sm" aria-label={`Opozovi pozivnicu za ${invite.email}`} disabled={busy} onClick={() => onRevoke(invite._id)}>
                    Opozovi
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
