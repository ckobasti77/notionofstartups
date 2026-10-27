"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import {
  SETTINGS_TEXT,
  moveInOrder,
  resolveSettingsTab,
  type SettingsTabKey,
} from "@devotion/shared";

import { MemberPasswordDialog } from "@/components/workspace/member-password-dialog";
import type { ProfileWithAvatar, StartupWithAreas } from "@/components/workspace/types";
import { useQueryResult } from "@/components/workspace/workspace-error-boundary";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/errors";

import { AreasTab } from "./areas-tab";
import { GeneralTab } from "./general-tab";
import { InvitesTab } from "./invites-tab";
import { PasswordsTab } from "./passwords-tab";
import { SettingsView, type SettingsListState } from "./settings-view";
import { TeamTab } from "./team-tab";

/** Pokreni radnju sa zauzetošću i toastom; `true` kad je uspela. */
function useBusyAction() {
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>, success: string | null, fallback: string) {
    setBusy(true);
    try {
      await action();
      if (success) toast.success(success);
      return true;
    } catch (error) {
      toast.error(accessErrorMessage(error, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

type SettingsContainerProps = {
  startup: StartupWithAreas;
  profile: ProfileWithAvatar;
  tab: SettingsTabKey | undefined;
  onTabChange: (tab: SettingsTabKey) => void;
};

/**
 * Podešavanja startupa — kontejner (PROSTOR K20): upiti i mutacije koje
 * postoje i na telefonu. Ime, opis, logo, članovi, pozivnice i lozinke traže
 * admina; oblasti menja svaki član startupa.
 */
export function SettingsContainer({ startup, profile, tab: requestedTab, onTabChange }: SettingsContainerProps) {
  const isAdmin = profile.role === "admin";
  const tab = resolveSettingsTab(requestedTab, isAdmin);
  // „Pokušaj ponovo" ponovo montira panel, pa se upit ponovo pretplati.
  const [retry, setRetry] = useState(0);
  const onRetry = () => setRetry((value) => value + 1);
  return (
    <SettingsView tab={tab} onTabChange={onTabChange} isAdmin={isAdmin}>
      {tab === "opste" ? <GeneralPanel startup={startup} canEdit={isAdmin} /> : null}
      {tab === "oblasti" ? <AreasPanel startup={startup} /> : null}
      {tab === "tim" ? <TeamPanel key={retry} startup={startup} profile={profile} onRetry={onRetry} /> : null}
      {tab === "pozivnice" && isAdmin ? <InvitesPanel key={retry} startupId={startup._id} onRetry={onRetry} /> : null}
      {tab === "lozinke" && isAdmin ? <PasswordsPanel key={retry} profile={profile} onRetry={onRetry} /> : null}
    </SettingsView>
  );
}

function GeneralPanel({ startup, canEdit }: { startup: StartupWithAreas; canEdit: boolean }) {
  const updateStartup = useMutation(api.startups.update);
  const generateLogoUploadUrl = useMutation(api.startups.generateLogoUploadUrl);
  const setLogo = useMutation(api.startups.setLogo);
  const removeLogo = useMutation(api.startups.removeLogo);
  const { busy, run } = useBusyAction();
  return (
    <GeneralTab
      // Nov startup = nova polja; izmene iz baze usklađuje sama kartica.
      key={startup._id}
      name={startup.name}
      description={startup.description}
      logoUrl={startup.logoUrl}
      canEdit={canEdit}
      busy={busy}
      onSave={({ name, description, logoFile }) =>
        run(
          async () => {
            let storageId: Id<"_storage"> | undefined;
            if (logoFile) {
              const uploadUrl = await generateLogoUploadUrl({});
              const response = await fetch(uploadUrl, {
                method: "POST",
                headers: { "Content-Type": logoFile.type || "application/octet-stream" },
                body: logoFile,
              });
              if (!response.ok) throw new Error(SETTINGS_TEXT.logoUploadFailed);
              storageId = ((await response.json()) as { storageId: Id<"_storage"> }).storageId;
            }
            if (name !== startup.name || description !== startup.description) {
              await updateStartup({ startupId: startup._id, name, description });
            }
            if (storageId) await setLogo({ startupId: startup._id, storageId });
          },
          SETTINGS_TEXT.saved,
          SETTINGS_TEXT.notSaved,
        )
      }
      onRemoveLogo={() =>
        void run(() => removeLogo({ startupId: startup._id }), SETTINGS_TEXT.logoRemoved, SETTINGS_TEXT.notSaved)
      }
    />
  );
}

function AreasPanel({ startup }: { startup: StartupWithAreas }) {
  const createArea = useMutation(api.startups.createArea);
  const updateArea = useMutation(api.startups.updateArea);
  const reorderAreas = useMutation(api.startups.reorderAreas);
  const { busy, run } = useBusyAction();
  const areas = startup.areas;
  return (
    <AreasTab
      areas={areas}
      busy={busy}
      onRename={(areaId, label) =>
        run(
          () => updateArea({ areaId: areaId as Id<"startupAreas">, label }),
          SETTINGS_TEXT.areaRenamed,
          SETTINGS_TEXT.notSaved,
        )
      }
      onMove={(index, direction) => {
        const next = moveInOrder(
          areas.map((area) => area._id),
          index,
          direction,
        );
        if (next) {
          void run(
            () => reorderAreas({ startupId: startup._id, orderedAreaIds: next }),
            SETTINGS_TEXT.areasReordered,
            SETTINGS_TEXT.notSaved,
          );
        }
      }}
      onCreate={(label) =>
        run(() => createArea({ startupId: startup._id, label }), SETTINGS_TEXT.areaCreated, SETTINGS_TEXT.notSaved)
      }
    />
  );
}

function TeamPanel({ startup, profile, onRetry }: { startup: StartupWithAreas; profile: ProfileWithAvatar; onRetry: () => void }) {
  const isAdmin = profile.role === "admin";
  const members = useQueryResult(api.startups.listMembers, { startupId: startup._id, limit: 50 });
  const profiles = useQueryResult(api.profiles.listAll, isAdmin ? { limit: 50 } : "skip");
  const addMember = useMutation(api.startups.addMember);
  const removeMember = useMutation(api.startups.removeMember);
  const { busy, run } = useBusyAction();

  const state: SettingsListState<{
    profileId: string;
    displayName: string;
    email: string;
    role: "admin" | "member";
    avatarUrl: string | null;
  }> = members.failed
    ? { status: "error", onRetry }
    : members.data === undefined
      ? { status: "loading" }
      : {
          status: "ready",
          items: members.data.map(({ profile: member }) => ({
            profileId: member._id,
            displayName: member.displayName,
            email: member.email,
            role: member.role,
            avatarUrl: member.avatarUrl,
          })),
        };
  const candidates = useMemo(() => {
    if (members.data === undefined || profiles.data === undefined) return null;
    const inTeam = new Set(members.data.map(({ profile: member }) => member._id));
    return profiles.data
      .filter((candidate) => !inTeam.has(candidate._id))
      .map((candidate) => ({ profileId: candidate._id, displayName: candidate.displayName, email: candidate.email }));
  }, [members.data, profiles.data]);

  return (
    <TeamTab
      members={state}
      isAdmin={isAdmin}
      currentProfileId={profile._id}
      candidates={candidates}
      busy={busy}
      onAdd={(profileId) =>
        run(
          () => addMember({ startupId: startup._id, profileId: profileId as Id<"profiles"> }),
          SETTINGS_TEXT.memberAdded,
          SETTINGS_TEXT.notSaved,
        )
      }
      onRemove={(profileId) =>
        run(
          () => removeMember({ startupId: startup._id, profileId: profileId as Id<"profiles"> }),
          SETTINGS_TEXT.memberRemoved,
          SETTINGS_TEXT.notSaved,
        )
      }
    />
  );
}

function InvitesPanel({ startupId, onRetry }: { startupId: Id<"startups">; onRetry: () => void }) {
  const [now] = useState(() => Date.now());
  const invites = useQueryResult(api.invites.list, { startupId, limit: 50 });
  const createInvite = useMutation(api.invites.create);
  const revokeInvite = useMutation(api.invites.revoke);
  const { busy, run } = useBusyAction();
  const state: SettingsListState<NonNullable<typeof invites.data>[number]> = invites.failed
    ? { status: "error", onRetry }
    : invites.data === undefined
      ? { status: "loading" }
      : { status: "ready", items: invites.data };
  return (
    <InvitesTab
      invites={state}
      now={now}
      busy={busy}
      onCreate={async (email) => {
        let code: string | null = null;
        await run(
          async () => {
            code = (await createInvite({ startupId, email })).code;
          },
          SETTINGS_TEXT.inviteCreated,
          SETTINGS_TEXT.notSaved,
        );
        return code;
      }}
      onRevoke={(inviteId) =>
        void run(
          () => revokeInvite({ inviteId: inviteId as Id<"invites"> }),
          SETTINGS_TEXT.inviteRevoked,
          SETTINGS_TEXT.notSaved,
        )
      }
      onCopyLink={(code) => {
        navigator.clipboard
          .writeText(`${window.location.origin}/?invite=${encodeURIComponent(code)}`)
          .then(() => toast.success(SETTINGS_TEXT.linkCopied))
          .catch(() => toast.error("Link nije kopiran."));
      }}
    />
  );
}

function PasswordsPanel({ profile, onRetry }: { profile: ProfileWithAvatar; onRetry: () => void }) {
  const profiles = useQueryResult(api.profiles.listAll, { limit: 50 });
  const [target, setTarget] = useState<{ profileId: Id<"profiles">; displayName: string } | null>(null);
  const state: SettingsListState<{
    profileId: string;
    displayName: string;
    email: string;
    role: "admin" | "member";
    avatarUrl: string | null;
  }> = profiles.failed
    ? { status: "error", onRetry }
    : profiles.data === undefined
      ? { status: "loading" }
      : {
          status: "ready",
          items: profiles.data.map((item) => ({
            profileId: item._id,
            displayName: item.displayName,
            email: item.email,
            role: item.role,
            avatarUrl: item.avatarUrl ?? null,
          })),
        };
  return (
    <>
      <PasswordsTab
          profiles={state}
        currentProfileId={profile._id}
        onPick={(picked) =>
          setTarget({ profileId: picked.profileId as Id<"profiles">, displayName: picked.displayName })
        }
      />
      <MemberPasswordDialog target={target} onOpenChange={(open) => (open ? undefined : setTarget(null))} />
    </>
  );
}
