"use client";

import { type ComponentProps } from "react";
import { ChevronRight, Plus } from "lucide-react";

import type { ScopeChipsProps } from "@/components/me/shell/scope-chips";
import { MobileScopeHeader } from "@/components/me/shell/mobile-scope-header";
import { Button } from "@/components/ui/button";
import { WorkspaceRail } from "@/components/workspace/workspace-rail";
import { MobileMenuPanel, MobileWorkspaceMenu, WorkspaceSidebar } from "@/components/workspace/workspace-sidebar";
import type { ProfileWithAvatar, WorkspaceRoute } from "@/components/workspace/types";
import { EmptyState, ScreenHeader } from "@/components/workspace/workspace-ui";
import { showMoreLabel } from "@/components/workspace/page-tree-model";
import type { Id } from "@/convex/_generated/dataModel";
import { pageKindMeta } from "@/lib/page-kinds";

import type { IzlogEkranProps } from "../registry";
import { IZLOG_BADGES, IZLOG_PROFILE, IZLOG_STARTUPS } from "../fixtures/me";
import {
  IZLOG_MEMBER_PROFILE,
  IZLOG_MENU_STARTUP,
  IZLOG_TREE_AREA_ID,
  IZLOG_TREE_HIDDEN,
  IZLOG_TREE_PAGES,
} from "../fixtures/startup-shell";

const noop = () => {};

const RAIL_STARTUPS = [
  { id: IZLOG_MENU_STARTUP._id, name: IZLOG_MENU_STARTUP.name, logoUrl: null },
  ...IZLOG_STARTUPS.slice(1).map((startup) => ({ id: startup._id, name: startup.name, logoUrl: startup.logoUrl })),
];

/** Stablo otvorene oblasti iz fixture-a (isti izgled kao `PageTree`, bez upita). */
function FixtureTree({ areaId }: { areaId: Id<"startupAreas"> }) {
  if (areaId !== IZLOG_TREE_AREA_ID) return null;
  return (
    <div className="threadline ml-1 space-y-0.5 py-1">
      {IZLOG_TREE_PAGES.map((page, index) => {
        const Icon = pageKindMeta(page.kind).icon;
        return (
          <div key={page._id} className="threadline-item group/node pr-1">
            <div
              className={
                index === 0
                  ? "relative flex min-h-8 items-start rounded-lg bg-sidebar-accent text-sidebar-accent-foreground"
                  : "relative flex min-h-8 items-start rounded-lg text-muted-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
              }
            >
              <button
                type="button"
                data-compact="true"
                aria-label={`Prikaži podstranice za ${page.title}`}
                aria-expanded={false}
                className="ml-1 mt-0.5 grid size-7 shrink-0 place-items-center rounded-md hover:bg-background/65"
              >
                <ChevronRight className="size-3.5" />
              </button>
              <button
                type="button"
                aria-current={index === 0 ? "page" : undefined}
                className="flex min-h-8 min-w-0 flex-1 items-start gap-2 py-1.5 pr-1 text-left text-[0.8125rem]"
              >
                <Icon className="mt-0.5 size-3.5 shrink-0 opacity-75" />
                <span className="min-w-0 flex-1 whitespace-normal break-words leading-5">{page.title}</span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                data-compact="true"
                className="mr-0.5 mt-0.5 size-7 shrink-0 opacity-0 group-hover/node:opacity-100 focus:opacity-100"
                aria-label={`Dodaj podstranicu u ${page.title}`}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="flex min-h-8 w-full items-center gap-2 rounded-lg px-3 text-left text-xs text-muted-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
      >
        {showMoreLabel(IZLOG_TREE_HIDDEN, false)}
      </button>
    </div>
  );
}

function sidebarFixture(profile: ProfileWithAvatar, route: WorkspaceRoute): ComponentProps<typeof WorkspaceSidebar> {
  const canOpenSettings = profile.role === "admin";
  return {
    profile,
    startup: IZLOG_MENU_STARTUP,
    route,
    collapsed: false,
    expandedAreas: { [IZLOG_TREE_AREA_ID]: true },
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
    onOpenSettings: canOpenSettings ? noop : null,
    onOpenNotificationSettings: noop,
    onProfile: noop,
    onSignOut: noop,
    draggedPageId: null,
    activeDropPageId: null,
    activeDropAreaId: null,
    chatUnread: 5,
    renderAreaTree: (areaId) => <FixtureTree areaId={areaId} />,
    onDragPageStart: noop,
    onDragPageEnd: noop,
    onDragPageOver: noop,
    onDropPage: noop,
  };
}

const SCOPE_CHIPS: ScopeChipsProps = {
  profile: IZLOG_PROFILE,
  startups: RAIL_STARTUPS,
  active: { kind: "startup", startupId: IZLOG_MENU_STARTUP._id },
  badges: IZLOG_BADGES,
  onSelectMe: noop,
  onSelectStartup: noop,
  onCreateStartup: noop,
};

/** Ljuska startupa u okviru: traka + meni (P11) + Komandni centar kao sadržaj. */
function ShellFrame({ profile }: { profile: ProfileWithAvatar }) {
  const sidebar = sidebarFixture(profile, { kind: "today" });
  return (
    <div className="app-canvas desk-surface flex h-[46rem] overflow-hidden rounded-2xl border bg-background">
      <WorkspaceRail
        className="h-full"
        profile={profile}
        startups={RAIL_STARTUPS}
        active={{ kind: "startup", startupId: IZLOG_MENU_STARTUP._id }}
        isAdmin={profile.role === "admin"}
        badges={IZLOG_BADGES}
        onSelectMe={noop}
        onSelectStartup={noop}
        onCreateStartup={noop}
        onProfile={noop}
        onNotificationSettings={noop}
        onSignOut={noop}
      />
      <div className="hidden h-full shrink-0 lg:flex [&>aside]:h-full">
        <WorkspaceSidebar {...sidebar} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileScopeHeader
          menu={<MobileWorkspaceMenu {...sidebar} scopeChips={SCOPE_CHIPS} me={null} />}
          scope={{ kind: "startup", startup: IZLOG_MENU_STARTUP, subtitle: "Komandni centar", onSearch: noop }}
          notifications={{ label: "Inbox", count: 4, capped: false, onOpen: noop }}
        />
        <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-6">
          <ScreenHeader
            title="Komandni centar"
            actions={
              <Button>
                <Plus /> Novi zadatak
              </Button>
            }
          />
          <EmptyState
            headingAs="h2"
            title="Sadržaj prikaza"
            description="Izlog ljuske prikazuje meni startupa; blokovi Komandnog centra su K19."
          />
        </div>
      </div>
    </div>
  );
}

/** Mobilni meni startupa u mestu (bez Sheet okvira) — isti sadržaj kao bočni meni. */
function MobileMenuFrame() {
  return (
    <div className="flex justify-center">
      <div className="desk-surface h-[44rem] w-full max-w-[22rem] overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar">
        <MobileMenuPanel
          {...sidebarFixture(IZLOG_PROFILE, { kind: "trash" })}
          scopeChips={SCOPE_CHIPS}
          me={null}
          onClose={noop}
        />
      </div>
    </div>
  );
}

export default function LjuskaStartupEkran({ varijanta }: IzlogEkranProps) {
  if (varijanta === "mobilni-meni") return <MobileMenuFrame />;
  return <ShellFrame key={varijanta} profile={varijanta === "clan" ? IZLOG_MEMBER_PROFILE : IZLOG_PROFILE} />;
}
