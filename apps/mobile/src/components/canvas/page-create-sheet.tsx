import { useMutation, useQuery } from 'convex/react';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Images,
  ListTodo,
  Paperclip,
  Table,
  Users,
  X,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  DraftNoteEditor,
  type DraftNoteEditorHandle,
} from '@/components/canvas/draft-note-editor';
import { NoteInsertSheet } from '@/components/stranica/note-insert-sheet';
import { NoteLinkSheet } from '@/components/stranica/note-link-sheet';
import type { EditorSelection, LinkRequest } from '@/components/stranica/note-toolbar';
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
import { MAX_PAGE_FILES } from '@/convex/lib/page_files';
import {
  clearCreateDraft,
  createDraftKey,
  readCreateDraft,
  writeCreateDraft,
  type DraftFilePick,
  type PageCreateDraft,
} from '@/lib/create-draft';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import {
  isEmptyNoteHtml,
  NOTE_CONTENT_LIMIT,
  noteHtmlToText,
} from '@/lib/note-content';
import {
  planPageFilePicks,
  rejectedPicksMessage,
} from '@/lib/page-file-picks';
import {
  chunkRows,
  parseSpreadsheet,
  SPREADSHEET_TYPES,
} from '@/lib/table-import';
import {
  MAX_TABLE_COLUMNS,
  MAX_TABLE_IMPORT_BATCH,
  MAX_TABLE_ROWS,
} from '@/lib/table-limits';
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
import { pushUndo } from '@/lib/undo';
import { postUploadBlob, readUploadBlob } from '@/lib/upload';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, radius, type ColorTokens } from '@/theme/tokens';

const MAX_TITLE = 200;
const MAX_INSTRUCTIONS = 20_000;
/** Ručni unos je za male tabele; masovni sadržaj ide kroz uvoz fajla. */
const MANUAL_ROWS_CAP = 20;

/** Sva četiri tipa iz `pages.create` — isti skup koji web `create-page-dialog` nudi. */
type PageKind = 'note' | 'task' | 'file' | 'table';

const KIND_CREATED_LABEL: Record<PageKind, string> = {
  note: 'Beleška je kreirana.',
  task: 'Zadatak je kreiran.',
  table: 'Tabela je kreirana.',
  file: 'Oblačić je kreiran.',
};

type DuePreset = { label: string; days: number | null };

