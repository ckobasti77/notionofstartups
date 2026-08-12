/**
 * Lista tentap bridge-ova za editor beleške — **jedan izvor istine za dva sveta**.
 *
 * Ovaj modul troše DVA potrošača:
 *  1. native strana — `components/stranica/note-editor.tsx` (`bridgeExtensions`),
 *  2. web bundle koji se izvršava u WebView-u — `apps/mobile/editor-web/index.ts`.
 *
 * Zašto baš tako: `useTenTap` na web strani odbacuje svaki bridge koji nije u
 * `window.bridgeExtensionConfigMap` (`webEditorUtils/useTenTap.tsx:51-52`), a tu
 * mapu native pravi iz SVOJE liste. Da se dve liste raziđu, ekstenzija bi tiho
 * nestala iz Tiptap šeme i telo beleške bi se pri prvom snimanju osiromašilo.
 * Zato lista postoji jednom.
 *
 * Šema mora da bude ista kao web (`apps/web/components/rich-text-editor.tsx:177`).
 * `TenTapStartKit` sam po sebi nema `table`, `codeBlock`, `horizontalRule` ni naš
 * `noteFile` čvor — ta četiri su ovde dodata.
 */
import {
  BridgeExtension,
  PlaceholderBridge,
  TenTapStartKit,
  type BridgeState,
  type EditorBridge,
} from '@10play/tentap-editor';
import { mergeAttributes, Node, type Editor } from '@tiptap/core';
import { CodeBlock } from '@tiptap/extension-code-block';
import { HorizontalRule } from '@tiptap/extension-horizontal-rule';
import { TableKit } from '@tiptap/extension-table';
import { Gapcursor, TrailingNode } from '@tiptap/extensions';

import { noteTableContent } from '@/lib/note-table';

/**
 * Placeholder MORA statički, pri inicijalizaciji editora: runtime
 * `setPlaceholder` samo upiše opciju u ekstenziju, a dekoracija se ne osveži do
 * prvog kucanja — prazna beleška bi večno pokazivala tentap-ov engleski default
 * (bag E5).
 *
 * BEZ APOSTROFA u tekstu: konfiguracija ide kroz `JSON.stringify` pa se umeće
 * unutar JEDNOSTRUKIH navodnika (`RichText/utils.ts:63`) — apostrof bi razbio
 * injektovani JS i editor bi ostao prazan.
 */
const NOTE_PLACEHOLDER = 'Zapiši kontekst, odluke i sledeće korake…';

/* ------------------------------------------------------------------ *
 * `noteFile` čvor — doslovna kopija serijalizacije sa weba
 * (`apps/web/components/workspace/files/note-file-node.tsx:224-274`).
 * Web verzija koristi `ReactNodeViewRenderer`; ovde je node view plain DOM
 * (u WebView-u nema React stabla naše aplikacije). Node view NE utiče na
 * serijalizaciju — `getHTML` ide kroz `renderHTML`, pa je round-trip identičan.
 * ------------------------------------------------------------------ */

const KNOWN_FILE_CATEGORIES = new Set([
  'image',
  'video',
  'pdf',
  'audio',
  'sheet',
  'document',
]);

function parseFileCategory(value: string | null): string | null {
  return value !== null && KNOWN_FILE_CATEGORIES.has(value) ? value : null;
}

/**
 * `fileId → potpisani URL`. URL NIKAD ne ulazi u dokument (isto pravilo kao na
 * webu) — stiže porukom `set-note-file-urls` i živi samo u prikazu.
 */
let noteFileUrls: Record<string, string> = {};
/** Ime DOM događaja kojim se već montirani prikazi osvežavaju kad stignu URL-ovi. */
const NOTE_FILE_URLS_EVENT = 'devotion:note-file-urls';

