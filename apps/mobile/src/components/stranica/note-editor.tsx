import { RichText, useEditorBridge } from '@10play/tentap-editor';
import * as Clipboard from 'expo-clipboard';
import { useMutation, useQuery } from 'convex/react';
import { Check, CloudOff, Copy, Info, RefreshCw, TriangleAlert } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardInset } from '@/hooks/use-keyboard-inset';

import { NoteInsertSheet, type NoteInsertPick } from '@/components/stranica/note-insert-sheet';
import { NoteLinkSheet } from '@/components/stranica/note-link-sheet';
import { NoteReader } from '@/components/stranica/note-reader';
import { NoteToolbar, type LinkRequest } from '@/components/stranica/note-toolbar';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import {
  EMPTY_NOTE_HTML,
  NOTE_CONTENT_LIMIT,
  noteBlockLossSentence,
  noteBlockSignature,
  noteContentEquals,
  noteEditorCss,
  noteHtmlToText,
  noteSignatureLoss,
  type NoteBlockKind,
} from '@/lib/note-content';
import { NOTE_BRIDGES, type NoteEditorBridge } from '@/lib/note-editor-bridges';
import { NOTE_EDITOR_HTML } from '@/lib/note-editor-html';
import { postUploadBlob, readUploadBlob } from '@/lib/upload';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, radius, text, type ColorTokens } from '@/theme/tokens';

/**
 * Editor beleške (M3.2). Arhitektura: **tentap** — Tiptap koji se izvršava u
 * skrivenom WebView-u, sa native trakom alata. Bundle je lokalni, pa editor radi
 * i bez mreže; jedino snimanje traži Convex.
 *
 * Model podataka je identičan webu (`apps/web/components/workspace/page-editor-view.tsx`):
 * telo je **HTML iz Tiptap-a** u `pageBodies.content`, snima se kroz
 * `areasV2.updatePage` sa `expectedRevision` (isti `KONFLIKT_IZMENA` protokol).
 * Nema konverzije formata ni u jednom smeru.
 *
 * Od lanca 6 / P2 bundle je **naš** (`lib/note-editor-html.ts`, izvor
 * `apps/mobile/editor-web/`) i nosi istu Tiptap šemu kao web — tabelu, blok koda,
 * `<hr>` i `noteFile` čvor. Beleška koja ih sadrži se zato UREĐUJE, ne samo čita.
 *
 * Zabranu je zamenio ČUVAR: pri prvom čitanju tela iz WebView-a poredi se potpis
 * blokova sa onim pre učitavanja (`noteSignatureLoss`). Ako je nečega manje,
 * autosave se gasi i beleška pada na `NoteReader` — telo se ne kvari čak i ako
 * bundle jednog dana zaostane za webom.
 */

/** Koliko se čeka posle kucanja da se pročita HTML iz WebView-a (jedan most-poziv). */
const HTML_DEBOUNCE_MS = 250;
/** Dodatna pauza pre snimanja — zbir ≈ 700 ms, kao 650 ms na webu. */
const AUTOSAVE_DEBOUNCE_MS = 450;
/** Ponovni pokušaj posle neuspelog snimanja. */
const RETRY_MS = 5_000;
/** Posle ovoliko uzastopnih neuspeha se staje i traži se ručna potvrda. */
const MAX_AUTO_RETRIES = 4;

/**
 * Koliko puta se pokušava prvo čitanje HTML-a posle učitavanja editora. Most
 * odgovara tek kad je React u WebView-u zakačio svoj `message` listener, a to
 * `onLoad` (događaj dokumenta) ne garantuje — zato pokušaj sa isteklim rokom,
 * ne jedan poziv koji ume da visi zauvek.
 */
const PRIME_ATTEMPTS = 8;
const PRIME_TIMEOUT_MS = 400;

type SaveState =
  | 'saved'
  | 'dirty'
  | 'saving'
  | 'error'
  | 'conflict'
  | 'invalid'
  | 'too-long'
  | 'lossy';

