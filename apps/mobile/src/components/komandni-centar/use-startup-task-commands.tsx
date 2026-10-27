import {
  completionCall,
  plannedKeysOf,
  type StartupTaskStatus,
  type TaskRowModel,
} from '@devotion/shared';
import { useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Alert } from 'react-native';

import { RokPlanSheet } from '@/components/me/rok-plan-sheet';
import { RowActionsSheet, type RowActionsTarget } from '@/components/me/row-actions-sheet';
import { useCompletionQueue } from '@/components/me/my-day/use-completion-queue';
import { TaskPanelSheet, type TaskPanelRequest } from '@/components/me/task-panel-sheet';
import { failed, useRowMutations } from '@/components/me/use-row-mutations';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useQueryTolerant } from '@/hooks/use-query-tolerant';
import { useToday } from '@/hooks/use-today';
import { haptics } from '@/lib/haptics';
import { openStartupEntity } from '@/lib/navigation/open-startup-entity';
import { DURATIONS } from '@/theme/motion';

export type StartupRowActions = {
  onToggleDone: (row: TaskRowModel, done: boolean) => void;
  onOpen: (row: TaskRowModel) => void;
  onLongPress: (row: TaskRowModel) => void;
  onSchedule: (row: TaskRowModel) => void;
  onDenied: (row: TaskRowModel, reason: string) => void;
};

export type StartupTaskCommands = {
  now: number;
  dayKey: string;
  /** Plan za danas (refKey → id stavke) iz deljene pretplate `myDay.overview`. */
  plannedKeys: ReadonlyMap<string, string>;
  holds: ReturnType<typeof useCompletionQueue>['holds'];
  pending: ReturnType<typeof useCompletionQueue>['pending'];
  rowActions: StartupRowActions;
  /** Mutacije reda (brzi unos koristi `planMutation` odavde). */
  mutations: ReturnType<typeof useRowMutations>;
  /**
   * Sheet-ovi „Rok i plan", radnje i panel zadatka — ekran ih renderuje jednom,
   * sa čitanjem NAJSVEŽIJEG reda iz modela koji je tek izračunao (sheet ne sme
   * da kasni za podacima).
   */
  renderSheets: (getRow: (key: string) => TaskRowModel | undefined) => ReactNode;
};

/**
 * Radnje u listama zadataka u startupu (K18, par web `useStartupTaskCommands`
 * iz K17): završi sa zadržavanjem reda i „Poništi" (E7), rok, prioritet, status,
 * „Dodaj u Moj dan" i „Priključi se" iz sheet-a radnji, panel zadatka sa
 * „Puni prikaz". Komandni centar i „Svi zadaci" dele ovaj hook, pa se ponašaju
 * isto. Mutacije su iste kao na ličnom nivou i na webu (`tasks.updateMetadata`,
 * `myDay.plan/unplan`, `taskAssignees.join`) — pravila servera se ne menjaju.
 *
 * `locate` čita NAJNOVIJI model sekcija (ref ekrana), pa zadržavanje pamti pravo
 * mesto reda; model sekcija zavisi od `holds` odavde, zato je ref potreban.
 */