/** Veličina fajla u čitljiv oblik — port `apps/web/lib/page-kinds.ts#formatFileSize`. */
function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export const NoteFile = Node.create({
  name: 'noteFile',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      fileId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-file-id'),
        renderHTML: (attrs: { fileId?: string | null }) =>
          attrs.fileId ? { 'data-file-id': attrs.fileId } : {},
      },
      category: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          parseFileCategory(element.getAttribute('data-category')),
        renderHTML: (attrs: { category?: string | null }) =>
          attrs.category ? { 'data-category': attrs.category } : {},
      },
      name: {
        default: '',
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-name') ?? element.textContent ?? '',
        renderHTML: (attrs: { name?: string }) => ({ 'data-name': attrs.name ?? '' }),
      },
      size: {
        default: 0,
        parseHTML: (element: HTMLElement) =>
          Number(element.getAttribute('data-size')) || 0,
        renderHTML: (attrs: { size?: number }) => ({
          'data-size': String(attrs.size ?? 0),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-note-file]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes({ 'data-note-file': '' }, HTMLAttributes),
      String(node.attrs.name ?? ''),
    ];
  },

  /**
   * Prikaz u editoru (samo WebView; na native strani se ovo nikad ne izvršava —
   * tamo se od ekstenzije čita isključivo `name`). Slika se vidi kao slika, sve
   * ostalo kao čip „📎 ime". Stil je u `noteEditorCss`, da prati temu.
   */
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.setAttribute('data-note-file-view', '');
      let current = node;

      const render = () => {
        const fileId =
          typeof current.attrs.fileId === 'string' ? current.attrs.fileId : null;
        const name = String(current.attrs.name ?? '');
        const url = fileId === null ? undefined : noteFileUrls[fileId];
        dom.replaceChildren();
        if (current.attrs.category === 'image' && url !== undefined) {
          const image = document.createElement('img');
          image.src = url;
          image.alt = name;
          dom.appendChild(image);
          return;
        }
        const chip = document.createElement('span');
        chip.setAttribute('data-note-file-chip', '');
        const size = formatBytes(Number(current.attrs.size ?? 0));
        chip.textContent = size === '' ? `📎 ${name}` : `📎 ${name} · ${size}`;
        dom.appendChild(chip);
      };

      render();
      const refresh = () => render();
      document.addEventListener(NOTE_FILE_URLS_EVENT, refresh);

      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== 'noteFile') return false;
          current = updated;
          render();
          return true;
        },
        // Node view sam menja svoj DOM; bez ovoga ProseMirror svaku izmenu
        // prikaza čita kao korisnikov unos i pokušava da je vrati u dokument.
        ignoreMutation: () => true,
        destroy: () => document.removeEventListener(NOTE_FILE_URLS_EVENT, refresh),
      };
    };
  },
});

/* ------------------------------------------------------------------ *
 * Tabela
 * ------------------------------------------------------------------ */

export type NoteTableState = {
  isTableActive: boolean;
  canInsertTable: boolean;
};

export type NoteTableInstance = {
  insertNoteTable: () => void;
  addNoteTableRow: () => void;
  deleteNoteTableRow: () => void;
  addNoteTableColumn: () => void;
  deleteNoteTableColumn: () => void;
  toggleNoteTableHeaderRow: () => void;
  deleteNoteTable: () => void;
  /** Uvoz CSV/XLSX: gotova matrica se ubacuje kao jedan Tiptap čvor. */
  insertNoteTableContent: (matrix: string[][], firstRowIsHeader: boolean) => void;
};

type NoteTableMessage =
  | {
      type:
        | 'note-insert-table'
        | 'note-add-row-after'
        | 'note-delete-row'
        | 'note-add-column-after'
        | 'note-delete-column'
        | 'note-toggle-header-row'
        | 'note-delete-table';
      payload?: undefined;
    }
  | {
      type: 'note-insert-table-content';
      payload: { matrix: string[][]; firstRowIsHeader: boolean };
    };

const NEW_TABLE = { rows: 3, cols: 3, withHeaderRow: true } as const;

export const NoteTableBridge = new BridgeExtension<
  NoteTableState,
  NoteTableInstance,
  NoteTableMessage