export function NoteEditor({
  pageId,
  startupId,
  remoteTitle,
  remoteContent,
  remoteRevision,
  canEdit,
  canEditBody,
}: {
  pageId: Id<'pages'>;
  startupId: Id<'startups'>;
  remoteTitle: string;
  remoteContent: string;
  remoteRevision: number;
  /** Autor stranice — sme da menja naslov. */
  canEdit: boolean;
  /** Autor + telo je njegovo (ili prazno) — sme da menja sadržaj. */
  canEditBody: boolean;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const updatePage = useMutation(api.areasV2.updatePage);

  const generateUploadUrl = useMutation(api.pageFiles.generateUploadUrl);
  const attach = useMutation(api.pageFiles.attach);

  const [title, setTitle] = useState(remoteTitle);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [linkRequest, setLinkRequest] = useState<LinkRequest | null>(null);
  const [insertOpen, setInsertOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lostBlocks, setLostBlocks] = useState<NoteBlockKind[]>([]);

  // Nacrt živi u refovima, ne u stanju: kucanje ne sme da prerenderuje WebView.
  const titleRef = useRef(remoteTitle);
  const htmlRef = useRef(remoteContent || EMPTY_NOTE_HTML);
  const savedRef = useRef({ title: remoteTitle, content: remoteContent });
  const baseRevisionRef = useRef(remoteRevision);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const conflictRef = useRef(false);
  const retriesRef = useRef(0);
  const htmlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<NoteEditorBridge | null>(null);
  const cssLoadedRef = useRef(false);
  /**
   * Selekcija zapamćena u trenutku otvaranja sheet-a. Android je gubi čim fokus
   * ode iz WebView-a — isti razlog i isti obrazac kao `applyLink`.
   */
  const insertSelectionRef = useRef({ from: 0, to: 0 });
  /** Prvo uspešno čitanje HTML-a iz WebView-a se obradi samo jednom. */
  const primedRef = useRef(false);
  /** Čuvar je okinuo: editor je odmontiran, ništa se više ne čita ni ne piše. */
  const lossyRef = useRef(false);
  /**
   * `setContent` (preuzimanje timske verzije) i sam okine `ContentUpdate`, a
   * Tiptap pritom ponovo serijalizuje HTML — bez ovoga bi ta normalizacija
   * izgledala kao korisnikova izmena i napravila prazno snimanje.
   */
  const adoptNextHtmlRef = useRef(false);
  const permissionsRef = useRef({ canEdit, canEditBody });
  permissionsRef.current = { canEdit, canEditBody };
  /**
   * Red čekanja za mutacije (isto što web radi kroz `pageUpdateQueueRef`): druga
   * izmena kreće tek kad prva vrati novu reviziju, inače bi krenula sa
   * `expectedRevision` koji je već zastareo i sama sebi napravila konflikt.
   */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const enqueue = useCallback(<Result,>(operation: () => Promise<Result>) => {
    const queued = queueRef.current.then(operation, operation);
    queueRef.current = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }, []);

  // Zamrznuto na montiranju: `initialContent` ulazi u WebView pre učitavanja i
  // kasnije se ne primenjuje, a reaktivna izmena bi samo pravila novu referencu.
  const [initialContent] = useState(() => remoteContent || EMPTY_NOTE_HTML);

  /**
   * Potpis blokova PRE učitavanja u editor — leva strana čuvara gubitka. Zamrznut
   * kao i `initialContent`, i iz istog razloga: meri se ono što je editor DOBIO.
   * Lenja inicijalizacija, ne `useRef(noteBlockSignature(...))` — argument `useRef`-a
   * se računa na SVAKI render, a telo ume da bude 80.000 znakova.
   */
  const [loadSignature] = useState(() => noteBlockSignature(initialContent));

  const bodyEditable = canEditBody;

  /**
   * Prilozi u telu: URL nikad nije u dokumentu (isto pravilo kao na webu), pa se
   * mapa `fileId → url` šalje u WebView. Pretplata se otvara samo kad telo
   * stvarno ima prilog — obična beleška ne plaća upit koji joj ne treba.
   */
  const [hasNoteFiles, setHasNoteFiles] = useState(() =>
    /data-note-file/i.test(initialContent),
  );
  const noteFiles = useQuery(api.pageFiles.list, hasNoteFiles ? { pageId } : 'skip');
  const fileUrls = useMemo(() => {
    const map: Record<string, string> = {};
    for (const file of noteFiles ?? []) {
      if (file.url !== null) map[file._id] = file.url;
    }
    return map;
  }, [noteFiles]);
  const fileUrlsRef = useRef(fileUrls);
  fileUrlsRef.current = fileUrls;

  const editorTheme = useMemo(
    () => ({
      webview: { backgroundColor: colors.background },
      webviewContainer: { backgroundColor: colors.background },
    }),
    [colors.background],
  );
  const editorCss = useMemo(
    () => noteEditorCss({ colors, bottomInset: insets.bottom }),
    [colors, insets.bottom],
  );

  const markDirty = useCallback(() => {
    if (conflictRef.current) return;
    // `setSaveState('dirty')` iz stanja 'dirty' React odbacuje bez rendera —
    // zato kucanje ne izaziva prerender (a time ni reload WebView-a).
    setSaveState(titleRef.current.trim() === '' ? 'invalid' : 'dirty');
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void save();
    }, AUTOSAVE_DEBOUNCE_MS);
    // `save` je stabilan (svi ulazi kroz refove), pa nije u dependency listi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async () => {
    const { canEdit: mayEdit, canEditBody: mayEditBody } = permissionsRef.current;
    if (!mayEdit || conflictRef.current) return;

    const nextTitle = titleRef.current.trim();
    if (nextTitle === '') {
      setSaveState('invalid');
      return;
    }
    const nextContent = htmlRef.current;
    const titleChanged = nextTitle !== savedRef.current.title;
    const contentChanged =
      mayEditBody && !noteContentEquals(nextContent, savedRef.current.content);
    if (!titleChanged && !contentChanged) {
      setSaveState('saved');
      return;
    }
    if (contentChanged && nextContent.length > NOTE_CONTENT_LIMIT) {
      setSaveState('too-long');
      return;
    }
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }

    inFlightRef.current = true;
    queuedRef.current = false;
    setSaveState('saving');
    try {
      const result = await enqueue(() =>
        updatePage({
          startupId,
          pageId,
          expectedRevision: baseRevisionRef.current,
          ...(titleChanged ? { title: nextTitle } : {}),
          ...(contentChanged ? { content: nextContent } : {}),
        }),
      );
      baseRevisionRef.current = result.revision;
      savedRef.current = {
        title: nextTitle,
        content: contentChanged ? nextContent : savedRef.current.content,
      };
      retriesRef.current = 0;
      const stillDirty =
        titleRef.current.trim() !== savedRef.current.title ||
        (permissionsRef.current.canEditBody &&
          !noteContentEquals(htmlRef.current, savedRef.current.content));
      setSaveState(stillDirty ? 'dirty' : 'saved');
    } catch (error) {
      if (String(error).includes('KONFLIKT_IZMENA')) {
        // Nacrt ostaje netaknut; dalji autosave staje dok korisnik ne odluči.
        conflictRef.current = true;
        queuedRef.current = false;
        setSaveState('conflict');
      } else {
        retriesRef.current += 1;
        setSaveState('error');
      }
    } finally {
      inFlightRef.current = false;
      if (queuedRef.current && !conflictRef.current) {
        queuedRef.current = false;
        scheduleSave();
      }
    }
  }, [enqueue, pageId, scheduleSave, startupId, updatePage]);

  /**
   * ČUVAR GUBITKA. Poredi telo koje je editor VRATIO sa telom koje je dobio. Ako
   * je bilo kog bloka manje, autosave se gasi istim mehanizmom kao konflikt i
   * beleška pada na verno čitanje. Radi jednom, na prvom čitanju posle
   * učitavanja — kasnije brisanje reda tabele je korisnikova namera, ne kvar.
   *
   * Ovo je odgovor na jedinu stvar goru od nemogućnosti uređivanja: tiho
   * osiromašeno telo upisano u bazu.
   */
  const checkLoss = useCallback(
    (html: string) => {
      const loss = noteSignatureLoss(loadSignature, noteBlockSignature(html));
      if (loss.length === 0) return false;
      // Isti mehanizam kao konflikt: `save` i `flushOnExit` oba gledaju `conflictRef`,
      // pa osiromašeno telo ne može da stigne do baze ni pri izlasku sa ekrana.
      conflictRef.current = true;
      queuedRef.current = false;
      lossyRef.current = true;
      setLostBlocks(loss);
      setSaveState('lossy');
      return true;
    },
    [loadSignature],
  );

  /** Prvo uspešno čitanje: čuvar + slanje URL-ova priloga (most je tada živ). */
  const handleFirstHtml = useCallback(
    (html: string) => {
      primedRef.current = true;
      if (Object.keys(fileUrlsRef.current).length > 0) {
        editorRef.current?.setNoteFileUrls(fileUrlsRef.current);
      }
      return checkLoss(html);
    },
    [checkLoss],
  );

  /** Čita sveži HTML iz WebView-a i, ako se razlikuje, zakazuje snimanje. */
  const pullHtml = useCallback(async () => {
    const editorInstance = editorRef.current;
    // Posle čuvara je WebView odmontiran — `getHTML()` bi visio bez odgovora.
    if (editorInstance === null || lossyRef.current) return;
    let html: string;
    try {
      html = await editorInstance.getHTML();
    } catch {
      // Most je pao (npr. WebView se upravo ruši) — sledeća izmena pokušava opet.
      return;
    }
    if (!primedRef.current && handleFirstHtml(html)) return;
    htmlRef.current = html;
    if (adoptNextHtmlRef.current) {
      // Ovo je odjek našeg `setContent`, ne korisnikova izmena: prihvatamo
      // Tiptap-ovu serijalizaciju kao „sačuvano stanje" i ne diramo server.
      adoptNextHtmlRef.current = false;
      savedRef.current = { ...savedRef.current, content: html };
      return;
    }
    if (noteContentEquals(html, savedRef.current.content)) {
      if (titleRef.current.trim() === savedRef.current.title && !conflictRef.current) {
        setSaveState('saved');
      }
      return;
    }
    markDirty();
    scheduleSave();
  }, [handleFirstHtml, markDirty, scheduleSave]);

  const handleContentChange = useCallback(() => {
    if (htmlTimerRef.current) clearTimeout(htmlTimerRef.current);
    htmlTimerRef.current = setTimeout(() => {
      htmlTimerRef.current = null;
      void pullHtml();
    }, HTML_DEBOUNCE_MS);
  }, [pullHtml]);

  const editor = useEditorBridge({
    initialContent,
    autofocus: false,
    avoidIosKeyboard: true,
    editable: bodyEditable,
    theme: editorTheme,
    bridgeExtensions: NOTE_BRIDGES,
    // Naš bundle (`editor-web/`) umesto tentap-ovog: samo on ima tabelu, blok
    // koda, `<hr>` i `noteFile` u šemi. Modulski `const` — nova referenca bi
    // reloadovala WebView (ZA-POPRAVKU Z1).
    customSource: NOTE_EDITOR_HTML,
    onChange: handleContentChange,
  }) as NoteEditorBridge;

  useEffect(() => {
    editorRef.current = editor;
  });

  /**
   * Prvo čitanje tela posle učitavanja. `onLoad` je događaj DOKUMENTA — React u
   * WebView-u tada još nije zakačio `message` listener, pa prvi `getHTML()` ume
   * da ostane bez odgovora zauvek. Zato pokušaj sa rokom, pa ponovo.
   */
  const primeEditor = useCallback(async () => {
    for (
      let attempt = 0;
      attempt < PRIME_ATTEMPTS && !primedRef.current && !lossyRef.current;
      attempt += 1
    ) {
      const html = await Promise.race([
        editorRef.current?.getHTML() ?? Promise.resolve(null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), PRIME_TIMEOUT_MS)),
      ]).catch(() => null);
      if (typeof html === 'string' && html !== '') {
        if (!primedRef.current) handleFirstHtml(html);
        return;
      }
    }
  }, [handleFirstHtml]);

  const handleEditorLoad = useCallback(() => {
    cssLoadedRef.current = true;
    editorRef.current?.injectCSS(editorCss, 'devotion-note');
    void primeEditor();
  }, [editorCss, primeEditor]);

  // Promena teme dok je editor otvoren — CSS se osvežava u mestu (isti tag).
  useEffect(() => {
    if (cssLoadedRef.current) editorRef.current?.injectCSS(editorCss, 'devotion-note');
  }, [editorCss]);

  // Potpisani URL-ovi priloga stižu asinhrono (i rotiraju) — prikaz se osvežava
  // u mestu, dokument se ne dira.
  useEffect(() => {
    if (!primedRef.current || Object.keys(fileUrls).length === 0) return;
    editorRef.current?.setNoteFileUrls(fileUrls);
  }, [fileUrls]);

  const changeTitle = useCallback(
    (value: string) => {
      titleRef.current = value;
      setTitle(value);
      if (value.trim() === '') {
        setSaveState('invalid');
        return;
      }
      markDirty();
      scheduleSave();
    },
    [markDirty, scheduleSave],
  );

  /**
   * Tuđa (ili sopstvena, sa drugog uređaja) izmena se preuzima samo kad lokalno
   * nema nesačuvanog nacrta — inače bi `setContent` pregazio ono što se kuca.
   */
  useEffect(() => {
    if (remoteRevision <= baseRevisionRef.current) return;
    if (saveState !== 'saved' || inFlightRef.current) return;
    baseRevisionRef.current = remoteRevision;
    savedRef.current = { title: remoteTitle, content: remoteContent };
    titleRef.current = remoteTitle;
    setTitle(remoteTitle);
    htmlRef.current = remoteContent || EMPTY_NOTE_HTML;
    adoptNextHtmlRef.current = true;
    editorRef.current?.setContent(remoteContent || EMPTY_NOTE_HTML);
  }, [remoteContent, remoteRevision, remoteTitle, saveState]);

  // Neuspelo snimanje se ponavlja samo — mreža se vraća, kucano se ne gubi.
  useEffect(() => {
    if (saveState !== 'error' || retriesRef.current > MAX_AUTO_RETRIES) return;
    const timer = setTimeout(() => void save(), RETRY_MS);
    return () => clearTimeout(timer);
  }, [save, saveState]);

  /**
   * Izlazak sa ekrana i odlazak aplikacije u pozadinu: mutacija se šalje bez
   * čekanja. Convex klijent živi na nivou aplikacije, pa je dovrši i kad ovaj
   * ekran više ne postoji (a ako nema mreže, zadrži je u redu do povratka).
   */
  const flushOnExit = useCallback(() => {
    // Argumenti se računaju TEK kad red dođe na nas: ako je snimanje već u letu,
    // do tada su `baseRevisionRef` i `savedRef` osveženi njegovim odgovorom
    // (refovi nadžive unmount), pa poslednji potez ne ode u lažni konflikt.
    void enqueue(async () => {
      const { canEdit: mayEdit, canEditBody: mayEditBody } = permissionsRef.current;
      if (!mayEdit || conflictRef.current) return;
      const nextTitle = titleRef.current.trim();
      if (nextTitle === '') return;
      const titleChanged = nextTitle !== savedRef.current.title;
      const contentChanged =
        mayEditBody &&
        !noteContentEquals(htmlRef.current, savedRef.current.content) &&
        htmlRef.current.length <= NOTE_CONTENT_LIMIT;
      if (!titleChanged && !contentChanged) return;
      const result = await updatePage({
        startupId,
        pageId,
        expectedRevision: baseRevisionRef.current,
        ...(titleChanged ? { title: nextTitle } : {}),
        ...(contentChanged ? { content: htmlRef.current } : {}),
      });
      // Ekran može i dalje da živi (odlazak u pozadinu) — refovi moraju da prate.
      baseRevisionRef.current = result.revision;
      savedRef.current = {
        title: nextTitle,
        content: contentChanged ? htmlRef.current : savedRef.current.content,
      };
    }).catch(() => {
      // Bez UI-ja za grešku: ekran je možda već zatvoren. Server ostaje netaknut,
      // a pri povratku se učitava poslednja sačuvana verzija.
    });
  }, [enqueue, pageId, startupId, updatePage]);

  const flushOnExitRef = useRef(flushOnExit);
  useEffect(() => {
    flushOnExitRef.current = flushOnExit;
  });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') flushOnExitRef.current();
    });
    return () => subscription.remove();
  }, []);

  useEffect(
    () => () => {
      if (htmlTimerRef.current) clearTimeout(htmlTimerRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      flushOnExitRef.current();
    },
    [],
  );

  const copyDraft = useCallback(() => {
    const text = [titleRef.current.trim(), noteHtmlToText(htmlRef.current)]
      .filter(Boolean)
      .join('\n\n');
    void Clipboard.setStringAsync(text);
  }, []);

  const loadTeamVersion = useCallback(() => {
    baseRevisionRef.current = remoteRevision;
    savedRef.current = { title: remoteTitle, content: remoteContent };
    titleRef.current = remoteTitle;
    setTitle(remoteTitle);
    htmlRef.current = remoteContent || EMPTY_NOTE_HTML;
    adoptNextHtmlRef.current = true;
    editorRef.current?.setContent(remoteContent || EMPTY_NOTE_HTML);
    conflictRef.current = false;
    retriesRef.current = 0;
    setSaveState('saved');
  }, [remoteContent, remoteRevision, remoteTitle]);

  /**
   * Vraća zapamćenu selekciju pa izvršava komandu. Android gubi tiptap selekciju
   * čim fokus ode iz WebView-a (sheet, birač slika), pa se vraća ručno; kratka
   * pauza je da se sheet stigne skloniti (isto radi i tentap).
   */
  const runAtSelection = useCallback(
    (
      selection: { from: number; to: number },
      command: (instance: NoteEditorBridge) => void,
    ) => {
      setTimeout(
        () => {
          const editorInstance = editorRef.current;
          if (editorInstance === null) return;
          editorInstance.setSelection(selection.from, selection.to);
          command(editorInstance);
          editorInstance.focus();
        },
        Platform.OS === 'android' ? 120 : 0,
      );
    },
    [],
  );

  const applyLink = useCallback(
    (href: string | null) => {
      const request = linkRequest;
      setLinkRequest(null);
      if (request === null) return;
      runAtSelection(request.selection, (instance) => instance.setLink(href));
    },
    [linkRequest, runAtSelection],
  );

  /**
   * Upload priloga i ubacivanje `noteFile` čvora u telo — isti put kao web
   * (`useNoteFileUpload` → `pageFiles.attach` → čvor sa četiri atributa) i isti
   * kod kao panel „Prilozi" (`files-panel.tsx:83`). Backend se ne dira:
   * `requireAttachmentPage` već prima i `note` stranice.
   *
   * „Poništi" traka namerno NE postoji: ovo je Tiptap izmena u telu, poništava je
   * dugme „Poništi" u traci alata (`note-toolbar.tsx`), a sam fajl se briše u
   * panelu „Prilozi". `lib/undo.ts` je za upise u bazu.
   */
  const uploadAndInsert = useCallback(
    async (pick: NoteInsertPick) => {
      const selection = insertSelectionRef.current;
      setUploading(true);
      try {
        const { uploadUrl, token } = await generateUploadUrl({ pageId });
        const blob = await readUploadBlob(pick.uri, pick.mimeType);
        const storageId = await postUploadBlob(uploadUrl, blob);
        const result = await attach({ pageId, storageId, token, name: pick.name });
        if (!result.ok) {
          haptics.error();
          Alert.alert('Prilog odbijen', result.message);
          return;
        }
        setHasNoteFiles(true);
        runAtSelection(selection, (instance) =>
          instance.insertNoteFile({
            fileId: result.fileId,
            category: result.category,
            name: result.name,
            size: result.size,
          }),
        );
        haptics.success();
      } catch (error) {
        haptics.error();
        Alert.alert('Greška', accessErrorMessage(error, 'Prilog nije poslat.'));
      } finally {
        setUploading(false);
      }
    },
    [attach, generateUploadUrl, pageId, runAtSelection],
  );

  const lossReason =
    lostBlocks.length === 0
      ? null
      : `Ova beleška sadrži ${noteBlockLossSentence(lostBlocks)} koju telefon ne ume da učita bez gubitka. Ovde je prikaz veran originalu, a uređivanje je na webu.`;

  const lockReason = !canEdit
    ? 'Sadržaj i naslov menja samo autor beleške.'
    : lossReason !== null
      ? lossReason
      : !canEditBody
        ? 'Raniji zajednički sadržaj je zaključan. Naslov možeš da menjaš, telo se uređuje na webu kroz potpisani doprinos.'
        : null;

  // Kad čuvar okine, editor se odmontira i ostaje verno čitanje SERVERSKE verzije
  // — telo koje je WebView vratio se ne prikazuje i nikad ne stigne do baze.
  const showEditor = bodyEditable && saveState !== 'lossy';

  return (
    <View style={styles.container}>
      {saveState === 'conflict' ? (
        <ConflictBanner colors={colors} onCopy={copyDraft} onLoadTeam={loadTeamVersion} />
      ) : null}

      <View style={[styles.head, { borderBottomColor: colors.border }]}>
        {canEdit ? (
          <TextInput
            value={title}
            onChangeText={changeTitle}
            placeholder="Naslov beleške"
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.primary}
            maxLength={200}
            accessibilityLabel="Naslov beleške"
            style={[styles.titleInput, { color: colors.foreground }]}
          />
        ) : (
          <Text style={[styles.titleInput, { color: colors.foreground }]}>{title}</Text>
        )}
        <SaveIndicator state={saveState} canEdit={canEdit} colors={colors} onRetry={() => void save()} />
      </View>

      {lockReason !== null ? (
        <View style={[styles.notice, { backgroundColor: colors.muted }]}>
          <Info size={16} color={colors.mutedForeground} />
          <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>{lockReason}</Text>
        </View>
      ) : null}

      {showEditor ? (
        <>
          <RichText editor={editor} onLoad={handleEditorLoad} />
          {/* NE `KeyboardAvoidingView`: ugnježden ovako duboko meša relativne i
              apsolutne koordinate i podigne traku ~40dp umesto pune visine
              tastature — traka završi ISPOD nje (E10). Pomak ide iz samog
              keyboard eventa; detalji u `use-keyboard-inset.ts`. */}
          <View
            style={[styles.toolbarWrap, { bottom: keyboardInset }]}
            pointerEvents="box-none">
            <NoteToolbar
              editor={editor}
              onRequestLink={setLinkRequest}
              onRequestInsert={(selection) => {
                insertSelectionRef.current = selection;
                setInsertOpen(true);
              }}
            />
          </View>
        </>
      ) : (
        <NoteReader
          html={remoteContent}
          emptyDescription={
            canEdit
              ? 'Ova beleška još nema sadržaj.'
              : 'Autor još nije upisao sadržaj ove beleške.'
          }
        />
      )}

      {uploading ? (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.uploading,
            { backgroundColor: colors.popover, borderColor: colors.border },
          ]}>
          <ActivityIndicator size="small" color={colors.mutedForeground} />
          <Text style={[styles.uploadingText, { color: colors.foreground }]}>
            Otpremam prilog…
          </Text>
        </View>
      ) : null}

      <NoteLinkSheet
        open={linkRequest !== null}
        initialHref={linkRequest?.href ?? ''}
        onSubmit={applyLink}
        onRemove={() => applyLink(null)}
        onClose={() => setLinkRequest(null)}
      />

      {/* Sheet se renderuje ODAVDE, a ne iz trake: traka nestaje čim tastatura
          padne (`note-toolbar.tsx`), a otvaranje sheet-a je baš gasi — sheet bi
          nestao zajedno sa njom. */}
      <NoteInsertSheet
        open={insertOpen}
        bodyLength={htmlRef.current.length}
        onClose={() => setInsertOpen(false)}
        onUpload={uploadAndInsert}
        onInsertTable={() =>
          runAtSelection(insertSelectionRef.current, (instance) =>
            instance.insertNoteTable(),
          )
        }
        onInsertTableContent={(matrix, firstRowIsHeader) =>
          runAtSelection(insertSelectionRef.current, (instance) =>
            instance.insertNoteTableContent(matrix, firstRowIsHeader),
          )
        }
        onInsertCodeBlock={() =>
          runAtSelection(insertSelectionRef.current, (instance) =>
            instance.toggleNoteCodeBlock(),
          )
        }
      />
    </View>
  );
}

