"use client";

import { useMemo, useState, type ComponentProps } from "react";
import { Gauge } from "lucide-react";

import { buildMyDay, openByStartup, openTodayCount } from "@/components/me/my-day/my-day-model";
import { MyDayView } from "@/components/me/my-day/my-day-view";
import { MeSidebar, type MeSidebarProps } from "@/components/me/shell/me-sidebar";
import { MobileScopeHeader } from "@/components/me/shell/mobile-scope-header";
import { railDirection, railKey, type RailScope } from "@/components/me/shell/scope";
import type { ScopeChipsProps } from "@/components/me/shell/scope-chips";
import { ScopeSwap } from "@/components/me/shell/scope-swap";
import { MotionStage } from "@/components/motion/motion-stage";
import { ShortcutProvider, useShortcuts } from "@/components/shortcuts/shortcut-provider";
import { WorkspaceRail } from "@/components/workspace/workspace-rail";
import {
  MobileMenuPanel,
  MobileWorkspaceMenu,
  WorkspaceSidebar,
} from "@/components/workspace/workspace-sidebar";
import { EmptyState } from "@/components/workspace/workspace-ui";
import { SHELL_SHORTCUTS } from "@/lib/shortcuts/registry";

import type { IzlogEkranProps } from "../registry";
import {
  IZLOG_BADGES,
  IZLOG_CHAT_UNREAD,
  IZLOG_INBOX_UNREAD,
  IZLOG_OVERVIEW,
  IZLOG_PROFILE,
  IZLOG_STARTUPS,
  izlogStartupId,
} from "../fixtures/me";
import { IZLOG_NOW } from "../fixtures/now";

const noop = () => {};

const RAIL_STARTUPS = IZLOG_STARTUPS.map((startup) => ({
  id: startup._id,
  name: startup.name,
  logoUrl: startup.logoUrl,
}));

const STARTUP_ORDER = IZLOG_STARTUPS.map((startup) => startup._id as string);

function sidebarFixture(startupIndex: number): ComponentProps<typeof WorkspaceSidebar> {
  return {
    profile: IZLOG_PROFILE,
    startup: IZLOG_STARTUPS[startupIndex],
    route: { kind: "today" },
    collapsed: false,
    expandedAreas: {},
    expandedPageIds: new Set(),
    transientExpandedAreaIds: new Set(),
    transientExpandedPageIds: new Set(),
    activeThoughtDropTarget: null,
    onCollapsedChange: noop,
    onAreaExpandedChange: noop,
    onPageExpandedChange: noop,
    onRouteChange: noop,
    onCreate: noop,
    onCreateArea: noop,
    onSearch: noop,
    onAdmin: noop,
    onProfile: noop,
    onSignOut: noop,
    draggedPageId: null,
    activeDropPageId: null,
    activeDropAreaId: null,
    pendingApprovals: 2,
    unreadNotifications: 5,
    chatUnread: 3,
    onOpenNotifications: noop,
    onDragPageStart: noop,
    onDragPageEnd: noop,
    onDragPageOver: noop,
    onDropPage: noop,
  };
}

function useMeFixtures(scope: RailScope, onScope: (next: RailScope) => void) {
  const model = useMemo(() => buildMyDay(IZLOG_OVERVIEW, IZLOG_NOW), []);
  const open = useMemo(() => openByStartup(IZLOG_OVERVIEW, IZLOG_NOW), []);
  const meSidebar: MeSidebarProps = {
    profile: IZLOG_PROFILE,
    active: scope.kind === "me" ? "me-today" : null,
    counts: {
      today: openTodayCount(model.counts),
      inbox: IZLOG_INBOX_UNREAD,
      inboxCapped: false,
      chat: IZLOG_CHAT_UNREAD,
    },
    startups: RAIL_STARTUPS.map((startup) => ({
      ...startup,
      openCount: open[startup.id] ?? 0,
      capped: false,
    })),
    onNavigate: noop,
    onOpenStartup: (id) => onScope({ kind: "startup", startupId: id }),
  };
  const scopeChips: ScopeChipsProps = {
    profile: IZLOG_PROFILE,
    startups: RAIL_STARTUPS,
    active: scope,
    badges: IZLOG_BADGES,
    onSelectMe: () => onScope({ kind: "me" }),
    onSelectStartup: (id) => onScope({ kind: "startup", startupId: id }),
    onCreateStartup: noop,
  };
  return { model, meSidebar, scopeChips };
}

