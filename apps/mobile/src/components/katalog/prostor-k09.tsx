import type { TrashKind } from '@devotion/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TrashList, TrashListError, type TrashListState } from '@/components/korpa/trash-list';
import type { TrashCounts, TrashItem } from '@/components/korpa/trash-model';
import { TrashSegments } from '@/components/korpa/trash-segments';
import { ProstorHubRows, ProstorTempRows } from '@/components/prostor/prostor-hub';
import { Button } from '@/components/ui/button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionHeader } from '@/components/ui/section-header';
import { showUndoNotice } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, text, type ColorTokens } from '@/theme/tokens';

const DAY = 86_400_000;
const ana = { _id: 'p1' as never, displayName: 'Ana Ilić', avatarUrl: null };
const marko = { _id: 'p2' as never, displayName: 'Marko Jović', avatarUrl: null };

/** Fixture Korpe po segmentu — ništa ne ide na server. */
function katalogTrash(now: number): Record<TrashKind, TrashItem[]> {
  return {
    page: [
      {
        kind: 'page',
        pageId: 'pg1' as never,
        title: 'Specifikacija API',
        pageKind: 'note',
        areaId: 'a1' as never,
        areaLabel: 'Razvoj',
        parentPageId: 'pg0' as never,
        parentTitle: 'Lansiranje',
        parentAvailable: true,
        descendantCount: 3,
        archivedAt: now - 2 * DAY,
        archivedBy: ana,
        canRestore: true,
      },
      {
        kind: 'page',
        pageId: 'pg2' as never,
        title: 'Pripremi API ključeve za partnere',
        pageKind: 'task',
        areaId: 'a2' as never,
        areaLabel: 'Marketing',
        parentPageId: 'pg9' as never,
        parentTitle: 'Kampanja',
        parentAvailable: false,
        descendantCount: 0,
        archivedAt: now - 5 * DAY,
        archivedBy: marko,
        canRestore: true,
      },
      {
        kind: 'page',
        pageId: 'pg3' as never,
        title: 'Cenovnik (zaključan)',
        pageKind: 'table',
        areaId: 'a3' as never,
        areaLabel: 'Prodaja',
        parentPageId: null,
        parentTitle: null,
        parentAvailable: false,
        descendantCount: 0,
        archivedAt: now - 40 * 60_000,
        archivedBy: null,
        canRestore: false,
      },
    ],
    idea: [
      {
        kind: 'idea',
        ideaId: 'i1' as never,
        title: 'Referral program za pekare',
        archivedAt: now - DAY,
        archivedBy: ana,
        canRestore: true,
      },
    ],
    file: [
      {
        kind: 'file',
        fileId: 'f1' as never,
        name: 'ugovor-kifla.pdf',
        category: 'pdf',
        size: 2_516_582,
        pageId: 'pg4' as never,
        pageTitle: 'Pravno',
        pageAvailable: true,
        archivedAt: now - 3 * DAY,
        archivedBy: marko,
        canRestore: true,
      },
      {
        kind: 'file',
        fileId: 'f2' as never,
        name: 'meni-jesen.png',
        category: 'image',
        size: 412_000,
        pageId: 'pg1' as never,
        pageTitle: 'Specifikacija API',
        pageAvailable: false,
        archivedAt: now - 2 * DAY,
        archivedBy: ana,
        canRestore: true,
      },
    ],
    recovered: [
      {
        kind: 'recovered',
        recoveredId: 'r1' as never,
        title: 'Stari plan objava',
        sourceKind: 'page',
        createdAt: now - 6 * DAY,
        owner: ana,
        contributions: [
          { _id: 'c1' as never, excerpt: 'Reel za novi meni ide u utorak.', author: marko, createdAt: now - 7 * DAY },
          { _id: 'c2' as never, excerpt: 'Dodati saradnju sa influenserima.', author: null, createdAt: now - 8 * DAY },
          { _id: 'c3' as never, excerpt: 'Proveriti budžet za oktobar.', author: ana, createdAt: now - 9 * DAY },
          { _id: 'c4' as never, excerpt: 'Snimiti priču o pekari.', author: marko, createdAt: now - 9 * DAY },
        ],
        canDismiss: true,
      },
    ],
  };
}

const KATALOG_COUNTS: TrashCounts = {
  page: { count: 3, capped: false },
  idea: { count: 1, capped: false },
  file: { count: 2, capped: false },
  recovered: { count: 99, capped: true },
};