>({
  // `resizable: true` je zbog IDENTIČNE serijalizacije sa webom. `Table.renderHTML`
  // svejedno uvek piše `<colgroup>`, ali podešavanje se ne razlikuje bez razloga.
  // Povlačenje ivice kolone prstom se NE nudi (ručka od par piksela je promašaj) —
  // isto obrazloženje kao `nodesConnectable: false` u `00-PLAN.md` §5.2.
  tiptapExtension: TableKit.configure({ table: { resizable: true } }),
  // Bez `gapcursor` kursor ne može da stane ispred/iza tabele na početku ili
  // kraju dokumenta — tabela postane zamka iz koje se ne izlazi.
  tiptapExtensionDeps: [Gapcursor],
  onBridgeMessage: (editor, message) => {
    switch (message.type) {
      case 'note-insert-table':
        editor.chain().focus().insertTable(NEW_TABLE).run();
        break;
      case 'note-add-row-after':
        editor.chain().focus().addRowAfter().run();
        break;
      case 'note-delete-row':
        editor.chain().focus().deleteRow().run();
        break;
      case 'note-add-column-after':
        editor.chain().focus().addColumnAfter().run();
        break;
      case 'note-delete-column':
        editor.chain().focus().deleteColumn().run();
        break;
      case 'note-toggle-header-row':
        editor.chain().focus().toggleHeaderRow().run();
        break;
      case 'note-delete-table':
        editor.chain().focus().deleteTable().run();
        break;
      case 'note-insert-table-content':
        editor
          .chain()
          .focus()
          .insertContent(
            noteTableContent(
              message.payload.matrix,
              message.payload.firstRowIsHeader,
            ),
          )
          .run();
        break;
      default:
        break;
    }
    return false;
  },
  extendEditorInstance: (sendBridgeMessage) => ({
    insertNoteTable: () => sendBridgeMessage({ type: 'note-insert-table' }),
    insertNoteTableContent: (matrix: string[][], firstRowIsHeader: boolean) =>
      sendBridgeMessage({
        type: 'note-insert-table-content',
        payload: { matrix, firstRowIsHeader },
      }),
    addNoteTableRow: () => sendBridgeMessage({ type: 'note-add-row-after' }),
    deleteNoteTableRow: () => sendBridgeMessage({ type: 'note-delete-row' }),
    addNoteTableColumn: () => sendBridgeMessage({ type: 'note-add-column-after' }),
    deleteNoteTableColumn: () => sendBridgeMessage({ type: 'note-delete-column' }),
    toggleNoteTableHeaderRow: () =>
      sendBridgeMessage({ type: 'note-toggle-header-row' }),
    deleteNoteTable: () => sendBridgeMessage({ type: 'note-delete-table' }),
  }),
  extendEditorState: (editor: Editor) => {
    const isTableActive = editor.isActive('table');
    return {
      isTableActive,
      // Tabela u tabeli pravi nečitljiv sadržaj — isto pravilo kao web
      // (`rich-text-editor.tsx:420`).
      canInsertTable: !isTableActive && editor.can().insertTable(NEW_TABLE),
    };
  },
});

/* ------------------------------------------------------------------ *
 * Blok koda
 * ------------------------------------------------------------------ */

export type NoteCodeBlockState = {
  isCodeBlockActive: boolean;
  canToggleCodeBlock: boolean;
};

export type NoteCodeBlockInstance = {
  toggleNoteCodeBlock: () => void;
};

type NoteCodeBlockMessage = {
  type: 'note-toggle-code-block';
  payload?: undefined;
};

export const NoteCodeBlockBridge = new BridgeExtension<
  NoteCodeBlockState,
  NoteCodeBlockInstance,
  NoteCodeBlockMessage
>({
  tiptapExtension: CodeBlock,
  onBridgeMessage: (editor, message) => {
    if (message.type === 'note-toggle-code-block') {
      editor.chain().focus().toggleCodeBlock().run();
    }
    return false;
  },
  extendEditorInstance: (sendBridgeMessage) => ({
    toggleNoteCodeBlock: () => sendBridgeMessage({ type: 'note-toggle-code-block' }),
  }),
  extendEditorState: (editor: Editor) => ({
    isCodeBlockActive: editor.isActive('codeBlock'),
    canToggleCodeBlock: editor.can().toggleCodeBlock(),
  }),
});

