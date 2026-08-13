import { useMutation, useQuery } from 'convex/react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  ListTodo,
  Paperclip,
  Table,
  Users,
} from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { DatePickerSheet, formatDueDate } from '@/components/ui/date-picker-sheet';
import { OptionChip } from '@/components/ui/option-chip';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import {
  AssigneePickerSheet,
  assigneeCountLabel,
} from '@/components/zadatak/assignee-picker';
import {
  CheckpointDraftList,
  type CheckpointDraft,
} from '@/components/zadatak/checkpoint-draft-list';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { noteTextToHtml } from '@/lib/note-content';
import {
  dueDateInDays,
  priorityColor,
  statusColor,
  TASK_PRIORITY_META,
  TASK_PRIORITY_ORDER,
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, radius, type ColorTokens } from '@/theme/tokens';

const MAX_TITLE = 200;
const MAX_INSTRUCTIONS = 20_000;
/**
 * Granica za SADRŽAJ beleške upisan u sheet-u. Serverska granica je 80.000 znakova
 * HTML-a (`NOTE_CONTENT_LIMIT`), a `noteTextToHtml` na svaki red doda `<p></p>` i
 * escapuje znakove — 20.000 znakova čistog teksta staje u nju sa velikom
 * rezervom. Duži tekst nije posao sheeta nego editora beleške.
 */
const MAX_NOTE_TEXT = 20_000;

/** Sva četiri tipa iz `pages.create` — isti skup koji web `create-page-dialog` nudi. */
type PageKind = 'note' | 'task' | 'file' | 'table';

type DuePreset = { label: string; days: number | null };

/**
 * Isti preseti kao u meniju akcija zadatka. Proizvoljan datum nosi peti čip
 * („Neki drugi dan…") koji otvara `DatePickerSheet` — do P7 je taj čip postojao
 * samo u komentaru, a sheet nije bio ni uvezen ni montiran (D13).
 */
const DUE_PRESETS: readonly DuePreset[] = [
  { label: 'Bez roka', days: null },
  { label: 'Danas', days: 0 },
  { label: 'Sutra', days: 1 },
  { label: 'Za 7 dana', days: 7 },
];

/** Presetu koji odgovara datom trenutku — `null` kad je datum „neki drugi dan". */
function presetFor(dueAt: number | null): DuePreset | undefined {
  return DUE_PRESETS.find((preset) =>
    preset.days === null ? dueAt === null : dueAt === dueDateInDays(preset.days),
  );
}

/**
 * Kreiranje stranice/pod-stranice iz canvas rail-a i sekcije „Podstranice" (M4.4).
 * Native unos naslova + vrste (sve četiri) → `areasV2.createPage` (PARITET A5:
 * ujednačeno sa `pages.create`, koji tvrdo baca na tuđem roditelju umesto da pošalje
 * zahtev za odobrenje); WebView (koji sluša `getAreaCanvasByArea` / `getPageCanvasByPage`)
 * sam pokupi novi čvor realtime.
 *
 * PARITET SA WEBOM (`create-page-dialog.tsx`): zadatak nosi i status, prioritet,
 * izvršioce, rok (uz pun kalendar, D13), instrukcije i podzadatke. Da sheet ne
 * postane formular preko celog ekrana, sve to stoji iza reda „Više opcija" koji se
 * razvija — naslov i vrsta ostaju odmah vidljivi, pa je brz unos i dalje jedan
 * potez. Beleška od P7 ima i polje „Sadržaj (opciono)" (D14).
 *
 * Šta je svesno DRUGAČIJE od weba:
 * - **Nema pikera oblasti.** Web ga ima, ali `disabled` kad postoji `target.areaId`
 *   (`create-page-dialog.tsx:142`), a sva tri mounta ovog sheeta prosleđuju
 *   konkretnu oblast. Umesto pikera sheet KAŽE u kojoj oblasti pravi stavku.
 *   Globalni „novi zadatak" mobilni ima sa izborom oblasti (`quick-add-sheet.tsx`).
 * - **Sadržaj beleške je obično polje, ne rich-text editor.** Razlog u
 *   `lib/note-content.ts` (`noteTextToHtml`).
 *
 * `parentPageId` bira nivo: `null` = koren oblasti (canvas oblasti), id stranice =
 * pod-stranica (canvas stranice).
 */