/**
 * Isti preseti kao u meniju akcija zadatka. Proizvoljan datum nosi peti čip
 * („Neki drugi dan…") koji otvara `DatePickerSheet`.
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
 * Kreiranje stranice/pod-stranice iz canvas rail-a i sekcije „Podstranice".
 * Native unos → `areasV2.createPage`; WebView (koji sluša canvas upite) sam
 * pokupi novi čvor realtime.
 *
 * LANAC 7 — kreiranje prima SVE što vrsta nosi, kao web dijalog:
 * - **Beleška**: PUN tentap editor (isti bundle i traka kao `note-editor.tsx`)
 *   kao druga strana OVOG sheeta — red „Telo beleške" menja sadržaj panela, pa
 *   ništa ne stoji IZNAD WebView-a (Z7 geometrija ne nastaje). HTML ide u
 *   `content` argument. Prilozi u telu traže `pageId`, pa ih nacrt ne nudi.
 * - **Zadatak**: status/prioritet/izvršioci/rok/instrukcije/podzadaci (od P7).
 * - **Tabela**: uvoz CSV/XLSX (zajednički parser `@devotion/shared` — isti kao
 *   web) ILI ručne kolone + početni redovi; upis ide POSLE `createPage` kroz
 *   `pageTables.importRows` u serijama od 200. Padne li PRVA serija, stranica
 *   se arhivira (nema huska); pad kasnije serije ostavlja delimičan uvoz uz
 *   jasnu poruku — isto ponašanje kao web dijalog.
 * - **Prilozi**: više fajlova odjednom (galerija/dokumenti/kamera) izabranih
 *   PRE kreiranja; upload ide posle `createPage` redom, sa brojačem. Nijedan
 *   uspeo → stranica se arhivira; deo uspeo → ostaje uz spisak neuspelih.
 *
 * **Nacrt** (lanac 7): zatvaranje sheeta BEZ uspešnog kreiranja snima stanje u
 * `lib/create-draft.ts` (in-memory, ključ startup:oblast:roditelj); otvaranje ga
 * vraća uz „Odbaci". Slučajan dodir po backdrop-u više ne briše unos.
 *
 * **Poništi**: svako uspešno kreiranje gura `pageCreate` u `lib/undo.ts` —
 * inverz je `areasV2.archivePage` (traka „Poništi" na ekranu ispod sheeta).
 *
 * Svesno drugačije od weba: nema pikera oblasti (sva tri mounta prosleđuju
 * konkretnu oblast — sheet KAŽE gde pravi stavku; globalni unos ima
 * `quick-add-sheet.tsx`).
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
  const { height: windowHeight } = useWindowDimensions();
  const keyboardInset = useKeyboardInset();
  const create = useMutation(api.areasV2.createPage);
  const importRowsMutation = useMutation(api.pageTables.importRows);
  const generateUploadUrl = useMutation(api.pageFiles.generateUploadUrl);
  const attach = useMutation(api.pageFiles.attach);
  const archivePage = useMutation(api.areasV2.archivePage);

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<PageKind>('note');
  const [busy, setBusy] = useState(false);
  /** Faza POSLE kreiranja (upis tabele / upload) — brojač u podnožju. */
  const [phase, setPhase] = useState<{ label: string; done: number; total: number } | null>(null);

  // Strana sheeta: obrazac ili pun editor tela beleške.
  const [page, setPage] = useState<'form' | 'body'>('form');

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

  // Telo beleške: HTML u REF-u (kucanje ne sme da prerenderuje WebView),
  // `noteSummary` je tekstualni pregled za red u obrascu.
  const noteHtmlRef = useRef('');
  const [noteSummary, setNoteSummary] = useState('');
  const editorHandleRef = useRef<DraftNoteEditorHandle | null>(null);
  const insertSelectionRef = useRef<EditorSelection>({ from: 0, to: 0 });
  const [linkRequest, setLinkRequest] = useState<LinkRequest | null>(null);
  const [insertOpen, setInsertOpen] = useState(false);

  // Tabela: uvezen fajl ILI ručne kolone/redovi (iza „Više opcija").
  const [tableFile, setTableFile] = useState<PageCreateDraft['tableFile']>(null);
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(true);
  const [tableReading, setTableReading] = useState(false);
  const [tableExpanded, setTableExpanded] = useState(false);
  const [manualColumns, setManualColumns] = useState<string[]>([]);
  const [manualRows, setManualRows] = useState<string[][]>([]);

  // Prilozi: izbor PRE kreiranja; upload ide posle `createPage`.
  const [filePicks, setFilePicks] = useState<DraftFilePick[]>([]);

  const [draftNotice, setDraftNotice] = useState(false);
  const draftKey = createDraftKey(startupId, areaId, parentPageId);

  // Članovi se učitavaju tek kad zaista trebaju (otvoren sheet + razvijene opcije
  // zadatka) — brzo kreiranje beleške ne plaća `listMembers`.
  const members = useQuery(
    api.startups.listMembers,
    open && kind === 'task' && expanded ? { startupId, limit: 50 } : 'skip',
  );
  // Samo da sheet može da KAŽE u kojoj oblasti pravi stavku.
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
    noteHtmlRef.current = '';
    setNoteSummary('');
    setTableFile(null);
    setFirstRowIsHeader(true);
    setTableExpanded(false);
    setManualColumns([]);
    setManualRows([]);
    setFilePicks([]);
    setPage('form');
  };

  const hydrate = (draft: PageCreateDraft) => {
    setTitle(draft.title);
    setKind(draft.kind);
    setStatus(draft.status);
    setPriority(draft.priority);
    setAssigneeIds(draft.assigneeIds);
    setDueAt(draft.dueAt);
    setInstructions(draft.instructions);
    setCheckpoints(draft.checkpoints);
    noteHtmlRef.current = draft.noteHtml;
    setNoteSummary(noteHtmlToText(draft.noteHtml).trim().slice(0, 80));
    setTableFile(draft.tableFile);
    setFirstRowIsHeader(draft.firstRowIsHeader);
    setManualColumns(draft.manualColumns);
    setManualRows(draft.manualRows);
    setFilePicks(draft.filePicks);
    setDraftNotice(true);
  };

  const isDirty = () =>
    title.trim() !== '' ||
    (noteHtmlRef.current !== '' && !isEmptyNoteHtml(noteHtmlRef.current)) ||
    instructions.trim() !== '' ||
    checkpoints.length > 0 ||
    assigneeIds.length > 0 ||
    dueAt !== null ||
    tableFile !== null ||
    manualColumns.length > 0 ||
    manualRows.length > 0 ||
    filePicks.length > 0;

  // Vraćanje nacrta na otvaranje — samo za ISTO mesto (ključ nosi startup,
  // oblast i roditelja), pa nacrt ne može da iskoči pod tuđim zaglavljem.
  const openedRef = useRef(false);
  useEffect(() => {
    if (open && !openedRef.current) {
      openedRef.current = true;
      const draft = readCreateDraft(draftKey);
      if (draft !== null) hydrate(draft);
    } else if (!open) {
      openedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draftKey]);

  /**
   * Zatvaranje ČUVA nacrt (lanac 7) — slučajan dodir po backdrop-u više ne
   * briše unos. Uspešno kreiranje ide kroz `finishClose` koje nacrt briše.
   */
  const closeAll = () => {
    if (busy) return; // usred upisa/uploada sheet se ne zatvara
    setAssigneesOpen(false);
    setDueOpen(false);
    setInsertOpen(false);
    setLinkRequest(null);
    if (isDirty()) {
      writeCreateDraft(draftKey, {
        title,
        kind,
        noteHtml: noteHtmlRef.current,
        status,
        priority,
        assigneeIds,
        dueAt,
        instructions,
        checkpoints,
        tableFile,
        firstRowIsHeader,
        manualColumns,
        manualRows,
        filePicks,
        savedAt: Date.now(),
      });
    } else {
      clearCreateDraft(draftKey);
    }
    setDraftNotice(false);
    reset();
    onClose();
  };

  /** Posle uspeha: nacrt se briše, obrazac čisti, sheet zatvara. */
  const finishClose = () => {
    setAssigneesOpen(false);
    setDueOpen(false);
    setInsertOpen(false);
    setLinkRequest(null);
    clearCreateDraft(draftKey);
    setDraftNotice(false);
    reset();
    onClose();
  };

  const discardDraft = () => {
    haptics.tap();
    clearCreateDraft(draftKey);
    setDraftNotice(false);
    reset();
  };

  /** Povratak iz editora tela: sveže telo u ref + pregled u red obrasca. */
  const closeBody = async () => {
    const html = await editorHandleRef.current?.getHTML();
    if (typeof html === 'string' && html !== '') noteHtmlRef.current = html;
    setNoteSummary(noteHtmlToText(noteHtmlRef.current).trim().slice(0, 80));
    setPage('form');
  };

  // ---------------------------------------------------------------- tabela --

  async function pickTableFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: SPREADSHEET_TYPES,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setTableReading(true);
    try {
      const parsed = await parseSpreadsheet(
        { uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? undefined },
        MAX_TABLE_COLUMNS,
      );
      if (parsed.columnCount > MAX_TABLE_COLUMNS) {
        haptics.warning();
        Alert.alert(
          'Previše kolona',
          `Fajl ima ${parsed.columnCount} kolona; granica je ${MAX_TABLE_COLUMNS}.`,
        );
        return;
      }
      if (parsed.matrix.length === 0) {
        haptics.warning();
        Alert.alert('Prazan fajl', 'U fajlu nema podataka za uvoz.');
        return;
      }
      if (parsed.matrix.length > MAX_TABLE_ROWS + 1) {
        haptics.warning();
        Alert.alert(
          'Previše redova',
          `Fajl ima ${parsed.matrix.length} redova; granica je ${MAX_TABLE_ROWS}.`,
        );
        return;
      }
      haptics.success();
      setTableFile({
        name: asset.name,
        matrix: parsed.matrix,
        truncatedCells: parsed.truncatedCells,
      });
      if (title.trim() === '') {
        setTitle(asset.name.replace(/\.(xlsx|xls|csv)$/i, ''));
      }
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Fajl nije pročitan.'));
    } finally {
      setTableReading(false);
    }
  }

  /** Kolone + redovi za `importRows` odmah posle kreiranja; `null` = prazna tabela. */
  function resolveTableData(): { columns: string[]; dataRows: string[][] } | null {
    if (kind !== 'table') return null;
    if (tableFile !== null) {
      const matrix = tableFile.matrix;
      const header = firstRowIsHeader ? matrix[0] : null;
      const dataRows = firstRowIsHeader ? matrix.slice(1) : matrix;
      const columns =
        header?.map((label, index) => label.trim() || `Kolona ${index + 1}`) ??
        matrix[0].map((_, index) => `Kolona ${index + 1}`);
      return { columns, dataRows };
    }
    if (manualColumns.length === 0) return null;
    const columns = manualColumns.map((label, index) => label.trim() || `Kolona ${index + 1}`);
    const dataRows = manualRows.filter((row) => row.some((cell) => cell.trim() !== ''));
    return { columns, dataRows };
  }

  // --------------------------------------------------------------- prilozi --

  function addPicks(incoming: DraftFilePick[]) {
    const plan = planPageFilePicks({ existingCount: filePicks.length, picked: incoming });
    if (plan.rejected.length > 0) {
      haptics.warning();
      Alert.alert('Neki fajlovi su odbijeni', rejectedPicksMessage(plan.rejected));
    }
    if (plan.accepted.length > 0) {
      setFilePicks((current) => [...current, ...plan.accepted]);
    }
  }

  async function pickFromGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Dozvola', 'Pristup galeriji je odbijen.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PAGE_FILES,
      quality: 0.8,
    });
    if (result.canceled) return;
    addPicks(
      result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.fileName ?? (asset.type === 'video' ? 'video.mp4' : 'slika.jpg'),
        mimeType: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        size: asset.fileSize ?? null,
      })),
    );
  }

  async function pickDocuments() {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (result.canceled) return;
    addPicks(
      result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        size: asset.size ?? null,
      })),
    );
  }

  async function pickFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Dozvola', 'Pristup kameri je odbijen.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    addPicks([
      {
        uri: asset.uri,
        name: asset.fileName ?? 'fotografija.jpg',
        mimeType: asset.mimeType ?? 'image/jpeg',
        size: asset.fileSize ?? null,
      },
    ]);
  }

  // ---------------------------------------------------------------- submit --

  const submit = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      haptics.warning();
      Alert.alert('Prazan naslov', 'Unesi naslov stranice.');
      return;
    }
    const noteHtml = kind === 'note' ? noteHtmlRef.current : '';
    if (kind === 'note' && noteHtml.length > NOTE_CONTENT_LIMIT) {
      haptics.warning();
      Alert.alert(
        'Predugačko telo',
        `Telo beleške prelazi granicu od ${NOTE_CONTENT_LIMIT.toLocaleString('sr-RS')} znakova — skrati ga pa pokušaj ponovo.`,
      );
      return;
    }
    const tableData = resolveTableData();
    if (tableData !== null && tableData.dataRows.length > MAX_TABLE_ROWS) {
      haptics.warning();
      Alert.alert(
        'Previše redova',
        `Uvoz bi napravio ${tableData.dataRows.length} redova; granica je ${MAX_TABLE_ROWS}.`,
      );
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
        // Telo iz PUNOG editora (lanac 7); prazno se ne šalje da beleška ne
        // dobije `<p></p>` umesto `""` (server prazno čuva kao `""`).
        ...(kind === 'note' && !isEmptyNoteHtml(noteHtml) ? { content: noteHtml } : {}),
        // Opciona polja samo za zadatak — `validateWorkspacePageTarget` ih
        // odbija na drugim vrstama.
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
      const pageId = result.pageId;
      let followUp: string | null = null;

      if (tableData !== null) {
        // Serije od `MAX_TABLE_IMPORT_BATCH` — jedna mutacija ima transakcione
        // limite. Prva serija nosi kolone i briše seed red (`replace`).
        const { columns, dataRows } = tableData;
        setPhase({ label: 'Upisujem tabelu', done: 0, total: dataRows.length });
        let committed = 0;
        try {
          const batches = chunkRows(dataRows, MAX_TABLE_IMPORT_BATCH);
          if (batches.length === 0) {
            await importRowsMutation({ pageId, columns, rows: [], mode: 'replace' });
          }
          for (let index = 0; index < batches.length; index += 1) {
            await importRowsMutation({
              pageId,
              ...(index === 0 ? { columns } : {}),
              rows: batches[index],
              mode: index === 0 ? 'replace' : 'append',
            });
            committed = Math.min((index + 1) * MAX_TABLE_IMPORT_BATCH, dataRows.length);
            setPhase({ label: 'Upisujem tabelu', done: committed, total: dataRows.length });
          }
        } catch (error) {
          const message = accessErrorMessage(error, 'Upis tabele nije uspeo.');
          if (committed === 0) {
            // Prva serija pala — bez podataka je stranica husk; čisti se odmah,
            // a sheet OSTAJE otvoren sa netaknutim unosom za novi pokušaj.
            await archivePage({ startupId, pageId }).catch(() => undefined);
            haptics.error();
            Alert.alert('Tabela nije kreirana', message);
            return;
          }
          followUp = `Upisano je ${committed} od ${dataRows.length} redova (${message}). Ostatak dodaj kroz „Uvezi" u prikazu tabele.`;
        }
      }

      if (kind === 'file' && filePicks.length > 0) {
        const failures: string[] = [];
        setPhase({ label: 'Otpremam fajlove', done: 0, total: filePicks.length });
        let done = 0;
        for (const pick of filePicks) {
          try {
            const { uploadUrl, token } = await generateUploadUrl({ pageId });
            const blob = await readUploadBlob(pick.uri, pick.mimeType);
            const storageId = await postUploadBlob(uploadUrl, blob);
            const attached = await attach({ pageId, storageId, token, name: pick.name });
            if (!attached.ok) failures.push(`„${pick.name}" — ${attached.message}`);
          } catch (error) {
            failures.push(
              `„${pick.name}" — ${accessErrorMessage(error, 'otpremanje nije uspelo')}`,
            );
          }
          done += 1;
          setPhase({ label: 'Otpremam fajlove', done, total: filePicks.length });
        }
        if (failures.length === filePicks.length) {
          // Nijedan fajl nije prošao — prazan oblačić se ne ostavlja za sobom.
          await archivePage({ startupId, pageId }).catch(() => undefined);
          haptics.error();
          Alert.alert('Oblačić nije kreiran', `Nijedan fajl nije otpremljen.\n${failures[0]}`);
          return;
        }
        if (failures.length > 0) {
          followUp = `Nisu otpremljeni:\n${failures.join('\n')}\nDodaj ih ponovo iz detalja oblačića.`;
        }
      }

      haptics.success();
      // Kreiranje je izmena u bazi → ima „Poništi" (traka na ekranu ispod).
      pushUndo({
        label: KIND_CREATED_LABEL[kind],
        action: { kind: 'pageCreate', startupId, pageId },
      });
      if (result.nestingStatus === 'pending') {
        Alert.alert(
          'Čeka odobrenje',
          `„${cleanTitle}" je kreirana u korenu oblasti i čeka odobrenje autora ciljne stranice.`,
        );
      }
      if (followUp !== null) {
        Alert.alert('Delimično uspelo', followUp);
      }
      finishClose();
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Stranica nije kreirana.'));
    } finally {
      setBusy(false);
      setPhase(null);
    }
  };

  // Sažetak u podnaslovu reda „Više opcija" zadatka.
  const duePreset = presetFor(dueAt);
  const optionsSummary = [
    TASK_STATUS_META[status].label,
    TASK_PRIORITY_META[priority].label,
    assigneeIds.length > 0 ? `${assigneeIds.length} izvršilaca` : null,
    dueAt === null ? null : (duePreset?.label ?? formatDueDate(dueAt)),
    checkpoints.length > 0 ? `${checkpoints.length} podzadataka` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const manualSummary =
    manualColumns.length === 0
      ? 'Ručne kolone i redovi'
      : `${manualColumns.length} kolona · ${manualRows.length} redova`;

  // Editor strana: visina prati tastaturu da zaglavlje ne izađe sa ekrana.
  const bodyHeight = Math.max(
    260,
    Math.min(Math.round(windowHeight * 0.72), windowHeight - keyboardInset - 160),
  );

  return (
    // Pomoćni sheet-ovi (izvršioci, kalendar, link, „Dodaj u belešku") su BRAĆA,
    // ne deca: ugnježden `Modal` na Androidu proguta `onRequestClose`.
    <>
      <Sheet visible={open} onClose={closeAll} avoidKeyboard maxHeight="88%" style={styles.sheet}>
        {page === 'body' ? (
          <View style={[styles.bodyPage, { height: bodyHeight }]}>
            <View style={styles.bodyHead}>
              <Text
                accessibilityRole="header"
                style={[styles.heading, styles.bodyHeading, { color: colors.foreground }]}>
                Telo beleške
              </Text>
              <Button label="Gotovo" onPress={() => void closeBody()} style={styles.bodyDone} />
            </View>
            <View
              style={[
                styles.editorFrame,
                { borderColor: colors.border, backgroundColor: colors.card },
              ]}>
              <DraftNoteEditor
                ref={editorHandleRef}
                initialHtml={noteHtmlRef.current}
                onChangeHtml={(html) => {
                  noteHtmlRef.current = html;
                }}
                onRequestLink={setLinkRequest}
                onRequestInsert={(selection) => {
                  insertSelectionRef.current = selection;
                  setInsertOpen(true);
                }}
              />
            </View>
          </View>
        ) : (
          <>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled">
              <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
                {parentPageId === null ? 'Nova stranica' : 'Nova podstranica'}
              </Text>
              {areaLabel === null ? null : (
                <Text style={[styles.areaLine, { color: colors.mutedForeground }]}>
                  U oblasti „{areaLabel}".
                </Text>
              )}
              {draftNotice ? (
                <View style={[styles.draftNotice, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.draftNoticeText, { color: colors.mutedForeground }]}>
                    Vraćen je nesačuvan nacrt.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Odbaci nacrt"
                    onPress={discardDraft}
                    disabled={busy}
                    style={styles.draftDiscard}>
                    <Text style={[styles.draftDiscardText, { color: colors.destructive }]}>
                      Odbaci
                    </Text>
                  </Pressable>
                </View>
              ) : null}
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

              {/* Beleška: telo kroz PUN editor (druga strana ovog sheeta). */}
              {kind === 'note' ? (
                <Section label="Telo beleške" colors={colors}>
                  <Row
                    title={noteSummary === '' ? 'Prazno — otvori editor' : noteSummary}
                    subtitle={noteSummary === '' ? undefined : 'Dodirni za uređivanje'}
                    onPress={() => setPage('body')}
                    disabled={busy}
                    accessibilityLabel="Telo beleške, otvara pun editor"
                    accessibilityHint="Isti editor kao u belešci, sa formatiranjem i tabelama"
                    style={styles.moreRow}
                    icon={<FileText size={20} color={colors.mutedForeground} />}
                  />
                </Section>
              ) : null}

              {/* Tabela: uvoz fajla odmah, ručne kolone/redovi iza „Više opcija". */}
              {kind === 'table' ? (
                <>
                  <Section label="Podaci (opciono)" colors={colors}>
                    {tableFile === null ? (
                      <>
                        <Button
                          label={tableReading ? 'Čitam fajl…' : 'Uvezi CSV/XLSX'}
                          variant="secondary"
                          onPress={() => void pickTableFile()}
                          disabled={busy || tableReading}
                          loading={tableReading}
                        />
                        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                          Radi i sa `;` razdvajačem i ćirilicom. Najviše {MAX_TABLE_COLUMNS} kolona
                          i {MAX_TABLE_ROWS} redova. Bez podataka se pravi prazna tabela.
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={[styles.tableSummary, { color: colors.foreground }]}>
                          {tableFile.name}{' '}
                          <Text style={{ color: colors.mutedForeground }}>
                            — {tableFile.matrix.length}{' '}
                            {tableFile.matrix.length === 1 ? 'red' : 'redova'} ×{' '}
                            {tableFile.matrix[0].length} kolona
                            {tableFile.truncatedCells > 0
                              ? ` · skraćeno ćelija: ${tableFile.truncatedCells}`
                              : ''}
                          </Text>
                        </Text>
                        <View style={styles.chips}>
                          <OptionChip
                            label="Prvi red su zaglavlja"
                            active={firstRowIsHeader}
                            disabled={busy}
                            onPress={() => setFirstRowIsHeader((value) => !value)}
                          />
                          <OptionChip
                            label="Ukloni fajl"
                            active={false}
                            disabled={busy}
                            onPress={() => setTableFile(null)}
                          />
                        </View>
                      </>
                    )}
                  </Section>

                  {tableFile === null ? (
                    <>
                      <Row
                        title="Više opcija"
                        subtitle={tableExpanded ? undefined : manualSummary}
                        onPress={() => setTableExpanded((value) => !value)}
                        disabled={busy}
                        showChevron={false}
                        accessibilityLabel={`Ručne kolone i redovi${tableExpanded ? '' : `, ${manualSummary}`}`}
                        accessibilityHint={
                          tableExpanded ? 'Skuplja ručni unos tabele' : 'Otvara ručni unos tabele'
                        }
                        style={styles.moreRow}
                        icon={
                          tableExpanded ? (
                            <ChevronDown size={20} color={colors.mutedForeground} />
                          ) : (
                            <ChevronRight size={20} color={colors.mutedForeground} />
                          )
                        }
                      />
                      {tableExpanded ? (
                        <>
                          <Section label="Kolone" colors={colors}>
                            {manualColumns.map((column, index) => (
                              <View key={index} style={styles.manualRow}>
                                <TextInput
                                  value={column}
                                  onChangeText={(value) =>
                                    setManualColumns((current) =>
                                      current.map((item, i) => (i === index ? value : item)),
                                    )
                                  }
                                  editable={!busy}
                                  maxLength={120}
                                  placeholder={`Kolona ${index + 1}`}
                                  placeholderTextColor={colors.mutedForeground}
                                  selectionColor={colors.primary}
                                  style={[
                                    styles.input,
                                    styles.manualInput,
                                    { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input },
                                  ]}
                                />
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`Ukloni kolonu ${index + 1}`}
                                  disabled={busy}
                                  onPress={() => {
                                    setManualColumns((current) => current.filter((_, i) => i !== index));
                                    setManualRows((current) =>
                                      current.map((row) => row.filter((_, i) => i !== index)),
                                    );
                                  }}
                                  style={styles.removeBtn}>
                                  <X size={18} color={colors.mutedForeground} />
                                </Pressable>
                              </View>
                            ))}
                            <Button
                              label="Dodaj kolonu"
                              variant="secondary"
                              disabled={busy || manualColumns.length >= MAX_TABLE_COLUMNS}
                              onPress={() => {
                                setManualColumns((current) => [...current, '']);
                                setManualRows((current) => current.map((row) => [...row, '']));
                              }}
                            />
                          </Section>
                          {manualColumns.length > 0 ? (
                            <Section label={`Početni redovi (${manualRows.length})`} colors={colors}>
                              {manualRows.map((row, rowIndex) => (
                                <View
                                  key={rowIndex}
                                  style={[styles.manualCard, { borderColor: colors.border }]}>
                                  <View style={styles.manualCardHead}>
                                    <Text style={[styles.manualCardTitle, { color: colors.mutedForeground }]}>
                                      Red {rowIndex + 1}
                                    </Text>
                                    <Pressable
                                      accessibilityRole="button"
                                      accessibilityLabel={`Ukloni red ${rowIndex + 1}`}
                                      disabled={busy}
                                      onPress={() =>
                                        setManualRows((current) => current.filter((_, i) => i !== rowIndex))
                                      }
                                      style={styles.removeBtn}>
                                      <X size={18} color={colors.mutedForeground} />
                                    </Pressable>
                                  </View>
                                  {row.map((cell, cellIndex) => (
                                    <TextInput
                                      key={cellIndex}
                                      value={cell}
                                      onChangeText={(value) =>
                                        setManualRows((current) =>
                                          current.map((r, ri) =>
                                            ri === rowIndex
                                              ? r.map((c, ci) => (ci === cellIndex ? value : c))
                                              : r,
                                          ),
                                        )
                                      }
                                      editable={!busy}
                                      placeholder={
                                        manualColumns[cellIndex]?.trim() || `Kolona ${cellIndex + 1}`
                                      }
                                      placeholderTextColor={colors.mutedForeground}
                                      selectionColor={colors.primary}
                                      accessibilityLabel={`Red ${rowIndex + 1}, ${manualColumns[cellIndex]?.trim() || `Kolona ${cellIndex + 1}`}`}
                                      style={[
                                        styles.input,
                                        { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input },
                                      ]}
                                    />
                                  ))}
                                </View>
                              ))}
                              <Button
                                label="Dodaj red"
                                variant="secondary"
                                disabled={busy || manualRows.length >= MANUAL_ROWS_CAP}
                                onPress={() =>
                                  setManualRows((current) => [...current, manualColumns.map(() => '')])
                                }
                              />
                              {manualRows.length >= MANUAL_ROWS_CAP ? (
                                <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                                  Ručno ide do {MANUAL_ROWS_CAP} redova — za više koristi uvoz fajla.
                                </Text>
                              ) : null}
                            </Section>
                          ) : null}
                        </>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : null}

              {/* Prilozi: više fajlova odjednom, izabranih pre kreiranja. */}
              {kind === 'file' ? (
                <Section label="Fajlovi (opciono)" colors={colors}>
                  <View style={styles.chips}>
                    <OptionChip label="Galerija" active={false} disabled={busy} onPress={() => void pickFromGallery()} />
                    <OptionChip label="Dokumenti" active={false} disabled={busy} onPress={() => void pickDocuments()} />
                    <OptionChip label="Kamera" active={false} disabled={busy} onPress={() => void pickFromCamera()} />
                  </View>
                  {filePicks.length === 0 ? (
                    <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                      Više odjednom (najviše {MAX_PAGE_FILES}). Otpremaju se čim se oblačić
                      kreira; može i prazan.
                    </Text>
                  ) : (
                    filePicks.map((pick, index) => (
                      <View
                        key={`${pick.uri}-${index}`}
                        style={[styles.pickRow, { borderColor: colors.border }]}>
                        {pick.mimeType.startsWith('image/') ? (
                          <Images size={18} color={colors.mutedForeground} />
                        ) : pick.mimeType.startsWith('video/') ? (
                          <Camera size={18} color={colors.mutedForeground} />
                        ) : (
                          <FileIcon size={18} color={colors.mutedForeground} />
                        )}
                        <Text
                          numberOfLines={1}
                          style={[styles.pickName, { color: colors.foreground }]}>
                          {pick.name}
                        </Text>
                        {pick.size !== null ? (
                          <Text style={[styles.pickSize, { color: colors.mutedForeground }]}>
                            {Math.max(1, Math.round(pick.size / 1024))} KB
                          </Text>
                        ) : null}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Ukloni ${pick.name}`}
                          disabled={busy}
                          onPress={() =>
                            setFilePicks((current) => current.filter((_, i) => i !== index))
                          }
                          style={styles.removeBtn}>
                          <X size={18} color={colors.mutedForeground} />
                        </Pressable>
                      </View>
                    ))
                  )}
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
            {phase !== null ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[styles.phase, { color: colors.mutedForeground }]}>
                {phase.label}: {phase.done}/{phase.total}
              </Text>
            ) : null}
            <View style={styles.actions}>
              <Button label="Otkaži" variant="ghost" onPress={closeAll} disabled={busy} style={styles.flexBtn} />
              <Button label="Dodaj" onPress={() => void submit()} loading={busy} style={styles.flexBtn} />
            </View>
          </>
        )}
      </Sheet>

      <AssigneePickerSheet
        open={assigneesOpen}
        members={members}
        selectedIds={assigneeIds}
        onChange={setAssigneeIds}
        onClose={() => setAssigneesOpen(false)}
      />

      {/* I kalendar je BRAT, iz istog razloga kao izbor izvršilaca (isti obrazac
          kao `task-actions-sheet.tsx`). */}
      <DatePickerSheet
        visible={dueOpen}
        value={dueAt}
        onSelect={(next) => {
          setDueAt(next);
          setDueOpen(false);
        }}
        onClose={() => setDueOpen(false)}
      />

      {/* Editor tela: link i „Dodaj u belešku" sheet-ovi — komande se vraćaju u
          WebView kroz ref, sa selekcijom zapamćenom pri otvaranju. */}
      <NoteLinkSheet
        open={linkRequest !== null}
        initialHref={linkRequest?.href ?? ''}
        onSubmit={(href) => {
          const request = linkRequest;
          setLinkRequest(null);
          if (request !== null) editorHandleRef.current?.applyLink(request.selection, href);
        }}
        onRemove={() => {
          const request = linkRequest;
          setLinkRequest(null);
          if (request !== null) editorHandleRef.current?.applyLink(request.selection, null);
        }}
        onClose={() => setLinkRequest(null)}
      />
      <NoteInsertSheet
        open={insertOpen}
        bodyLength={noteHtmlRef.current.length}
        canUpload={false}
        onClose={() => setInsertOpen(false)}
        onUpload={async () => undefined}
        onInsertTable={() => editorHandleRef.current?.insertTable(insertSelectionRef.current)}
        onInsertTableContent={(matrix, headerRow) =>
          editorHandleRef.current?.insertTableContent(insertSelectionRef.current, matrix, headerRow)
        }
        onInsertCodeBlock={() =>
          editorHandleRef.current?.insertCodeBlock(insertSelectionRef.current)
        }
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
  draftNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.md,
    paddingLeft: 12,
    paddingRight: 4,
  },
  // Statusna meta (13px) — obrazac „16px osim meta".
  draftNoticeText: {
    flex: 1,
    fontSize: 13,
  },
  draftDiscard: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  draftDiscardText: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
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
    flexWrap: 'wrap',
    padding: 4,
    borderRadius: radius.lg,
    gap: 4,
  },
  segment: {
    flex: 1,
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
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
  tableSummary: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  manualInput: {
    flex: 1,
  },
  manualCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: 10,
    gap: 8,
  },
  manualCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manualCardTitle: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
  },
  removeBtn: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingLeft: 12,
    paddingRight: 2,
    minHeight: 48,
  },
  pickName: {
    flex: 1,
    fontSize: fontSize.base,
  },
  pickSize: {
    fontSize: 13,
  },
  phase: {
    fontSize: 13,
    paddingTop: 8,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
  },
  flexBtn: {
    flex: 1,
  },
  bodyPage: {
    gap: 10,
  },
  bodyHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  bodyHeading: {
    flex: 1,
  },
  bodyDone: {
    minWidth: 110,
  },
  editorFrame: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
});
