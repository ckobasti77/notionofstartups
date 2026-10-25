/**
 * Moji zadaci na telefonu (K13) — od modela grupa (shared `my-tasks.ts`) do
 * ravne liste za `Animated.FlatList`. ČISTO (vitest). Par web `TaskGroupList`:
 * grupa prikazuje do 100 redova, ostalo kroz „Prikaži još N" (E12).
 */
import {
  pageOfGroup,
  PERSONAL_FILTER_KEY,
  TASKS_GROUP_PAGE,
  type MyTasksGroup,
  type MyTasksModel,
  type StartupMini,
  type TaskGroupBy,
  type TaskRowModel,
} from '@devotion/shared';

export type MyTasksListItem =
  | {
      type: 'header';
      key: string;
      title: string;
      count: number;
      tone: 'default' | 'danger';
      /** Čip startupa uz zaglavlje (grupisanje po startupu); `null` = „Lično"; `undefined` = bez čipa. */
      startup: StartupMini | null | undefined;
    }
  | { type: 'row'; key: string; row: TaskRowModel; groupKey: string }
  | { type: 'more'; key: string; groupKey: string; remaining: number };

/** Koliko redova grupe se vidi: podrazumevano prva strana, „Prikaži još" dodaje po stranu. */
export function shownOf(shown: Readonly<Record<string, number>>, groupKey: string): number {
  return shown[groupKey] ?? TASKS_GROUP_PAGE;
}

/** Sledeća vrednost „prikazano" posle „Prikaži još" za jednu grupu. */
export function showMore(shown: Readonly<Record<string, number>>, groupKey: string): Record<string, number> {
  return { ...shown, [groupKey]: shownOf(shown, groupKey) + TASKS_GROUP_PAGE };
}

/** Koliko redova dugme „Prikaži još" dodaje (poslednja strana je kraća). */
export function moreStep(remaining: number): number {
  return Math.min(remaining, TASKS_GROUP_PAGE);
}

/**
 * Grupe → stavke liste: zaglavlje, redovi (do granice grupe) i, ako ih ima
 * još, „Prikaži još N". Ključ reda je `refKey` reda, isti u svakoj grupi — red
 * koji promenom grupisanja pređe u drugu grupu lista POMERI, ne izbriše i
 * napravi (layout tranzicija).
 */
export function listItemsOf(
  model: MyTasksModel,
  groupBy: TaskGroupBy,
  shown: Readonly<Record<string, number>>,
  startups: ReadonlyArray<StartupMini>,
): MyTasksListItem[] {
  const byId = new Map(startups.map((startup) => [startup._id, startup] as const));
  const items: MyTasksListItem[] = [];
  for (const group of model.groups) {
    items.push(headerOf(group, groupBy, byId));
    const { visible, remaining } = pageOfGroup(group.rows, shownOf(shown, group.key));
    for (const row of visible) items.push({ type: 'row', key: `r:${row.key}`, row, groupKey: group.key });
    if (remaining > 0) items.push({ type: 'more', key: `m:${group.key}`, groupKey: group.key, remaining });
  }
  return items;
}

function headerOf(
  group: MyTasksGroup,
  groupBy: TaskGroupBy,
  startups: ReadonlyMap<string, StartupMini>,
): Extract<MyTasksListItem, { type: 'header' }> {
  let startup: StartupMini | null | undefined;
  if (groupBy === 'startup') {
    // Nepoznat startup (lista se još učitava / iza prvih 50) nema čip — kao web, ne „Lično".
    startup = group.key === PERSONAL_FILTER_KEY ? null : startups.get(group.key);
  }
  return {
    type: 'header',
    key: `h:${group.key}`,
    title: group.title,
    count: group.rows.length,
    tone: groupBy === 'due' && group.key === 'overdue' ? 'danger' : 'default',
    startup,
  };
}

/** „Prikazano je prvih 200. Suzi filter za ostatak." — napomena o odsečenju (plan K07 §3). */
export function cappedNote(loadedCount: number): string {
  return `Prikazano je prvih ${loadedCount}. Suzi filter za ostatak.`;
}
