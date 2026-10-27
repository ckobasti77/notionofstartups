"use client";

import { KeyRound } from "lucide-react";
import { SETTINGS_TEXT, memberRoleLabel } from "@devotion/shared";

import { Button } from "@/components/ui/button";
import { EmptyState, ProfileAvatar } from "@/components/workspace/workspace-ui";

import { SettingsListError, SettingsListSkeleton, type SettingsListState } from "./settings-view";

export type SettingsPasswordProfile = {
  profileId: string;
  displayName: string;
  email: string;
  role: "admin" | "member";
  avatarUrl: string | null;
};

export type PasswordsTabProps = {
  profiles: SettingsListState<SettingsPasswordProfile>;
  currentProfileId: string | null;
  onPick: (profile: SettingsPasswordProfile) => void;
};

/** Lozinke (samo admin): nova lozinka za bilo kog člana; dijalog otvara kontejner. */
export function PasswordsTab({ profiles, currentProfileId, onPick }: PasswordsTabProps) {
  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-muted-foreground">{SETTINGS_TEXT.passwordsNote}</p>
      {profiles.status === "loading" ? (
        <SettingsListSkeleton label="Učitavanje članova" />
      ) : profiles.status === "error" ? (
        <SettingsListError what="Članovi" onRetry={profiles.onRetry} />
      ) : profiles.items.length === 0 ? (
        <EmptyState size="section" title="Nema članova." />
      ) : (
        <ul className="space-y-0.5" aria-label="Članovi">
          {profiles.items.map((profile) => (
            <li key={profile.profileId} className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1 hover:bg-muted/60">
              <ProfileAvatar profile={profile} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{profile.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">{profile.email}</span>
              </span>
              <span className="text-xs text-muted-foreground">{memberRoleLabel(profile.role)}</span>
              {profile.profileId === currentProfileId ? (
                <span className="text-xs text-muted-foreground">Ti</span>
              ) : (
                <Button type="button" variant="outline" size="sm" aria-label={`Nova lozinka za ${profile.displayName}`} onClick={() => onPick(profile)}>
                  <KeyRound aria-hidden="true" /> Nova lozinka
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
