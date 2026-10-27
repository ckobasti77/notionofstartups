import { arrangeNotes, filterNotes, notesCountLabel, notesEmptyText, type NoteFilter } from '@devotion/shared';
import { NotebookPen, Search } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { KATALOG_QUICK_ADD_STARTUPS, KATALOG_STARTUPS } from '@/components/me/__fixtures__';
import { QuickAddSheet } from '@/components/me/quick-add-sheet';
import {
  noteRowModel,
  quickNoteTarget,
  type NoteListItem,
  type NoteStartup,
} from '@/components/misli/misli-model';
import { NoteQuickInput } from '@/components/misli/note-quick-input';
import { NoteRow } from '@/components/misli/note-row';
import { NoteScopeChips } from '@/components/misli/note-scope-chips';
import { SendToStartupSheet } from '@/components/misli/send-to-startup-sheet';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { useThemeColors } from '@/theme/theme-provider';
import { text } from '@/theme/tokens';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const STARTUPS: NoteStartup[] = KATALOG_STARTUPS.slice(0, 3).map((startup) => ({
  _id: startup._id,
  name: startup.name,
  logoUrl: startup.logoUrl,
}));
const [CR, SH] = STARTUPS as [NoteStartup, NoteStartup, NoteStartup];

function notes(now: number): NoteListItem[] {
  const base = { parentThoughtId: null, startup: null, startupId: null };
  return [
    {
      ...base,
      _id: 'n1',
      title: 'Ideja za onboarding',
      text: 'Kratak video posle prijave\nPitanje o iskustvu',
      startupId: CR._id,
      startup: CR,
      updatedAt: now - 2 * HOUR,
    },
    {
      ...base,
      _id: 'n1a',
      title: null,
      text: 'Podbeleška: tekst prvog koraka koji je malo duži od jednog reda da se vidi skraćivanje',
      parentThoughtId: 'n1',
      startupId: CR._id,
      startup: CR,
      updatedAt: now - DAY,
    },
    {
      ...base,
      _id: 'n1b',
      title: 'Drugi nivo',
      text: 'Uvučeno još jedan korak',
      parentThoughtId: 'n1a',
      startupId: CR._id,
      startup: CR,
      updatedAt: now - 2 * DAY,
    },
    {
      ...base,
      _id: 'n2',
      title: 'Oprema za snimanje',
      text: 'Mikrofon, stativ, svetlo',
      updatedAt: now - 3 * DAY,
    },
    {
      ...base,
      _id: 'n3',
      title: 'Cenovnik za jesen',
      text: '',
      startupId: SH._id,
      startup: SH,
      updatedAt: now - 9 * DAY,
    },
    {
      ...base,
      _id: 'n4',
      title: null,
      text: 'Pozvati knjigovođu\nPitati za rok prijave',
      updatedAt: now - 20 * DAY,
    },
  ];
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * PROSTOR K18: Beleške na telefonu — mešana lista (lične + startup, uvučene
 * podbeleške), čipovi filtera, prazna stanja, polje „Brza beleška…", brzi unos u
 * režimu Beleška i sheet „Pošalji u startup". Fixture bez upita; radnje se samo
 * beleže (reč „greska" u polju pokazuje poruku o grešci).
 */
export function ProstorK18Katalog() {
  const colors = useThemeColors();
  const [now] = useState(() => Date.now());
  const [all] = useState(() => notes(Date.now()));
  const [filter, setFilter] = useState<NoteFilter>({ kind: 'all' });
  const [log, setLog] = useState('Dodirni red, čip ili dugme.');
  const [quickOpen, setQuickOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTarget, setSendTarget] = useState<string | null>(CR._id);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendNone, setSendNone] = useState(false);

  const rows = arrangeNotes(filterNotes(all, filter)).map((row) => ({
    row,
    model: noteRowModel(row, now),
  }));
  const target = quickNoteTarget(filter, STARTUPS);
  const failOnWord = async (value: string) => {
    await sleep(350);
    if (value.trim().toLowerCase() === 'greska') throw new Error('Beleška nije sačuvana. Pokušaj ponovo.');
  };

  return (
    <View style={styles.root}>
      <SectionHeader title="Beleške — lista i čipovi (K18)" count={rows.length} />
      <Text style={[styles.caption, { color: colors.mutedForeground }]}>
        Lične i iz startupa na jednom mestu; podbeleške su uvučene 16 px po nivou (najviše 3). Dodir otvara, dugi
        pritisak radnje.
      </Text>
      <NoteScopeChips value={filter} startups={STARTUPS} bleed={0} onChange={setFilter} />
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>{notesCountLabel(rows.length)}</Text>
      {rows.map(({ row, model }) => (
        <NoteRow
          key={row.note._id}
          model={model}
          onOpen={() => setLog(`Otvori: ${model.title}`)}
          onLongPress={() => setLog(`Radnje: ${model.title}`)}
        />
      ))}

      <SectionHeader title="Brza beleška (K18)" />
      <NoteQuickInput
        target={target === null ? null : { name: target.name, logoUrl: target.logoUrl }}
        onSave={async (value) => {
          await failOnWord(value);
          setLog(`Sačuvano u ${target?.name ?? 'Lično'}: ${value.trim().slice(0, 40)}`);
        }}
      />

      <SectionHeader title="Prazna stanja (K18)" />
      <View style={styles.empty}>
        <EmptyState
          icon={<NotebookPen size={20} color={colors.mutedForeground} />}
          title={notesEmptyText({ kind: 'all' }, { searching: false }).title}
          description={notesEmptyText({ kind: 'all' }, { searching: false }).description ?? undefined}
          actionLabel="Nova beleška"
          onAction={() => setLog('Nova beleška')}
        />
      </View>
      <View style={styles.empty}>
        <EmptyState
          icon={<Search size={20} color={colors.mutedForeground} />}
          title={notesEmptyText({ kind: 'all' }, { searching: true }).title}
          actionLabel="Obriši pretragu"
          onAction={() => setLog('Obriši pretragu')}
        />
      </View>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
        {notesEmptyText({ kind: 'personal' }, { searching: false }).title}
        {'  ·  '}
        {notesEmptyText({ kind: 'startup', startupId: CR._id }, { searching: false, startupName: CR.name }).title}
      </Text>

      <SectionHeader title="Brzi unos i „Pošalji u startup” (K18)" />
      <Button label="Brzi unos — režim Beleška" variant="secondary" onPress={() => setQuickOpen(true)} />
      <Button
        label="Pošalji u startup"
        variant="secondary"
        onPress={() => {
          setSendNone(false);
          setSendTarget(CR._id);
          setSendOpen(true);
        }}
      />
      <Button
        label="Pošalji u startup — bez startupa"
        variant="ghost"
        onPress={() => {
          setSendNone(true);
          setSendTarget(null);
          setSendOpen(true);
        }}
      />
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>{log}</Text>

      <QuickAddSheet
        visible={quickOpen}
        initialKind="note"
        onClose={() => setQuickOpen(false)}
        now={now}
        startups={KATALOG_QUICK_ADD_STARTUPS}
        onSubmit={async (draft) => setLog(`Zadatak: ${draft.title.trim()}`)}
        onSubmitNote={async (draft) => {
          await failOnWord(draft.text);
          setLog(`Beleška: ${draft.text.trim().slice(0, 40)}`);
        }}
      />
      <SendToStartupSheet
        visible={sendOpen}
        titles={['Ideja za onboarding']}
        targets={sendNone ? [] : STARTUPS}
        selectedId={sendTarget}
        busy={sendBusy}
        onSelect={setSendTarget}
        onSubmit={async () => {
          setSendBusy(true);
          await sleep(500);
          setSendBusy(false);
          setSendOpen(false);
          setLog(`Poslato u: ${STARTUPS.find((item) => item._id === sendTarget)?.name ?? '—'}`);
        }}
        onClose={() => setSendOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
    paddingTop: 24,
  },
  caption: {
    ...text.body,
  },
  meta: {
    ...text.meta,
  },
  empty: {
    height: 220,
  },
});
