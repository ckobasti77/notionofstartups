"use client";

import { useState } from "react";
import type { SettingsTabKey } from "@devotion/shared";

import { AreasTab } from "@/components/workspace/settings/areas-tab";
import { GeneralTab } from "@/components/workspace/settings/general-tab";
import { InvitesTab } from "@/components/workspace/settings/invites-tab";
import { PasswordsTab } from "@/components/workspace/settings/passwords-tab";
import { SettingsView, type SettingsListState } from "@/components/workspace/settings/settings-view";
import { TeamTab, type SettingsMember } from "@/components/workspace/settings/team-tab";

import type { IzlogEkranProps } from "../registry";
import { IZLOG_NOW } from "../fixtures/now";

const noop = () => {};
const noopAsync = async () => true;

const AREAS = [
  { _id: "area-1", label: "Razvoj" },
  { _id: "area-2", label: "Marketing" },
  { _id: "area-3", label: "Prodaja" },
  { _id: "area-4", label: "Ostalo" },
];

const MEMBERS: SettingsMember[] = [
  { profileId: "p-1", displayName: "Jovan Milojević", email: "jovan@firma.rs", role: "admin", avatarUrl: null },
  { profileId: "p-2", displayName: "Ana Petrović", email: "ana@firma.rs", role: "member", avatarUrl: null },
  { profileId: "p-3", displayName: "Marko Jovanović", email: "marko@firma.rs", role: "member", avatarUrl: null },
];

const DAY = 24 * 60 * 60 * 1000;
const INVITES = [
  { _id: "i-1", email: "nina@firma.rs", claimedAt: null, revokedAt: null, expiresAt: IZLOG_NOW + 5 * DAY },
  { _id: "i-2", email: "luka@firma.rs", claimedAt: IZLOG_NOW - 2 * DAY, revokedAt: null, expiresAt: IZLOG_NOW + 3 * DAY },
  { _id: "i-3", email: "mila@firma.rs", claimedAt: null, revokedAt: null, expiresAt: IZLOG_NOW - DAY },
];

const VARIANT_TAB: Record<string, SettingsTabKey> = {
  "opste-admin": "opste",
  "opste-clan": "opste",
  oblasti: "oblasti",
  tim: "tim",
  "tim-clan": "tim",
  pozivnice: "pozivnice",
  lozinke: "lozinke",
  ucitavanje: "tim",
  greska: "tim",
};

/** Podešavanja startupa (K20): kartice za admina i člana, učitavanje i greška. */
export default function PodesavanjaStartupaEkran({ varijanta }: IzlogEkranProps) {
  const isAdmin = varijanta !== "opste-clan" && varijanta !== "tim-clan";
  const [tab, setTab] = useState<SettingsTabKey>(VARIANT_TAB[varijanta] ?? "opste");
  const [areas, setAreas] = useState(AREAS);
  const listState = <T,>(items: T[]): SettingsListState<T> =>
    varijanta === "ucitavanje"
      ? { status: "loading" }
      : varijanta === "greska"
        ? { status: "error", onRetry: noop }
        : { status: "ready", items };

  return (
    <div className="app-canvas desk-surface min-h-[40rem] overflow-hidden rounded-2xl border bg-background">
      <SettingsView tab={tab} onTabChange={setTab} isAdmin={isAdmin}>
        {tab === "opste" ? (
          <GeneralTab
            name="Cluck Rush"
            description="Aplikacija za naručivanje hrane za ceo kancelarijski sprat."
            logoUrl={null}
            canEdit={isAdmin}
            busy={false}
            onSave={noopAsync}
            onRemoveLogo={noop}
          />
        ) : null}
        {tab === "oblasti" ? (
          <AreasTab
            areas={areas}
            busy={false}
            onRename={async (areaId, label) => {
              setAreas((current) => current.map((area) => (area._id === areaId ? { ...area, label } : area)));
              return true;
            }}
            onMove={noop}
            onCreate={noopAsync}
          />
        ) : null}
        {tab === "tim" ? (
          <TeamTab
            members={listState(MEMBERS)}
            isAdmin={isAdmin}
            currentProfileId="p-1"
            candidates={[{ profileId: "p-9", displayName: "Teodora Ilić", email: "teodora@firma.rs" }]}
            busy={false}
            onAdd={noopAsync}
            onRemove={noopAsync}
          />
        ) : null}
        {tab === "pozivnice" ? (
          <InvitesTab invites={listState(INVITES)} now={IZLOG_NOW} busy={false} onCreate={async () => null} onRevoke={noop} onCopyLink={noop} />
        ) : null}
        {tab === "lozinke" ? <PasswordsTab profiles={listState(MEMBERS)} currentProfileId="p-1" onPick={noop} /> : null}
      </SettingsView>
    </div>
  );
}
