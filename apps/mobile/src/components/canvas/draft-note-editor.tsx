import { RichText, useEditorBridge } from '@10play/tentap-editor';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import {
  NoteToolbar,
  type EditorSelection,
  type LinkRequest,
} from '@/components/stranica/note-toolbar';
import { EMPTY_NOTE_HTML, noteEditorCss } from '@/lib/note-content';
import { NOTE_BRIDGES, type NoteEditorBridge } from '@/lib/note-editor-bridges';
import { NOTE_EDITOR_HTML } from '@/lib/note-editor-html';
import { useThemeColors } from '@/theme/theme-provider';

/** Isti ritam čitanja HTML-a kao u pravom editoru (`note-editor.tsx`). */
const HTML_DEBOUNCE_MS = 250;
/** Rok za `getHTML` na zahtev — most ume da ćuti dok se WebView ne digne. */
const GET_HTML_TIMEOUT_MS = 600;

export type DraftNoteEditorHandle = {
  /** Sveže telo iz WebView-a; `null` kad most (još) ne odgovara. */
  getHTML: () => Promise<string | null>;
  applyLink: (selection: EditorSelection, href: string | null) => void;
  insertTable: (selection: EditorSelection) => void;
  insertTableContent: (
    selection: EditorSelection,
    matrix: string[][],
    firstRowIsHeader: boolean,
  ) => void;
  insertCodeBlock: (selection: EditorSelection) => void;
};

/**
 * PUN tentap editor za telo beleške PRE kreiranja (lanac 7, odluka korisnika):
 * isti bundle (`NOTE_EDITOR_HTML`), ista bridge lista i ista traka alata kao
 * `note-editor.tsx` — ali bez `pageId`-a, pa i bez autosave-a, revizija i
 * konflikt-protokola: telo živi u memoriji sheeta dok se stranica ne napravi.
 *
 * Sheet-ovi (link, „Dodaj u belešku") NISU ovde: u RN-u ugnježden `Modal` na
 * Androidu proguta `onRequestClose`, pa ih roditelj (`PageCreateSheet`) renderuje
 * kao braću i komande vraća kroz ref (isti obrazac kao `AssigneePickerSheet`).
 *
 * Traka alata stoji na `bottom: 0`: sheet već diže ceo panel iznad tastature
 * (`KeyboardAvoidingView` sa `padding` u `ui/sheet.tsx`), pa bi dodatni
 * `useKeyboardInset` pomak (obrazac ekrana beleške, E10) ovde udvostručio ofset.
 */
export const DraftNoteEditor = forwardRef<
  DraftNoteEditorHandle,
  {
    initialHtml: string;
    /** Debounced telo — roditelj ga čuva u ref-u za nacrt; ne renderuje na svako slovo. */
    onChangeHtml: (html: string) => void;
    onRequestLink: (request: LinkRequest) => void;
    onRequestInsert: (selection: EditorSelection) => void;
  }
>(function DraftNoteEditor({ initialHtml, onChangeHtml, onRequestLink, onRequestInsert }, ref) {
  const colors = useThemeColors();
  const editorRef = useRef<NoteEditorBridge | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeRef = useRef(onChangeHtml);
  changeRef.current = onChangeHtml;
  const cssLoadedRef = useRef(false);

  const editorTheme = useMemo(
    () => ({
      webview: { backgroundColor: colors.card },
      webviewContainer: { backgroundColor: colors.card },
    }),
    [colors.card],
  );
  // Bez donjeg inseta: editor je u sheet-u koji sam drži razmak od ivice.
  const editorCss = useMemo(() => noteEditorCss({ colors, bottomInset: 0 }), [colors]);

  const pullHtml = useCallback(async () => {
    const html = await editorRef.current?.getHTML().catch(() => null);
    if (typeof html === 'string') changeRef.current(html);
  }, []);

  const handleContentChange = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void pullHtml();
    }, HTML_DEBOUNCE_MS);
  }, [pullHtml]);

  const editor = useEditorBridge({
    initialContent: initialHtml || EMPTY_NOTE_HTML,
    autofocus: false,
    avoidIosKeyboard: true,
    editable: true,
    theme: editorTheme,
    bridgeExtensions: NOTE_BRIDGES,
    // Naš bundle — jedini sa tabelom, blok koda, `<hr>` i `noteFile` u šemi.
    customSource: NOTE_EDITOR_HTML,
    onChange: handleContentChange,
  }) as NoteEditorBridge;

  useEffect(() => {
    editorRef.current = editor;
  });

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleLoad = useCallback(() => {
    cssLoadedRef.current = true;
    editorRef.current?.injectCSS(editorCss, 'devotion-note');
  }, [editorCss]);

  // Promena teme dok je editor otvoren — CSS se osvežava u mestu (isti tag).
  useEffect(() => {
    if (cssLoadedRef.current) editorRef.current?.injectCSS(editorCss, 'devotion-note');
  }, [editorCss]);

  /**
   * Vraća zapamćenu selekciju pa izvršava komandu — Android gubi tiptap
   * selekciju čim fokus ode iz WebView-a (isti obrazac kao `note-editor.tsx`).
   */
  const runAtSelection = useCallback(
    (selection: EditorSelection, command: (instance: NoteEditorBridge) => void) => {
      setTimeout(
        () => {
          const instance = editorRef.current;
          if (instance === null) return;
          instance.setSelection(selection.from, selection.to);
          command(instance);
          instance.focus();
        },
        Platform.OS === 'android' ? 120 : 0,
      );
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      getHTML: async () => {
        const html = await Promise.race([
          editorRef.current?.getHTML() ?? Promise.resolve(null),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), GET_HTML_TIMEOUT_MS)),
        ]).catch(() => null);
        return typeof html === 'string' ? html : null;
      },
      applyLink: (selection, href) =>
        runAtSelection(selection, (instance) => instance.setLink(href)),
      insertTable: (selection) =>
        runAtSelection(selection, (instance) => instance.insertNoteTable()),
      insertTableContent: (selection, matrix, firstRowIsHeader) =>
        runAtSelection(selection, (instance) =>
          instance.insertNoteTableContent(matrix, firstRowIsHeader),
        ),
      insertCodeBlock: (selection) =>
        runAtSelection(selection, (instance) => instance.toggleNoteCodeBlock()),
    }),
    [runAtSelection],
  );

  return (
    <View style={styles.container}>
      <RichText editor={editor} onLoad={handleLoad} />
      <View style={styles.toolbarWrap} pointerEvents="box-none">
        <NoteToolbar
          editor={editor}
          onRequestLink={onRequestLink}
          onRequestInsert={onRequestInsert}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
