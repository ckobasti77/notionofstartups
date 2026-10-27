"use client";

import type { ReactNode } from "react";
import { visibleSettingsTabs, type SettingsTabKey } from "@devotion/shared";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScreenHeader } from "@/components/workspace/workspace-ui";

/** Stanje liste u kartici: učitavanje, greška ili podaci. */
export type SettingsListState<T> =
  | { status: "loading" }
  | { status: "error"; onRetry: () => void }
  | { status: "ready"; items: ReadonlyArray<T> };

/** Okvir ekrana: naslov i podvučene kartice; sadržaj kartice je `children`. */
export function SettingsView({
  tab,
  onTabChange,
  isAdmin,
  children,
}: {
  tab: SettingsTabKey;
  onTabChange: (tab: SettingsTabKey) => void;
  isAdmin: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-6">
      <ScreenHeader title="Podešavanja startupa" />
      <Tabs value={tab} onValueChange={(value) => onTabChange(value as SettingsTabKey)} data-workspace-enter>
        <TabsList variant="line" aria-label="Podešavanja" className="w-full justify-start">
          {visibleSettingsTabs(isAdmin).map((item) => (
            <TabsTrigger key={item.key} value={item.key}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab} className="mt-5">
          {children}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function SettingsListSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-1">
      {[0, 1, 2, 3, 4].map((item) => (
        <Skeleton key={item} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function SettingsListError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2 text-sm">
      <span className="text-muted-foreground">{what} nije učitano.</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Pokušaj ponovo
      </Button>
    </div>
  );
}