function ConflictBanner({
  colors,
  onCopy,
  onLoadTeam,
}: {
  colors: ColorTokens;
  onCopy: () => void;
  onLoadTeam: () => void;
}) {
  return (
    <View
      accessibilityRole="alert"
      style={[styles.conflict, { backgroundColor: `${colors.warning}1F`, borderColor: colors.warning }]}>
      <Text style={[styles.conflictTitle, { color: colors.foreground }]}>
        Neko iz tima je izmenio ovu belešku.
      </Text>
      <Text style={[styles.conflictText, { color: colors.mutedForeground }]}>
        Tvoj nacrt je ostao netaknut. Kopiraj ga pre nego što učitaš timsku verziju.
      </Text>
      <View style={styles.conflictActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kopiraj moj nacrt"
          onPress={onCopy}
          style={({ pressed }) => [
            styles.conflictBtn,
            { borderColor: colors.border },
            pressed && { backgroundColor: colors.muted },
          ]}>
          <Copy size={16} color={colors.foreground} />
          <Text style={[styles.conflictBtnText, { color: colors.foreground }]}>Kopiraj nacrt</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Učitaj timsku verziju"
          onPress={onLoadTeam}
          style={({ pressed }) => [
            styles.conflictBtn,
            { borderColor: colors.border, backgroundColor: colors.primary },
            pressed && { opacity: 0.85 },
          ]}>
          <RefreshCw size={16} color={colors.primaryForeground} />
          <Text style={[styles.conflictBtnText, { color: colors.primaryForeground }]}>
            Učitaj timsku
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const STATE_LABEL: Record<SaveState, string> = {
  saved: 'Sačuvano',
  dirty: 'Izmene čekaju',
  saving: 'Čuvam…',
  error: 'Nije sačuvano',
  conflict: 'Konflikt izmena',
  invalid: 'Naslov je obavezan',
  'too-long': 'Predugačko',
  lossy: 'Samo čitanje',
};

function SaveIndicator({
  state,
  canEdit,
  colors,
  onRetry,
}: {
  state: SaveState;
  canEdit: boolean;
  colors: ColorTokens;
  onRetry: () => void;
}) {
  if (!canEdit) return null;

  const retryable = state === 'error' || state === 'too-long';
  const tone =
    state === 'saved'
      ? colors.success
      : state === 'error' || state === 'too-long'
        ? colors.danger
        : state === 'conflict' || state === 'invalid' || state === 'lossy'
          ? colors.warning
          : colors.mutedForeground;

  const content = (
    <>
      {state === 'saving' ? (
        <ActivityIndicator size="small" color={colors.mutedForeground} />
      ) : state === 'saved' ? (
        <Check size={14} color={tone} />
      ) : state === 'error' ? (
        <CloudOff size={14} color={tone} />
      ) : (
        <TriangleAlert size={14} color={tone} />
      )}
      <Text style={[styles.stateText, { color: tone }]}>{STATE_LABEL[state]}</Text>
    </>
  );

  if (!retryable) {
    return (
      <View accessibilityLiveRegion="polite" style={styles.state}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        state === 'too-long'
          ? 'Beleška je duža od 80.000 znakova — skrati je pa pokušaj ponovo'
          : 'Izmene nisu sačuvane. Pokušaj ponovo'
      }
      accessibilityLiveRegion="polite"
      onPress={onRetry}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => [styles.state, pressed && { opacity: 0.7 }]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleInput: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 6,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: fontWeight.bold,
  },
  state: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: 4,
  },
  stateText: {
    fontSize: 13,
    fontWeight: fontWeight.medium,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: radius.card,
  },
  noticeText: {
    flex: 1,
    ...text.body,
  },
  conflict: {
    gap: 6,
    margin: 12,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  conflictTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  conflictText: {
    ...text.body,
  },
  conflictActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  conflictBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  conflictBtnText: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
  },
  toolbarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  uploading: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  uploadingText: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
  },
});
