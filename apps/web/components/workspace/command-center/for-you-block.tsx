"use client";

import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import {
  applyStartupHolds,
  COMMAND_BLOCK_TEXT,
  forYouTasks,
  rowFromTaskItem,
  type StartupTaskSection,
  type TaskRowModel,
} from "@devotion/shared";

import type { TaskRowActions } from "@/components/me/task-row";
import { Button } from "@/components/ui/button";
import { COMMAND_CENTER_LIST } from "@/components/workspace/startup-tasks/command-center-model";
import { EmptyState } from "@/components/workspace/workspace-ui";
import { useQueryResult } from "@/components/workspace/workspace-error-boundary";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RowRequest } from "@/lib/shortcuts/task-list";

import { Block, type BlockStatus, useBlockRetry } from "./block";
import { CommandTaskRow, useCommandRows, useRegisterSections } from "./rows-context";

/** Najviše redova u „Za tebe" (K07 §5.2). */
export const FOR_YOU_LIMIT = 6;
/** Red „Za tebe" je i u Trijaži: zaseban ključ drži DOM, Flip i zadržavanje jednoznačnim. */
export const FOR_YOU_SECTION = "za-tebe";
const KEY_PREFIX = `${FOR_YOU_SECTION}:`;

export type ForYouViewProps = {
  status: BlockStatus;
  onRetry: () => void;
  rows: TaskRowModel[];
  /** Svi moji otvoreni zadaci koji ispunjavaju uslov (red „Svi moji zadaci"). */
  total: number;
  now: number;
  actions: TaskRowActions;
  selectedKey: string | null;
  activeKey: string | null;
  request: RowRequest | null;
  onOpenAll: () => void;
};

/**
 * „Za tebe" — prezentacija (izlog `komandni-centar`): moji otvoreni zadaci u
 * ovom startupu, prekoračeno → danas → u toku. Podaci kroz props, bez `useQuery`.
 */
export function ForYouView({
  status,
  onRetry,
  rows,
  total,
  now,
  actions,
  selectedKey,
  activeKey,
  request,
  onOpenAll,
}: ForYouViewProps) {
  return (
    <Block
      id="cc-za-tebe"
      title="Za tebe"
      count={total}
      status={status}
      errorText={COMMAND_BLOCK_TEXT.forYouError}
      onRetry={onRetry}
    >
      {rows.length === 0 ? (
        <EmptyState size="section" title="Nemaš otvorenih zadataka ovde." />
      ) : (
        <>
          <ul data-section={FOR_YOU_SECTION} className="space-y-0.5">
            {rows.map((row) => (
              <li key={row.key} data-flip-id={row.key}>
                <CommandTaskRow
                  row={row}
                  now={now}
                  actions={actions}
                  selected={selectedKey === row.key}
                  active={activeKey === row.key || `${KEY_PREFIX}${activeKey}` === row.key}
                  request={request?.key === row.key ? request : null}
                />
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" className="mt-1" onClick={onOpenAll}>
            Svi moji zadaci{total > rows.length ? ` (${total})` : ""}
            <ChevronRight aria-hidden="true" />
          </Button>
        </>
      )}
    </Block>
  );
}

/** Kontejner „Za tebe": `tasks.listEverywhere` (jedan upit) → `forYouTasks` → redovi sa radnjama. */
export function ForYouBlock({ startupId, onOpenAll }: { startupId: Id<"startups">; onOpenAll: () => void }) {
  const retry = useBlockRetry();
  const { now, commands } = useCommandRows();
  const result = useQueryResult(api.tasks.listEverywhere, { scope: "open", startupId });

  const picked = useMemo(
    () => (result.data === undefined ? null : forYouTasks(result.data.items, now, FOR_YOU_LIMIT)),
    [result.data, now],
  );
  const sections = useMemo<StartupTaskSection[]>(() => {
    if (picked === null) return [];
    const built = picked.items.map((item) => {
      const row = rowFromTaskItem(item, commands.plannedKeys);
      return { ...row, key: `${KEY_PREFIX}${row.key}` };
    });
    return applyStartupHolds(
      COMMAND_CENTER_LIST,
      [{ id: FOR_YOU_SECTION, rows: built }],
      commands.holds,
      commands.pending,
    );
  }, [picked, commands.plannedKeys, commands.holds, commands.pending]);
  useRegisterSections(FOR_YOU_SECTION, sections);

  return (
    <ForYouView
      status={result.failed ? "error" : picked === null ? "loading" : "ready"}
      onRetry={retry}
      rows={sections[0]?.rows ?? []}
      total={picked?.total ?? 0}
      now={now}
      actions={commands.actions}
      selectedKey={commands.selectedKey}
      activeKey={commands.activeKey}
      request={commands.request}
      onOpenAll={onOpenAll}
    />
  );
}