type TrashMode = 'ready' | 'loading' | 'empty' | 'error';

function Caption({ label, colors }: { label: string; colors: ColorTokens }) {
  return <Text style={[styles.caption, { color: colors.subtle }]}>{label}</Text>;
}

/**
 * Dizajn katalog — PROSTOR K09: redovi početne startupa, smireno zaglavlje
 * (naslov + meta ispod), Korpa (segmenti, redovi, stanja) i traka bez
 * „Poništi". Radnje se samo beleže; traka se pojavljuje na dnu ekrana.
 */
export function ProstorK09Katalog() {
  const colors = useThemeColors();
  const [now] = useState(() => Date.now());
  const [trash] = useState(() => katalogTrash(Date.now()));
  const [log, setLog] = useState('Dodirni red ili dugme.');
  const [kind, setKind] = useState<TrashKind>('page');
  const [mode, setMode] = useState<TrashMode>('ready');

  const state: TrashListState =
    mode === 'loading'
      ? { status: 'loading' }
      : { status: 'ready', items: mode === 'empty' ? [] : trash[kind], canLoadMore: false, loadingMore: false };

  return (
    <View style={styles.root}>
      <SectionHeader title="Prostor — redovi (K09)" />
      <Caption label="Početna startupa: redovi na vrhu, Puls i Aktivnost privremeno na dnu." colors={colors} />
      <ProstorHubRows areaCount={4} channelsUnread={3} onOpen={(id) => setLog(`Otvori: ${id}`)} />
      <ProstorTempRows onOpen={(id) => setLog(`Otvori: ${id}`)} />
      <Text style={[styles.log, { color: colors.mutedForeground }]}>{log}</Text>

      <SectionHeader title="Zaglavlje — naslov i meta (K09)" />
      <Caption label="Koren taba: naslov je startup (birač). Gurnut ekran: naslov 20, meta ispod." colors={colors} />
      <View style={[styles.frame, { borderColor: colors.border }]}>
        <ScreenHeader
          title="Cluck Rush"
          titleSize="display"
          onTitlePress={() => setLog('Birač startupa')}
          style={styles.headerDemo}
        />
      </View>
      <View style={[styles.frame, { borderColor: colors.border }]}>
        <ScreenHeader
          title="Specifikacija API"
          subtitle="Razvoj › Lansiranje"
          onSubtitlePress={() => setLog('Putanja')}
          onBack={() => setLog('Nazad')}
          style={styles.headerDemo}
        />
      </View>

      <SectionHeader title="Korpa (K09)" />
      <Caption label="Segmenti se prelamaju; „99+” kad je broj ograničen. Stanje:" colors={colors} />
      <View style={styles.modeRow}>
        {(['ready', 'loading', 'empty', 'error'] as const).map((value) => (
          <Button
            key={value}
            label={{ ready: 'Podaci', loading: 'Učitavanje', empty: 'Prazno', error: 'Greška' }[value]}
            size="sm"
            variant={mode === value ? 'default' : 'secondary'}
            onPress={() => setMode(value)}
          />
        ))}
      </View>
      <TrashSegments value={kind} counts={KATALOG_COUNTS} onChange={setKind} />
      <View style={[styles.listFrame, { borderColor: colors.border }]}>
        {mode === 'error' ? (
          <TrashListError message="Proveri vezu i pokušaj ponovo." onRetry={() => setMode('ready')} />
        ) : (
          <TrashList
            kind={kind}
            state={state}
            now={now}
            busyKey={null}
            onRestore={(item) =>
              showUndoNotice({
                label: `Vraćeno: „${item.kind === 'file' ? item.name : item.title}”.`,
                secondary: { label: 'Otvori', onPress: () => setLog('Otvori vraćeno') },
              })
            }
            onDismiss={() => showUndoNotice({ label: 'Uklonjeno iz Oporavljenog.' })}
            onLoadMore={() => setLog('Učitaj još')}
            bottomInset={16}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
  },
  caption: {
    ...text.meta,
  },
  log: {
    ...text.meta,
  },
  frame: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  // Zaglavlje u okviru: bez gornjeg safe-area (to je ekran, ne katalog).
  headerDemo: {
    paddingTop: 8,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  listFrame: {
    height: 520,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
