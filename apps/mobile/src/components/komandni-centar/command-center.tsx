import { findStartupRow, locateStartupRow } from '@devotion/shared';
import { useQuery } from 'convex/react';
import { CalendarX2 } from 'lucide-react-native';
import { Component, useCallback, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { QuickAddFab } from '@/components/danas/quick-add-fab';
import { EmptyState } from '@/components/empty-state';
import { QuickAddSheet } from '@/components/me/quick-add-sheet';
import { useQuickAdd } from '@/components/me/use-quick-add';
import { listLayout } from '@/components/motion';
import { UndoBar } from '@/components/undo-bar';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { readLastArea, readStoredDestination } from '@/lib/quick-add-memory';
import { useThemeColors } from '@/theme/theme-provider';

import { CommandBlockBoundary } from './command-block-parts';
import { BLOCK_TEXT } from './command-blocks-model';
import { allSections, registerInto, type RegisterSections, type SectionsRegistry } from './command-sections';
import { ForYouBlock } from './for-you-block';
import { PulseBlock } from './pulse-block';
import { RecentChangesBlock } from './recent-changes-block';
import { COMMAND_CENTER_LIST } from './startup-task-model';
import { TeamBlock } from './team-block';
import { TriageBlock } from './triage-block';
import { useStartupTaskCommands } from './use-startup-task-commands';
import { WaitingBlock } from './waiting-block';

/**
 * Komandni centar 2.0 na telefonu (PROSTOR P8, P10, P22, P24 — K19, plan K07 §5.2):
 * početna taba Prostor. Iznad blokova stoje redovi Prostora (`header`), a ispod njih
 * redom: Za tebe · Trijaža · Čeka tebe · Nedavne izmene · Puls nedelje · Tim.
 *
 * Svaki blok ima SOPSTVENU granicu greške, učitavanje u obliku sadržaja i prazno
 * stanje, pa blok koji padne ne obara ostale ni redove Prostora („<Šta> nije
 * učitano. · Pokušaj ponovo" ponovo montira blok). Redovi zadataka (Za tebe, Trijaža)
 * dele `useStartupTaskCommands`: swipe desno = završi sa „Poništi", swipe levo = „Rok
 * i plan", dugi pritisak = radnje, dodir = panel zadatka — isto kao na ličnom nivou
 * i na webu. Isti zadatak može biti u obe liste, zato redovi „Za tebe" nose prefiks
 * ključa i svoju sekciju u registru (`command-sections.ts`); zadržavanje posle kvačice
 * radi za obe liste. Brzi unos je isti sheet kao u Moj dan, sa unapred izabranim startupom.
 *
 * Lista nije virtualizovana (po grupi ≤ 5 redova): `ScrollView` sa pull-to-refresh.
 *
 * Spoljna granica (`CommandCenterBoundary`) je samo poslednja mreža za stvari van
 * blokova (brzi unos, radnje reda): redovi Prostora ostaju na ekranu i rade dalje.
 */
export function CommandCenter({
  startupId,
  header,
}: {
  startupId: Id<'startups'>;
  /** Iznad blokova, u istom skrolu (redovi Prostora, plan K07 E4). */
  header?: ReactNode;
}) {
  return (
    <CommandCenterBoundary
      key={startupId}
      fallback={(error, retry) => (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {header}
          <View style={styles.fallbackError}>
            <CommandCenterErrorState
              message={accessErrorMessage(error, 'Došlo je do greške pri učitavanju zadataka.')}
              onRetry={retry}
            />
          </View>
        </ScrollView>
      )}>
      <CommandCenterBody startupId={startupId} header={header} />
    </CommandCenterBoundary>
  );
}

function CommandCenterBody({ startupId, header }: { startupId: Id<'startups'>; header?: ReactNode }) {
  const reduced = useReducedMotion();
  // Filter Trijaže iz bloka Tim: `null` = svi, `UNASSIGNED_KEY` = bez izvršioca.
  // Promena startupa montira ovu komponentu iznova (`key={startupId}`), pa filter kreće od nule.
  const [memberFilter, setMemberFilter] = useState<string | null>(null);

  const profile = useQuery(api.profiles.getCurrent, {});
  const myId = profile?._id ?? null;

  // Sekcije redova koje blokovi prijavljuju — rukovaoci posle dodira čitaju najnovije.
  const registry = useRef<SectionsRegistry>(new Map());
  const registerSections = useCallback<RegisterSections>(
    (blockId, sections) => registerInto(registry.current, blockId, sections),
    [],
  );
  const commands = useStartupTaskCommands({
    locate: (key) => locateStartupRow(COMMAND_CENTER_LIST, allSections(registry.current), key),
  });
  const { now } = commands;

  // --- Brzi unos: isti sheet i isti tok kao u Moj dan, startup je unapred izabran ---
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const quickAdd = useQuickAdd({
    dayKey: commands.dayKey,
    profileId: myId,
    planMutation: commands.mutations.planMutation,
  });

  const refreshControl = useListRefresh();
  // Blokovi se pomeraju kad se susedni menja visinu (red izlazi, Zastarelo se otvara).
  const blockLayout = listLayout(reduced);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}>
        {header}

        <Animated.View layout={blockLayout} style={styles.block}>
          <CommandBlockBoundary title={BLOCK_TEXT.forYouError}>
            <ForYouBlock startupId={startupId} commands={commands} registerSections={registerSections} />
          </CommandBlockBoundary>
        </Animated.View>

        <Animated.View layout={blockLayout} style={styles.block}>
          <CommandBlockBoundary title={BLOCK_TEXT.triageError}>
            <TriageBlock
              startupId={startupId}
              commands={commands}
              memberFilter={memberFilter}
              onClearFilter={() => setMemberFilter(null)}
              registerSections={registerSections}
            />
          </CommandBlockBoundary>
        </Animated.View>

        <Animated.View layout={blockLayout} style={styles.block}>
          <CommandBlockBoundary title={BLOCK_TEXT.waitingError}>
            <WaitingBlock startupId={startupId} />
          </CommandBlockBoundary>
        </Animated.View>

        <Animated.View layout={blockLayout} style={styles.block}>
          <CommandBlockBoundary title={BLOCK_TEXT.recentError}>
            <RecentChangesBlock startupId={startupId} />
          </CommandBlockBoundary>
        </Animated.View>

        <Animated.View layout={blockLayout} style={styles.block}>
          <CommandBlockBoundary title={BLOCK_TEXT.pulseError}>
            <PulseBlock startupId={startupId} />
          </CommandBlockBoundary>
        </Animated.View>

        <Animated.View layout={blockLayout} style={styles.block}>
          <CommandBlockBoundary title={BLOCK_TEXT.teamError}>
            <TeamBlock startupId={startupId} now={now} memberFilter={memberFilter} onSelectFilter={setMemberFilter} />
          </CommandBlockBoundary>
        </Animated.View>
      </ScrollView>

      {myId === null ? null : (
        <QuickAddFab
          onPress={() => {
            haptics.tap();
            setQuickAddOpen(true);
          }}
        />
      )}
      {/* „Završeno: …", „Sređeno: …" i „Uklonjeno iz Moj dan" vraćaju se odavde (par web toasta). */}
      <UndoBar bottomOffset={72} />

      {commands.renderSheets((key) => findStartupRow(allSections(registry.current), key))}

      <QuickAddSheet
        visible={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        now={now}
        startups={quickAdd.startups}
        preset={{ startupId }}
        readStored={readStoredDestination}
        rememberedArea={readLastArea}
        onSubmit={quickAdd.submit}
        onSubmitNote={quickAdd.submitNote}
      />
    </View>
  );
}

