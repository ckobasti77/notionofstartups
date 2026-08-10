import {
  PlaceholderBridge,
  RichText,
  TenTapStartKit,
  useEditorBridge,
  type EditorBridge,
} from '@10play/tentap-editor';
import * as Clipboard from 'expo-clipboard';
import { useMutation } from 'convex/react';
import { Check, CloudOff, Copy, Info, RefreshCw, TriangleAlert } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import { NoteLinkSheet } from '@/components/stranica/note-link-sheet';
import { NoteReader } from '@/components/stranica/note-reader';
import { NoteToolbar, type LinkRequest } from '@/components/stranica/note-toolbar';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  EMPTY_NOTE_HTML,
  NOTE_CONTENT_LIMIT,
  noteContentEquals,
  noteEditorCss,
  noteHtmlToText,
  unsupportedNoteBlocks,
  unsupportedNoteBlocksSentence,
} from '@/lib/note-content';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, radius, type ColorTokens } from '@/theme/tokens';

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
 * OGRANIČENJE (svesno, zapisano u `docs/mobile/ZA-POPRAVKU.md` §2): unapred
 * izgrađen tentap bundle nema `table`, `codeBlock` ni naš `noteFile` čvor. Telo
 * koje ih sadrži bi se pri učitavanju u editor tiho osiromašilo, pa se takva
 * beleška otvara samo za čitanje (`NoteReader`) umesto da se pokvari.
 */

/** Koliko se čeka posle kucanja da se pročita HTML iz WebView-a (jedan most-poziv). */
const HTML_DEBOUNCE_MS = 250;
/** Dodatna pauza pre snimanja — zbir ≈ 700 ms, kao 650 ms na webu. */
const AUTOSAVE_DEBOUNCE_MS = 450;
/** Ponovni pokušaj posle neuspelog snimanja. */
const RETRY_MS = 5_000;
/** Posle ovoliko uzastopnih neuspeha se staje i traži se ručna potvrda. */
const MAX_AUTO_RETRIES = 4;

const NOTE_PLACEHOLDER = 'Zapiši kontekst, odluke i sledeće korake…';

/**
 * Placeholder MORA statički, pri inicijalizaciji editora: runtime
 * `setPlaceholder` samo upiše opciju u ekstenziju, a dekoracija se ne osveži do
 * prvog kucanja — prazna beleška bi večno pokazivala tentap-ov engleski default
 * (bag E5). Modulski `const`: nova referenca po renderu bi reinicijalizovala most.
 */
const NOTE_BRIDGES = TenTapStartKit.map((bridge) =>
  bridge === PlaceholderBridge
    ? PlaceholderBridge.configureExtension({ placeholder: NOTE_PLACEHOLDER })
    : bridge,
);

type SaveState =
  | 'saved'
  | 'dirty'
  | 'saving'
  | 'error'
  | 'conflict'
  | 'invalid'
  | 'too-long';

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

  const [title, setTitle] = useState(remoteTitle);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [linkRequest, setLinkRequest] = useState<LinkRequest | null>(null);

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
  const editorRef = useRef<EditorBridge | null>(null);
  const cssLoadedRef = useRef(false);
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

  // Telo koje mobilni editor ne ume da predstavi otvara se samo za čitanje.
  // Meri se nad TELOM KOJE JE EDITOR UČITAO (a to je zamrznuti `initialContent`),
  // ne nad živim upitom — inače bi tuđa izmena mogla da sruši editor usred kucanja.
  const unsupported = useMemo(
    () => unsupportedNoteBlocks(initialContent),
    [initialContent],
  );
  const bodyEditable = canEditBody && unsupported.length === 0;
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

  /** Čita sveži HTML iz WebView-a i, ako se razlikuje, zakazuje snimanje. */
  const pullHtml = useCallback(async () => {
    const editorInstance = editorRef.current;
    if (editorInstance === null) return;
    let html: string;
    try {
      html = await editorInstance.getHTML();
    } catch {
      // Most je pao (npr. WebView se upravo ruši) — sledeća izmena pokušava opet.
      return;
    }
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
  }, [markDirty, scheduleSave]);

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
    onChange: handleContentChange,
  });

  useEffect(() => {
    editorRef.current = editor;
  });

  const handleEditorLoad = useCallback(() => {
    cssLoadedRef.current = true;
    editorRef.current?.injectCSS(editorCss, 'devotion-note');
  }, [editorCss]);

  // Promena teme dok je editor otvoren — CSS se osvežava u mestu (isti tag).
  useEffect(() => {
    if (cssLoadedRef.current) editorRef.current?.injectCSS(editorCss, 'devotion-note');
  }, [editorCss]);

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

  const applyLink = useCallback(
    (href: string | null) => {
      const request = linkRequest;
      setLinkRequest(null);
      if (request === null) return;
      // Android gubi tiptap selekciju čim fokus ode iz WebView-a, pa se vraća
      // ručno; kratka pauza je da se sheet stigne skloniti (isto radi i tentap).
      setTimeout(() => {
        const editorInstance = editorRef.current;
        if (editorInstance === null) return;
        editorInstance.setSelection(request.selection.from, request.selection.to);
        editorInstance.setLink(href);
        editorInstance.focus();
      }, Platform.OS === 'android' ? 120 : 0);
    },
    [linkRequest],
  );

  const lockReason = !canEdit
    ? 'Sadržaj i naslov menja samo autor beleške.'
    : unsupported.length > 0
      ? `Ova beleška sadrži ${unsupportedNoteBlocksSentence(unsupported)} — to se za sada uređuje na webu. Ovde je prikaz veran originalu.`
      : !canEditBody
        ? 'Raniji zajednički sadržaj je zaključan. Naslov možeš da menjaš, telo se uređuje na webu kroz potpisani doprinos.'
        : null;

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

      {bodyEditable ? (
        <>
          <RichText editor={editor} onLoad={handleEditorLoad} />
          {/* NE `KeyboardAvoidingView`: ugnježden ovako duboko meša relativne i
              apsolutne koordinate i podigne traku ~40dp umesto pune visine
              tastature — traka završi ISPOD nje (E10). Pomak ide iz samog
              keyboard eventa; detalji u `use-keyboard-inset.ts`. */}
          <View
            style={[styles.toolbarWrap, { bottom: keyboardInset }]}
            pointerEvents="box-none">
            <NoteToolbar editor={editor} onRequestLink={setLinkRequest} />
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

      <NoteLinkSheet
        open={linkRequest !== null}
        initialHref={linkRequest?.href ?? ''}
        onSubmit={applyLink}
        onRemove={() => applyLink(null)}
        onClose={() => setLinkRequest(null)}
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
        : state === 'conflict' || state === 'invalid'
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
    fontSize: 14,
    lineHeight: 20,
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
    fontSize: 14,
    lineHeight: 20,
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
});