/** Ljuska u okviru: traka + meni opsega + sadržaj; klik na traku menja opseg (pokret trenutka 2). */
function ShellPrimer({ initial }: { initial: RailScope }) {
  const [state, setState] = useState<{ scope: RailScope; direction: -1 | 0 | 1 }>({
    scope: initial,
    direction: 0,
  });
  const select = (next: RailScope) =>
    setState((current) => ({ scope: next, direction: railDirection(current.scope, next, STARTUP_ORDER) }));
  const { scope } = state;
  const { model, meSidebar, scopeChips } = useMeFixtures(scope, select);
  const startupIndex =
    scope.kind === "startup" ? Math.max(0, IZLOG_STARTUPS.findIndex((item) => item._id === scope.startupId)) : 0;
  const startup = IZLOG_STARTUPS[startupIndex];
  const sidebar = sidebarFixture(startupIndex);
  const meActive = scope.kind === "me";

  return (
    <div className="app-canvas desk-surface flex h-[46rem] overflow-hidden rounded-2xl border bg-background">
      <WorkspaceRail
        className="h-full"
        profile={IZLOG_PROFILE}
        startups={RAIL_STARTUPS}
        active={scope}
        isAdmin
        badges={IZLOG_BADGES}
        onSelectMe={() => select({ kind: "me" })}
        onSelectStartup={(id) => select({ kind: "startup", startupId: id })}
        onCreateStartup={noop}
        onProfile={noop}
        onSignOut={noop}
      />
      <ScopeSwap scopeKey={railKey(scope)} direction={state.direction} className="hidden h-full shrink-0 lg:flex">
        {meActive ? (
          <aside className="h-full w-[18.5rem] shrink-0 border-r border-sidebar-border bg-sidebar">
            <MeSidebar {...meSidebar} />
          </aside>
        ) : (
          <WorkspaceSidebar {...sidebar} />
        )}
      </ScopeSwap>
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileScopeHeader
          menu={<MobileWorkspaceMenu {...sidebar} scopeChips={scopeChips} me={meActive ? meSidebar : null} />}
          scope={
            meActive
              ? { kind: "me", profile: IZLOG_PROFILE, title: "Moj dan" }
              : { kind: "startup", startup, subtitle: "Komandni centar", onSearch: noop }
          }
          notifications={{
            label: meActive ? "Inbox" : "Obaveštenja",
            count: meActive ? IZLOG_INBOX_UNREAD : 5,
            capped: false,
            onOpen: noop,
          }}
        />
        <MotionStage as="div" viewKey={railKey(scope)}>
          {meActive ? (
            <MyDayView
              now={IZLOG_NOW}
              firstName="Jovan"
              state={{ status: "ready", model }}
              groupMode="time"
              onGroupModeChange={noop}
              side={null}
              canOpen={(row) => row.kind === "task"}
              onQuickAdd={noop}
              onPlanDay={noop}
              onOpenTasks={noop}
            />
          ) : (
            <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-7 lg:px-8 lg:py-8">
              <p data-workspace-enter className="text-xs font-medium text-muted-foreground">{startup.name}</p>
              <h1 data-workspace-enter className="mt-1 text-2xl font-bold tracking-[-0.035em] sm:text-3xl">
                Komandni centar
              </h1>
              <div data-workspace-enter className="mt-6">
                <EmptyState
                  icon={Gauge}
                  title="Sadržaj startupa"
                  description="Komandni centar ostaje isti; izlog ljuske prikazuje samo traku i meni startupa."
                />
              </div>
            </div>
          )}
        </MotionStage>
      </div>
    </div>
  );
}

/** Mobilni meni u mestu (bez Sheet okvira): opseg „Ja" i opseg startupa. */
function MeniPrimer() {
  const [meScope, setMeScope] = useState<RailScope>({ kind: "me" });
  const startupScope: RailScope = { kind: "startup", startupId: izlogStartupId(0) };
  const me = useMeFixtures(meScope, setMeScope);
  const startupFixtures = useMeFixtures(startupScope, noop);
  const panels = [
    {
      naslov: "Opseg „Ja“",
      props: { ...sidebarFixture(0), scopeChips: me.scopeChips, me: me.meSidebar },
    },
    {
      naslov: "Opseg startupa",
      props: { ...sidebarFixture(0), scopeChips: startupFixtures.scopeChips, me: null },
    },
  ];
  return (
    <div className="grid justify-items-center gap-6 md:grid-cols-2">
      {panels.map((panel) => (
        <section key={panel.naslov} aria-label={panel.naslov} className="w-full max-w-[22rem]">
          <h2 className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {panel.naslov}
          </h2>
          <div className="desk-surface h-[42rem] overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar">
            <MobileMenuPanel {...panel.props} onClose={noop} />
          </div>
        </section>
      ))}
    </div>
  );
}

/** Prečice ljuske u izlogu: `?` otvara dijalog pomoći sa njima. */
function IzlogPrecice() {
  useShortcuts([SHELL_SHORTCUTS.search, SHELL_SHORTCUTS.quickAdd], noop);
  return null;
}

export default function LjuskaEkran({ varijanta }: IzlogEkranProps) {
  if (varijanta === "meni") return <MeniPrimer />;
  return (
    <ShortcutProvider>
      <IzlogPrecice />
      <ShellPrimer
        key={varijanta}
        initial={varijanta === "startup" ? { kind: "startup", startupId: izlogStartupId(0) } : { kind: "me" }}
      />
    </ShortcutProvider>
  );
}