/* ------------------------------------------------------------------ *
 * Prilog (`noteFile`) + `horizontalRule` + `trailingNode`
 * ------------------------------------------------------------------ */

export type NoteFileAttrs = {
  fileId: string;
  category: string;
  name: string;
  size: number;
};

export type NoteFileInstance = {
  insertNoteFile: (attrs: NoteFileAttrs) => void;
  /** `fileId → URL`; samo prikaz, u dokument ne ulazi. */
  setNoteFileUrls: (urls: Record<string, string>) => void;
};

type NoteFileMessage =
  | { type: 'note-insert-file'; payload: NoteFileAttrs }
  | { type: 'note-set-file-urls'; payload: Record<string, string> };

export const NoteFileBridge = new BridgeExtension<
  Record<string, never>,
  NoteFileInstance,
  NoteFileMessage
>({
  tiptapExtension: NoteFile,
  // `horizontalRule` je u web šemi kroz StarterKit — bez njega bi `<hr>` iz
  // postojećeg tela nestao pri prvom snimanju sa telefona. `trailingNode` je
  // takođe web ponašanje (prazan pasus posle atoma), i nema svoju šemu.
  tiptapExtensionDeps: [HorizontalRule, TrailingNode],
  onBridgeMessage: (editor, message) => {
    if (message.type === 'note-insert-file') {
      editor
        .chain()
        .focus()
        .insertContent({ type: 'noteFile', attrs: message.payload })
        .run();
    }
    if (message.type === 'note-set-file-urls') {
      noteFileUrls = message.payload;
      document.dispatchEvent(new Event(NOTE_FILE_URLS_EVENT));
    }
    return false;
  },
  extendEditorInstance: (sendBridgeMessage) => ({
    insertNoteFile: (attrs: NoteFileAttrs) =>
      sendBridgeMessage({ type: 'note-insert-file', payload: attrs }),
    setNoteFileUrls: (urls: Record<string, string>) =>
      sendBridgeMessage({ type: 'note-set-file-urls', payload: urls }),
  }),
  extendEditorState: () => ({}),
});

/* ------------------------------------------------------------------ *
 * Lista
 * ------------------------------------------------------------------ */

/**
 * Modulski `const`: nova referenca po renderu bi reinicijalizovala most (Z1).
 *
 * `ImageBridge` OSTAJE u listi iako se `setImage` nigde ne izlaže — u zatečenim
 * telima može da postoji `<img>`, pa je bolje da ga mobilni sačuva. Slika se
 * ubacuje kao `noteFile` (upload u `pageFiles`), tačno kao na webu; base64 `<img>`
 * bi web obrisao pri prvom snimanju sa laptopa, jer web nema Image ekstenziju.
 */
export const NOTE_BRIDGES = [
  ...TenTapStartKit.map((bridge) =>
    bridge === PlaceholderBridge
      ? PlaceholderBridge.configureExtension({ placeholder: NOTE_PLACEHOLDER })
      : bridge,
  ),
  NoteTableBridge,
  NoteCodeBlockBridge,
  NoteFileBridge,
];

/**
 * Tentap svoje bridge-ove upisuje u `EditorBridge`/`BridgeState` kroz
 * `declare module` iz UNUTRAŠNJOSTI paketa. Spolja se ta augmentacija ne
 * primenjuje pouzdano (interfejsi su u `types/EditorBridge`, a paket ih samo
 * re-eksportuje), pa se naši dodaci spajaju eksplicitno. Cast na jednom mestu je
 * iskreniji od augmentacije koja se tiho ne primeni.
 */
export type NoteBridgeState = NoteTableState & NoteCodeBlockState;
export type NoteBridgeInstance = NoteTableInstance &
  NoteCodeBlockInstance &
  NoteFileInstance;

/** Ono što `useEditorBridge({ bridgeExtensions: NOTE_BRIDGES })` stvarno vraća. */
export type NoteEditorBridge = EditorBridge & NoteBridgeInstance;
/** Ono što `useBridgeState(editor)` stvarno vraća. */
export type NoteEditorState = BridgeState & NoteBridgeState;