export function PageCreateSheet({
  open,
  startupId,
  areaId,
  parentPageId,
  onClose,
}: {
  open: boolean;
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
  parentPageId: Id<'pages'> | null;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const create = useMutation(api.areasV2.createPage);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<PageKind>('note');
  const [busy, setBusy] = useState(false);

  // Detalji zadatka (iza „Više opcija").
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<TaskStatus>('backlog');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeIds, setAssigneeIds] = useState<Id<'profiles'>[]>([]);
  /** Rok kao TRENUTAK (ms u lokalno podne), ne broj dana — peti čip daje datum. */
  const [dueAt, setDueAt] = useState<number | null>(null);
  const [instructions, setInstructions] = useState('');
  const [checkpoints, setCheckpoints] = useState<CheckpointDraft[]>([]);
  const [assigneesOpen, setAssigneesOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);

  // Sadržaj beleške (D14) — čist tekst, u HTML se prevodi pri slanju.
  const [noteText, setNoteText] = useState('');

  // Članovi se učitavaju tek kad zaista trebaju (otvoren sheet + razvijene opcije
  // zadatka) — brzo kreiranje beleške ne plaća `listMembers`.
  const members = useQuery(
    api.startups.listMembers,
    open && kind === 'task' && expanded ? { startupId, limit: 50 } : 'skip',
  );
  // Samo da sheet može da KAŽE u kojoj oblasti pravi stavku (D14/8c) — web to
  // piše u opisu dijaloga („Dodaješ sadržaj u X.", `create-page-dialog.tsx:114`).
  // Piker oblasti se NE dodaje: web ga zaključava kad postoji `target.areaId`, a
  // sva tri mounta ovog sheeta prosleđuju konkretnu oblast (plan P7 §5.1).
  const startup = useQuery(api.startups.get, open ? { startupId } : 'skip');
  const areaLabel = startup?.areas.find((area) => area._id === areaId)?.label ?? null;

  const reset = () => {
    setTitle('');
    setKind('note');
    setExpanded(false);
    setStatus('backlog');
    setPriority('medium');
    setAssigneeIds([]);
    setDueAt(null);
    setInstructions('');
    setCheckpoints([]);
    setNoteText('');
  };

  /**
   * Zatvaranje PRAZNI obrazac. Sheet je montiran trajno na sva četiri mesta, pa bi
   * bez ovoga otkazani nacrt iskočio pri sledećem otvaranju — i to pod drugim
   * naslovom i drugom oblašću (`areaId`/`parentPageId` dolaze iz propova, nacrt iz
   * state-a). Web to rešava remount-om: `workspace-shell.tsx:1100` daje dijalogu
   * `key` koji sadrži i `open` i ceo `target`, pa se stanje briše na svako
   * zatvaranje. Ovo je isto ponašanje, bez remount-a.
   *
   * Cena: dodir po backdrop-u gubi nacrt. Prihvaćeno svesno — nacrt koji preživi
   * pod pogrešnim zaglavljem laže, a prazan obrazac ne.
   */
  const closeAll = () => {
    setAssigneesOpen(false);
    setDueOpen(false);
    reset();
    onClose();
  };

  const submit = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      haptics.warning();
      Alert.alert('Prazan naslov', 'Unesi naslov stranice.');
      return;
    }
    setBusy(true);
    haptics.tap();
    try {
      const cleanInstructions = instructions.trim();
      const result = await create({
        startupId,
        areaId,
        rootPageId: parentPageId,
        kind,
        title: cleanTitle,
        // Sadržaj beleške (D14) — samo kad ga korisnik zaista upiše, da prazna
        // beleška ne dobije `<p></p>` umesto `""` (server prazno čuva kao `""`).
        ...(kind === 'note' && noteText.trim() ? { content: noteTextToHtml(noteText) } : {}),
        // Opciona polja se šalju samo za zadatak i samo kad su postavljena —
        // `areasV2.createPage` ih validira kroz `validateWorkspacePageTarget`.
        ...(kind === 'task'
          ? {
              taskStatus: status,
              taskPriority: priority,
              ...(assigneeIds.length > 0 ? { assigneeProfileIds: assigneeIds } : {}),
              ...(dueAt === null ? {} : { dueDate: dueAt }),
              ...(cleanInstructions ? { instructions: cleanInstructions } : {}),
              ...(checkpoints.length > 0 ? { checkpoints } : {}),
            }
          : {}),
      });
      haptics.success();
      if (result.nestingStatus === 'pending') {
        Alert.alert(
          'Čeka odobrenje',
          `„${cleanTitle}" je kreirana u korenu oblasti i čeka odobrenje autora ciljne stranice.`,
        );
      }
      reset();
      closeAll();
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Stranica nije kreirana.'));
    } finally {
      setBusy(false);
    }
  };

  // Sažetak u podnaslovu reda „Više opcija" — pokazuje šta je već izabrano, pa se
  // sekcija ne mora otvarati da bi se to videlo.
  const duePreset = presetFor(dueAt);
  const optionsSummary = [
    TASK_STATUS_META[status].label,
    TASK_PRIORITY_META[priority].label,
    assigneeIds.length > 0 ? `${assigneeIds.length} izvršilaca` : null,
    // Presetu ide njegova labela („Sutra"), proizvoljnom datumu pun datum —
    // inače bi „neki drugi dan" u sažetku izgledao kao da rok nije postavljen.
    dueAt === null ? null : (duePreset?.label ?? formatDueDate(dueAt)),
    checkpoints.length > 0 ? `${checkpoints.length} podzadataka` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    // Izbor izvršilaca je BRAT, ne dete: ugnježdeni `Modal` na Androidu proguta
    // `onRequestClose`, pa bi sistemsko „nazad" zatvorilo pogrešan sloj.
    <>
      <Sheet visible={open} onClose={closeAll} avoidKeyboard maxHeight="85%" style={styles.sheet}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
            <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
              {parentPageId === null ? 'Nova stranica' : 'Nova podstranica'}
            </Text>
            {/* U kojoj oblasti se stavka pravi (D14/8c). Web isto piše u opisu
                dijaloga; do P7 mobilni to nije pisao nigde. */}
            {areaLabel === null ? null : (
              <Text style={[styles.areaLine, { color: colors.mutedForeground }]}>
                U oblasti „{areaLabel}".
              </Text>
            )}
            <TextInput
              value={title}
              onChangeText={setTitle}
              autoFocus
              maxLength={MAX_TITLE}
              placeholder={kind === 'task' ? 'Šta treba uraditi?' : 'Naslov'}
              placeholderTextColor={colors.mutedForeground}
              selectionColor={colors.primary}
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input }]}
            />
            <View style={[styles.kindRow, { backgroundColor: colors.muted }]}>
              <KindSegment
                label="Beleška"
                icon={<FileText size={16} color={kind === 'note' ? colors.foreground : colors.mutedForeground} />}
                active={kind === 'note'}
                disabled={busy}
                onPress={() => setKind('note')}
                colors={colors}
              />
              <KindSegment
                label="Zadatak"
                icon={<ListTodo size={16} color={kind === 'task' ? colors.foreground : colors.mutedForeground} />}
                active={kind === 'task'}
                disabled={busy}
                onPress={() => setKind('task')}
                colors={colors}
              />
              {/* Tabela i prilozi: `TablePanel` i `FilesPanel` na mobilnom rade,
                  ali se prazna tabela/fajl-oblačić dosad nisu mogli NAPRAVITI sa
                  telefona — web `create-page-dialog` nudi sva četiri tipa. */}
              <KindSegment
                label="Tabela"
                icon={<Table size={16} color={kind === 'table' ? colors.foreground : colors.mutedForeground} />}
                active={kind === 'table'}
                disabled={busy}
                onPress={() => setKind('table')}
                colors={colors}
              />
              <KindSegment
                label="Prilozi"
                icon={<Paperclip size={16} color={kind === 'file' ? colors.foreground : colors.mutedForeground} />}
                active={kind === 'file'}
                disabled={busy}
                onPress={() => setKind('file')}
                colors={colors}
              />
            </View>

            {/* Sadržaj beleške (D14). NAMERNO obično polje, ne tentap editor: dva
                WebView editora u istom stablu su drugi bundle i drugi merni rizik
                (`ZA-POPRAVKU.md` §2). Puno formatiranje se dobija otvaranjem
                beleške posle kreiranja — tok koji mobilni već ima. */}
            {kind === 'note' ? (
              <Section label="Sadržaj (opciono)" colors={colors}>
                <TextInput
                  value={noteText}
                  onChangeText={setNoteText}
                  editable={!busy}
                  multiline
                  maxLength={MAX_NOTE_TEXT}
                  placeholder="Zapiši detalje beleške ovde…"
                  placeholderTextColor={colors.mutedForeground}
                  selectionColor={colors.primary}
                  accessibilityLabel="Sadržaj beleške"
                  style={[
                    styles.input,
                    styles.textarea,
                    { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input },
                  ]}
                />
              </Section>
            ) : null}

            {kind === 'task' ? (
              <>
                <Row
                  title="Više opcija"
                  subtitle={expanded ? undefined : optionsSummary}
                  onPress={() => setExpanded((value) => !value)}
                  disabled={busy}
                  showChevron={false}
                  accessibilityLabel={`Više opcija zadatka${expanded ? '' : `, ${optionsSummary}`}`}
                  accessibilityHint={expanded ? 'Skuplja detalje zadatka' : 'Otvara detalje zadatka'}
                  style={styles.moreRow}
                  icon={
                    expanded ? (
                      <ChevronDown size={20} color={colors.mutedForeground} />
                    ) : (
                      <ChevronRight size={20} color={colors.mutedForeground} />
                    )
                  }
                />

                {expanded ? (
                  <>
                    <Section label="Status" colors={colors}>
                      <View style={styles.chips}>
                        {TASK_STATUS_ORDER.map((value) => (
                          <OptionChip
                            key={value}
                            label={TASK_STATUS_META[value].label}
                            dotColor={statusColor(colors, value)}
                            active={status === value}
                            disabled={busy}
                            onPress={() => setStatus(value)}
                          />
                        ))}
                      </View>
                    </Section>

                    <Section label="Prioritet" colors={colors}>
                      <View style={styles.chips}>
                        {TASK_PRIORITY_ORDER.map((value) => (
                          <OptionChip
                            key={value}
                            label={TASK_PRIORITY_META[value].label}
                            dotColor={priorityColor(colors, value)}
                            active={priority === value}
                            disabled={busy}
                            onPress={() => setPriority(value)}
                          />
                        ))}
                      </View>
                    </Section>

                    <Section label="Rok" colors={colors}>
                      <View style={styles.chips}>
                        {DUE_PRESETS.map((preset) => (
                          <OptionChip
                            key={preset.label}
                            label={preset.label}
                            active={duePreset?.label === preset.label}
                            disabled={busy}
                            onPress={() =>
                              setDueAt(preset.days === null ? null : dueDateInDays(preset.days))
                            }
                          />
                        ))}
                        {/* Peti čip = pun kalendar (D13). Aktivan je kad izabran
                            datum nije nijedan preset, pa nosi i sam datum. */}
                        <OptionChip
                          label={
                            dueAt !== null && duePreset === undefined
                              ? formatDueDate(dueAt)
                              : 'Neki drugi dan…'
                          }
                          active={dueAt !== null && duePreset === undefined}
                          disabled={busy}
                          onPress={() => {
                            haptics.tap();
                            setDueOpen(true);
                          }}
                        />
                      </View>
                    </Section>

                    <Row
                      variant="value"
                      title={assigneeCountLabel(assigneeIds.length)}
                      onPress={() => setAssigneesOpen(true)}
                      disabled={busy}
                      accessibilityLabel={`Izaberi izvršioce, izabrano ${assigneeIds.length}`}
                      style={styles.moreRow}
                      icon={<Users size={20} color={colors.mutedForeground} />}
                    />

                    <Section label="Instrukcije" colors={colors}>
                      <TextInput
                        value={instructions}
                        onChangeText={setInstructions}
                        editable={!busy}
                        multiline
                        maxLength={MAX_INSTRUCTIONS}
                        placeholder="Šta treba uraditi i koji rezultat se očekuje…"
                        placeholderTextColor={colors.mutedForeground}
                        selectionColor={colors.primary}
                        style={[
                          styles.input,
                          styles.textarea,
                          { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input },
                        ]}
                      />
                    </Section>

                    <Section label="Podzadaci" colors={colors}>
                      <CheckpointDraftList
                        items={checkpoints}
                        onChange={setCheckpoints}
                        disabled={busy}
                      />
                    </Section>
                  </>
                ) : null}
              </>
            ) : null}
        </ScrollView>
        <View style={styles.actions}>
          <Button label="Otkaži" variant="ghost" onPress={closeAll} disabled={busy} style={styles.flexBtn} />
          <Button label="Dodaj" onPress={() => void submit()} loading={busy} style={styles.flexBtn} />
        </View>
      </Sheet>

      <AssigneePickerSheet
        open={assigneesOpen}
        members={members}
        selectedIds={assigneeIds}
        onChange={setAssigneeIds}
        onClose={() => setAssigneesOpen(false)}
      />

      {/* I kalendar je BRAT, iz istog razloga kao izbor izvršilaca (isti obrazac
          kao `task-actions-sheet.tsx:216-226`). */}
      <DatePickerSheet
        visible={dueOpen}
        value={dueAt}
        onSelect={(next) => {
          setDueAt(next);
          setDueOpen(false);
        }}
        onClose={() => setDueOpen(false)}
      />
    </>
  );
}

