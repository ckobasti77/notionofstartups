"use client";

import { useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { memberRoleLabel, removeMemberQuestion } from "@devotion/shared";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ProfileAvatar } from "@/components/workspace/workspace-ui";

import { SettingsListError, SettingsListSkeleton, type SettingsListState } from "./settings-view";

export type SettingsMember = {
  profileId: string;
  displayName: string;
  email: string;
  role: "admin" | "member";
  avatarUrl: string | null;
};

export type SettingsCandidate = { profileId: string; displayName: string; email: string };

export type TeamTabProps = {
  members: SettingsListState<SettingsMember>;
  /** Dodavanje i uklanjanje članova je samo za admina. */
  isAdmin: boolean;
  currentProfileId: string | null;
  /** Profili koji još nisu u startupu (samo admin ih vidi); `null` dok se ne učitaju ili kad upit padne. */
  candidates: ReadonlyArray<SettingsCandidate> | null;
  busy: boolean;
  onAdd: (profileId: string) => Promise<boolean>;
  onRemove: (profileId: string) => Promise<boolean>;
};

/** Tim: članovi startupa; admin dodaje i uklanja. */
export function TeamTab({ members, isAdmin, currentProfileId, candidates, busy, onAdd, onRemove }: TeamTabProps) {
  const [pick, setPick] = useState("");
  const [removing, setRemoving] = useState<SettingsMember | null>(null);

  return (
    <div className="max-w-xl space-y-6">
      {isAdmin ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="min-w-56 flex-1" aria-label="Profil za dodavanje">
              <SelectValue placeholder={candidates === null ? "Profili nisu učitani" : candidates.length === 0 ? "Nema profila za dodavanje" : "Izaberi profil"} />
            </SelectTrigger>
            <SelectContent>
              {(candidates ?? []).map((candidate) => (
                <SelectItem key={candidate.profileId} value={candidate.profileId}>
                  {candidate.displayName} · {candidate.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            disabled={!pick || busy || candidates === null}
            onClick={async () => {
              if (await onAdd(pick)) setPick("");
            }}
          >
            <UserPlus aria-hidden="true" /> Dodaj člana
          </Button>
        </div>
      ) : null}
      {members.status === "loading" ? (
        <SettingsListSkeleton label="Učitavanje članova" />
      ) : members.status === "error" ? (
        <SettingsListError what="Tim" onRetry={members.onRetry} />
      ) : members.items.length === 0 ? (
        <EmptyState size="section" title="Nema članova." />
      ) : (
        <ul className="space-y-0.5" aria-label="Članovi tima">
          {members.items.map((member) => (
            <li key={member.profileId} className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1 hover:bg-muted/60">
              <ProfileAvatar profile={member} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{member.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">{member.email}</span>
              </span>
              <span className="text-xs text-muted-foreground">{memberRoleLabel(member.role)}</span>
              {isAdmin && member.profileId !== currentProfileId ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Ukloni ${member.displayName}`}
                  disabled={busy}
                  onClick={() => setRemoving(member)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              ) : isAdmin ? (
                <span className="size-9 shrink-0" aria-hidden="true" />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={removing !== null} onOpenChange={(open) => (open ? undefined : setRemoving(null))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ukloni člana</DialogTitle>
            <DialogDescription>{removing ? removeMemberQuestion(removing.displayName) : null}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoving(null)}>
              Otkaži
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (removing && (await onRemove(removing.profileId))) setRemoving(null);
              }}
            >
              Ukloni
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
