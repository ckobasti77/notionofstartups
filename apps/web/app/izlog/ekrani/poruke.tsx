"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { findHubChannel, hubGroupKey, hubGroups } from "@devotion/shared";

import { ChatHubView, hubFocusFallback } from "@/components/me/chat/chat-hub-view";
import type { HubListState } from "@/components/me/chat/hub-list";
import { GroupSettingsDialog, NewDmDialog, NewGroupDialog } from "@/components/me/chat/people-dialogs";
import { ConversationPane } from "@/components/workspace/chat/conversation-pane";

import type { IzlogEkranProps } from "../registry";
import {
  CLUCK_MARKETING,
  DM_MILICA,
  GROUP_VIKEND,
  IZLOG_GROUP_MEMBER_IDS,
  IZLOG_HUB,
  IZLOG_HUB_EMPTY,
  IZLOG_MEMBERS,
  IZLOG_MESSAGES,
  IZLOG_PEOPLE,
  IZLOG_TEAM,
} from "../fixtures/chat";
import { IZLOG_PROFILE, IZLOG_STARTUPS } from "../fixtures/me";
import { IZLOG_NOW } from "../fixtures/now";

/** Razgovor otvoren na početku varijante. */
const START: Record<string, string | null> = {
  hub: DM_MILICA._id,
  "startup-kanal": CLUCK_MARKETING._id,
  "podesavanja-grupe": GROUP_VIKEND._id,
};

const noop = () => {};

/**
 * Poruke u izlogu (K15): isti `ChatHubView`, `ConversationPane` i dijalozi kao
 * u aplikaciji, sa lokalnim podacima umesto upita (razgovor dobija statične
 * poruke kroz `preview`, bez pretplate). Izbor razgovora, pretraga, sklapanje
 * grupa i dijalozi rade nad stanjem u memoriji.
 */
export default function PorukeEkran({ varijanta }: IzlogEkranProps) {
  return <IzlogPoruke key={varijanta} varijanta={varijanta} />;
}

function IzlogPoruke({ varijanta }: { varijanta: string }) {
  const hub = varijanta === "prazan" ? IZLOG_HUB_EMPTY : IZLOG_HUB;
  const [active, setActive] = useState<string | null>(START[varijanta] ?? null);
  const [query, setQuery] = useState("");
  // Jedna sklopljena grupa pokazuje i to stanje zaglavlja.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set([hubGroupKey(IZLOG_STARTUPS[5]._id)]));
  const [dmOpen, setDmOpen] = useState(varijanta === "nova-poruka" || varijanta === "nova-poruka-ucitavanje");
  const [groupOpen, setGroupOpen] = useState(varijanta === "nova-grupa");
  const [settingsOpen, setSettingsOpen] = useState(varijanta === "podesavanja-grupe");

  const groups = useMemo(() => hubGroups(hub, { query, collapsed }), [hub, query, collapsed]);
  const state: HubListState =
    varijanta === "ucitavanje"
      ? { status: "loading" }
      : varijanta === "greska"
        ? { status: "error", retry: () => toast.info("U izlogu nema servera.") }
        : { status: "ready", input: hub, capped: false };
  const channel = active ? findHubChannel(hub, active) : null;
  const startup = channel?.startupId ? (IZLOG_STARTUPS.find((item) => item._id === channel.startupId) ?? null) : null;
  const memberIds = new Set<string>(IZLOG_GROUP_MEMBER_IDS);
  const groupMembers = IZLOG_PEOPLE.filter((item) => memberIds.has(item._id));

  const conversation = channel ? (
    <ConversationPane
      key={channel._id}
      startup={startup}
      profile={IZLOG_PROFILE}
      channel={channel}
      members={channel.startupId === null ? (IZLOG_MEMBERS[channel._id] ?? []) : IZLOG_TEAM}
      onOpenList={() => setActive(null)}
      onOpenPage={noop}
      splitAt="xl"
      contextLabel={startup?.name}
      onOpenInStartup={startup ? () => toast.info(`Otvara chat startupa ${startup.name}.`) : undefined}
      onOpenGroupSettings={channel.startupId === null && channel.kind === "custom" ? () => setSettingsOpen(true) : undefined}
      preview={IZLOG_MESSAGES[channel._id] ?? []}
      animateArrivals
    />
  ) : null;

  return (
    <div className="desk-surface h-[44rem] overflow-hidden rounded-2xl border bg-background">
      <ChatHubView
        now={IZLOG_NOW}
        meId={IZLOG_PROFILE._id}
        state={state}
        groups={state.status === "ready" ? groups : []}
        query={query}
        onQueryChange={setQuery}
        onToggleGroup={(key) =>
          setCollapsed((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          })
        }
        activeChannelId={active}
        onSelect={setActive}
        onNewMessage={() => setDmOpen(true)}
        onNewGroup={() => setGroupOpen(true)}
        conversation={conversation}
      />
      <NewDmDialog
        open={dmOpen}
        onOpenChange={setDmOpen}
        people={varijanta === "nova-poruka-ucitavanje" ? { status: "loading" } : { status: "ready", people: IZLOG_PEOPLE }}
        pendingId={null}
        returnFocusFallback={hubFocusFallback}
        onPick={(personId) => {
          setDmOpen(false);
          if (personId === DM_MILICA.otherParticipant?._id) setActive(DM_MILICA._id);
          else toast.info("U izlogu postoji samo razgovor sa Milicom.");
        }}
      />
      <NewGroupDialog
        open={groupOpen}
        onOpenChange={setGroupOpen}
        returnFocusFallback={hubFocusFallback}
        people={{ status: "ready", people: IZLOG_PEOPLE }}
        initialName={varijanta === "nova-grupa" ? "Planiranje Q1" : ""}
        initialSelected={varijanta === "nova-grupa" ? IZLOG_PEOPLE.slice(0, 2).map((item) => item._id) : []}
        onCreate={async (name) => {
          setGroupOpen(false);
          toast.success(`Grupa „${name}“ je napravljena.`);
          return null;
        }}
      />
      <GroupSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        returnFocusFallback={hubFocusFallback}
        state={{ status: "ready", name: GROUP_VIKEND.name, isOwner: true, members: groupMembers, people: IZLOG_PEOPLE }}
        onSave={async () => {
          toast.success("Grupa je sačuvana.", { duration: 8000, action: { label: "Poništi", onClick: noop } });
          return null;
        }}
        onLeave={async () => {
          toast.success("Grupa je napuštena.");
          setActive(null);
          return null;
        }}
      />
    </div>
  );
}