function Section({
  label,
  colors,
  children,
}: {
  label: string;
  colors: ColorTokens;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{label}</Text>
      {children}
    </View>
  );
}

function KindSegment({
  label,
  icon,
  active,
  disabled,
  onPress,
  colors,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
  colors: ColorTokens;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.segment,
        active && { backgroundColor: colors.card, borderColor: colors.border },
      ]}>
      {icon}
      <Text
        style={[styles.segmentLabel, { color: active ? colors.foreground : colors.mutedForeground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 20,
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    gap: 10,
    paddingBottom: 4,
  },
  heading: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
  },
  areaLine: {
    fontSize: fontSize.base,
    marginTop: -4,
  },
  input: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.base,
  },
  textarea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  kindRow: {
    flexDirection: 'row',
    // Četiri tipa u jednom redu na uskom telefonu seku labelu — pusti prelom.
    flexWrap: 'wrap',
    padding: 4,
    borderRadius: radius.lg,
    gap: 4,
  },
  segment: {
    flex: 1,
    // Dva segmenta po redu kad se prelomi (4 tipa × ~46% širine).
    minWidth: '46%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  segmentLabel: {
    fontSize: 14,
    fontWeight: fontWeight.medium,
  },
  // Red unutar sheeta (već ima horizontalni padding) — bez dodatnog.
  moreRow: {
    paddingHorizontal: 0,
    borderRadius: radius.md,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
  },
  flexBtn: {
    flex: 1,
  },
});