/**
 * Poslednja mreža: greška van blokova (brzi unos, radnje reda). `fallback` crta
 * redove Prostora oko greške, pa ostatak Prostora radi dalje.
 */
class CommandCenterBoundary extends Component<
  { children: ReactNode; fallback: (error: Error, retry: () => void) => ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error, () => this.setState({ error: null }));
    }
    return this.props.children;
  }
}

function CommandCenterErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  return (
    <EmptyState
      icon={<CalendarX2 size={40} color={colors.destructive} />}
      title="Zadaci se ne mogu učitati"
      description={message || 'Došlo je do greške pri učitavanju zadataka.'}
      actionLabel="Pokušaj ponovo"
      onAction={onRetry}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    // IZMERENO na emulatoru (E11): sa 96 poslednja kartica na kraju skrola
    // završava ~47dp ISPOD vrha FAB-a (efektivni razmak ~25dp, ne 96). 160 daje
    // ≥ 8dp zazora iznad FAB-a (56 + bottom 16). Ne smanjuj bez merenja.
    paddingBottom: 160,
  },
  fallbackError: {
    paddingVertical: 24,
  },
  // Razmak između sekcija je 24 (DIZAJN-SMIRENJE §3): redovi Prostora → blokovi → blokovi.
  block: {
    marginTop: 24,
  },
});