export function useStartupTaskCommands({
  locate,
}: {
  locate: (key: string) => { section: string; index: number } | null;
}): StartupTaskCommands {
  const router = useRouter();
  const { activeStartupId, setActiveStartupId } = useActiveStartup();
  const today = useToday();
  const { dayKey, doneSince, now } = today;

  const overview = useQueryTolerant(api.myDay.overview, { dayKey, doneSince });
  const entries = overview?.entries;
  const plannedKeys = useMemo(() => plannedKeysOf(entries ?? []), [entries]);

  const mutations = useRowMutations({ dayKey, now });
  const { send, togglePlan, setDue, setPriority } = mutations;
  const join = useMutation(api.taskAssignees.join);

  const completion = useCompletionQueue({
    locate,
    commit: (row, done, previous) => {
      const call = completionCall(row, done, previous);
      return call.fn === 'denied' ? Promise.reject(new Error(call.reason)) : send(call);
    },
  });

  // Sheet-ovi: ključ reda, a red se čita svež iz modela.
  const [rokKey, setRokKey] = useState<string | null>(null);
  const [actionsKey, setActionsKey] = useState<string | null>(null);
  const [panel, setPanel] = useState<TaskPanelRequest | null>(null);
  // Odloženo otvaranje panela se otkazuje pri unmount-u i pri novom dodiru.
  const panelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (panelTimer.current !== null) clearTimeout(panelTimer.current);
    },
    [],
  );
  const openPanel = (row: TaskRowModel) => {
    setPanel({ target: { kind: 'task', pageId: row.id as Id<'pages'> }, title: row.title });
  };
  // „Puni prikaz": puna stranica zadatka (isti startup, pa bez promene aktivnog).
  const openFull = (startupId: Id<'startups'>, pageId: Id<'pages'>) =>
    openStartupEntity(router, setActiveStartupId, {
      startupId,
      href: { pathname: '/zadatak/[id]', params: { id: pageId } },
      currentStartupId: activeStartupId,
    });

  const setStatus = (row: TaskRowModel, status: StartupTaskStatus) => {
    if (row.status === status) return;
    // Završavanje ide kroz isti tok kao kvačica (zadržavanje + „Poništi");
    // vraćanje završenog ide na IZABRANI status (ne na zapamćeni prethodni).
    if (!row.permissions.status.allowed) {
      haptics.warning();
      Alert.alert('Status nije promenjen', row.permissions.status.reason ?? 'Status menja kreator ili izvršilac.');
      return;
    }
    if (status === 'done') {
      completion.toggleDone(row, true);
      return;
    }
    void send({ fn: 'tasks.updateMetadata', pageId: row.id, status })
      .then(() => AccessibilityInfo.announceForAccessibility('Status je promenjen.'))
      .catch((error: unknown) => failed('Status nije sačuvan', error, 'Pokušaj ponovo.'));
  };

  const joinTask = (row: TaskRowModel) => {
    void join({ taskPageId: row.id as Id<'pages'> })
      .then(() => {
        haptics.success();
        AccessibilityInfo.announceForAccessibility('Sad si na zadatku.');
      })
      .catch((error: unknown) => failed('Priključivanje nije uspelo', error, 'Pokušaj ponovo.'));
  };

  const renderSheets = (getRow: (key: string) => TaskRowModel | undefined) => {
    const rokRow = rokKey === null ? null : (getRow(rokKey) ?? null);
    const actionsRow = actionsKey === null ? null : getRow(actionsKey);
    const actionsTarget: RowActionsTarget | null = actionsRow ? { row: actionsRow, movable: null } : null;
    return (
      <>
        <RokPlanSheet
          row={rokRow}
          now={now}
          onClose={() => setRokKey(null)}
          onSetDue={(row, due) => {
            setRokKey(null);
            setDue(row, due);
          }}
          onTogglePlan={(row) => {
            haptics.select();
            setRokKey(null);
            togglePlan(row);
          }}
        />
        <RowActionsSheet
          target={actionsTarget}
          now={now}
          onClose={() => setActionsKey(null)}
          onOpen={(row) => {
            setActionsKey(null);
            // Dva sestrinska `Modal`-a istovremeno iOS ne prikazuje: panel čeka kraj izlaza sheet-a radnji.
            if (panelTimer.current !== null) clearTimeout(panelTimer.current);
            panelTimer.current = setTimeout(() => openPanel(row), DURATIONS.quick + 60);
          }}
          onToggleDone={(row, done) => {
            setActionsKey(null);
            if (done) haptics.success();
            else haptics.select();
            completion.toggleDone(row, done);
          }}
          onTogglePlan={(row) => {
            haptics.select();
            setActionsKey(null);
            togglePlan(row);
          }}
          onSetDue={(row, due) => {
            setActionsKey(null);
            setDue(row, due);
          }}
          onSetPriority={(row, priority) => {
            setActionsKey(null);
            setPriority(row, priority);
          }}
          onSetStatus={(row, status) => {
            setActionsKey(null);
            setStatus(row, status);
          }}
          onJoin={(row) => {
            setActionsKey(null);
            joinTask(row);
          }}
        />
        <TaskPanelSheet request={panel} onClose={() => setPanel(null)} onOpenInStartup={openFull} openLabel="Puni prikaz" />
      </>
    );
  };

  return {
    now,
    dayKey,
    plannedKeys,
    holds: completion.holds,
    pending: completion.pending,
    mutations,
    renderSheets,
    rowActions: {
      onToggleDone: completion.toggleDone,
      onOpen: openPanel,
      onLongPress: (row) => setActionsKey(row.key),
      onSchedule: (row) => setRokKey(row.key),
      // Zaključana kvačica: razlog vidljivo, kao toast na webu (E15).
      onDenied: (row, reason) => Alert.alert(row.done ? 'Zadatak nije vraćen' : 'Zadatak nije završen', reason),
    },
  };
}
