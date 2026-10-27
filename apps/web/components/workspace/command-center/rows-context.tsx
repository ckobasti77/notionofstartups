"use client";

import { createContext, useContext, useLayoutEffect, type ReactNode } from "react";
import { canJoinTask, type StartupMini, type StartupTaskSection, type TaskRowModel } from "@devotion/shared";

import { TaskRow, type TaskRowActions } from "@/components/me/task-row";
import { AssigneeStack } from "@/components/workspace/assignee-stack";
import type { StartupTaskCommands } from "@/components/workspace/startup-tasks/use-startup-task-commands";
import type { CommandCenterAssignee } from "@/components/workspace/startup-tasks/command-center-model";
import type { RowRequest } from "@/lib/shortcuts/task-list";

/**
 * Zajednički red zadatka za blokove Komandnog centra (Za tebe, Trijaža): jedan
 * `useStartupTaskCommands` na ceo ekran, a blokovi samo prijave svoje redove
 * (`register`) da zadržavanje posle kvačice i prečice znaju gde je koji red.
 */
export type CommandRowsValue = {
  now: number;
  profileId: string;
  /** Vlasnik startupa ili admin (P1): zaključane zadatke menja i bez autorstva. */
  isManager: boolean;
  startup: StartupMini;
  areaLabels: ReadonlyMap<string, string>;
  commands: Pick<
    StartupTaskCommands,
    "actions" | "plannedKeys" | "holds" | "pending" | "selectedKey" | "activeKey" | "request"
  >;
  /** Blok prijavljuje (ili skida, praznim nizom) sekcije koje trenutno crta. */
  register: (blockId: string, sections: StartupTaskSection[]) => void;
};

const CommandRowsContext = createContext<CommandRowsValue | null>(null);

export function CommandRowsProvider({ value, children }: { value: CommandRowsValue; children: ReactNode }) {
  return <CommandRowsContext.Provider value={value}>{children}</CommandRowsContext.Provider>;
}

export function useCommandRows(): CommandRowsValue {
  const value = useContext(CommandRowsContext);
  if (value === null) throw new Error("Blok Komandnog centra mora biti unutar CommandRowsProvider-a.");
  return value;
}

/** Prijavi sekcije bloka dok je montiran; skida ih pri izlasku. */
export function useRegisterSections(blockId: string, sections: StartupTaskSection[]) {
  const { register } = useCommandRows();
  useLayoutEffect(() => {
    register(blockId, sections);
    return () => register(blockId, []);
  }, [blockId, sections, register]);
}

/** Red zadatka u bloku: zajednički `TaskRow` sa radnjama, „Priključi se" i izvršiocima. */
export function CommandTaskRow({
  row,
  now,
  assignees,
  actions,
  selected,
  active,
  request,
}: {
  row: TaskRowModel;
  now: number;
  /** `undefined` = izvršioci nisu poznati (npr. „Za tebe" ih ne učitava). */
  assignees?: ReadonlyArray<CommandCenterAssignee>;
  actions: TaskRowActions;
  selected: boolean;
  active: boolean;
  request: RowRequest | null;
}) {
  return (
    <TaskRow
      row={row}
      now={now}
      actions={actions}
      canOpen
      showStartup={false}
      canJoin={canJoinTask(row)}
      extraMeta={assignees === undefined ? undefined : <AssigneeStack assignees={[...assignees]} max={3} />}
      selected={selected}
      active={active}
      request={request}
    />
  );
}
