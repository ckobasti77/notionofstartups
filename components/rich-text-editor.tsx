"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import {
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Bold,
  Code2,
  FileSpreadsheet,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  LoaderCircle,
  PanelTop,
  Paperclip,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  TableColumnsSplit,
  TableRowsSplit,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { NoteFile } from "@/components/workspace/files/note-file-node";
import { NoteTableImportDialog } from "@/components/workspace/tables/note-table-import-dialog";
import type { AttachedPageFile } from "@/lib/page-files";
import { noteTableContent } from "@/lib/table-file";
import { cn } from "@/lib/utils";

type RichTextEditorProps = {
  content: string;
  documentKey: string;
  editable?: boolean;
  placeholder?: string;
  onChange: (value: { html: string; text: string }) => void;
  /**
   * Kad postoji, editor nudi upload priloga (toolbar, prevlačenje, paste).
   * Bez njega (npr. beleška koja još nije kreirana) upload UI se ne prikazuje,
   * a nalepljeni tuđi prilozi se prikazuju kao nedostupni.
   */
  attachments?: {
    upload: (file: File) => Promise<AttachedPageFile | null>;
  };
};

type ToolbarAction = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: () => boolean;
  disabled?: () => boolean;
  run: () => void;
};

/** Paste iz clipboard-a stiže kao generičko `image.png` — ime dobija vreme. */
function withReadableName(file: File) {
  if (!/^image\.(png|jpe?g|gif|webp)$/i.test(file.name)) return file;
  const stamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace("T", " ")
    .replace(/:/g, "-");
  const extension = file.name.split(".").pop() ?? "png";
  return new File([file], `slika ${stamp}.${extension}`, { type: file.type });
}

export function RichTextEditor({
  content,
  documentKey,
  editable = true,
  placeholder = "Zapiši kontekst, odluke i sledeće korake…",
  onChange,
  attachments,
}: RichTextEditorProps) {
  // `useEditor` sa dependencima ne osvežava opcije pri re-renderu, pa svaki
  // handler u `editorProps` mora da čita sveže vrednosti kroz ref.
  const attachmentsRef = useRef(attachments);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);
  const editorRef = useRef<Editor | null>(null);
  // Za otvaranje skrivenih inputa se ne koriste refovi — toolbar akcije nastaju
  // tokom rendera, a `react-hooks/refs` tu zabranjuje zatvaranje nad refom.
  const imageInputId = useId();
  const fileInputId = useId();
  const [pendingUploads, setPendingUploads] = useState(0);
  const [tableImportOpen, setTableImportOpen] = useState(false);

  /**
   * Šalje fajlove redom i ubacuje `noteFile` blok po završetku svakog (v1 bez
   * placeholder-a u tekstu). `dropPos` je pozicija iz prevlačenja; bez nje se
   * ubacuje na trenutnu selekciju. Greške toast-uje sam upload.
   */
  const insertFiles = useCallback(async (files: File[], dropPos?: number) => {
    const upload = attachmentsRef.current?.upload;
    if (upload === undefined || files.length === 0) return;
    let insertAt = dropPos;
    for (const original of files) {
      setPendingUploads((count) => count + 1);
      try {
        const attrs = await upload(withReadableName(original));
        if (attrs === null) continue;
        const currentEditor = editorRef.current;
        if (currentEditor === null || currentEditor.isDestroyed) return;
        const node = {
          type: "noteFile",
          attrs: {
            fileId: attrs.fileId,
            category: attrs.category,
            name: attrs.name,
            size: attrs.size,
          },
        };
        if (insertAt !== undefined) {
          const at = Math.min(insertAt, currentEditor.state.doc.content.size);
          currentEditor.chain().focus().insertContentAt(at, node).run();
          insertAt = at + 1;
        } else {
          currentEditor.chain().focus().insertContent(node).run();
        }
      } finally {
        setPendingUploads((count) => count - 1);
      }
    }
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
      NoteFile,
      TableKit.configure({ table: { resizable: true } }),
    ],
    content,
    editorProps: {
      attributes: {
        class:
          "tiptap min-h-[42vh] w-full max-w-none px-1 pb-28 pt-4 text-[15px] leading-7 text-foreground outline-none sm:min-h-[52vh] sm:text-base",
        "aria-label": "Sadržaj stranice",
      },
      handleDrop: (view, event, _slice, moved) => {
        // `moved` je interno premeštanje postojećeg bloka — to radi ProseMirror.
        if (moved || !view.editable) return false;
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length === 0) return false;
        event.preventDefault();
        if (attachmentsRef.current === undefined) {
          toast.error("Fajlovi mogu da se dodaju tek kad stranica bude kreirana.");
          return true;
        }
        const coords = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        void insertFiles(files, coords?.pos ?? view.state.selection.from);
        return true;
      },
      handlePaste: (view, event) => {
        if (!view.editable || attachmentsRef.current === undefined) return false;
        const data = event.clipboardData;
        const files = Array.from(data?.files ?? []);
        // Bogat sadržaj (npr. iz Word-a) nosi i HTML i sliku — tekst ima prednost.
        if (files.length === 0 || (data?.types.includes("text/html") ?? false)) {
          return false;
        }
        event.preventDefault();
        void insertFiles(files);
        return true;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange({ html: currentEditor.getHTML(), text: currentEditor.getText() });
    },
  }, [documentKey]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    // Changing permissions is not a content edit. Tiptap emits an `update`
    // event by default here, which can leave read-only pages permanently dirty.
    editor.setEditable(editable, false);
  }, [editable, editor]);

  useEffect(() => {
    if (!editor) return;
    const nextContent = content || "<p></p>";
    if (editor.getHTML() !== nextContent) {
      editor
        .chain()
        .setMeta("addToHistory", false)
        .setContent(nextContent, { emitUpdate: false })
        // `setContent` ostavlja selekciju na kraju; kad telo završava atomom
        // (prilog), to je NodeSelection koju bi prvi sledeći unos zamenio.
        .setTextSelection(0)
        .run();
    }
  }, [content, documentKey, editor]);

  if (!editor) {
    return <div className="h-[42vh] animate-pulse rounded-2xl bg-muted/35" />;
  }

  const actions: Array<ToolbarAction | "separator"> = [
    {
      label: "Podebljano",
      icon: Bold,
      active: () => editor.isActive("bold"),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: "Kurziv",
      icon: Italic,
      active: () => editor.isActive("italic"),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "Precrtano",
      icon: Strikethrough,
      active: () => editor.isActive("strike"),
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: "Kod",
      icon: Code2,
      active: () => editor.isActive("code"),
      run: () => editor.chain().focus().toggleCode().run(),
    },
    "separator",
    {
      label: "Naslov 1",
      icon: Heading1,
      active: () => editor.isActive("heading", { level: 1 }),
      run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: "Naslov 2",
      icon: Heading2,
      active: () => editor.isActive("heading", { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "Lista",
      icon: List,
      active: () => editor.isActive("bulletList"),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numerisana lista",
      icon: ListOrdered,
      active: () => editor.isActive("orderedList"),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Checklist",
      icon: ListChecks,
      active: () => editor.isActive("taskList"),
      run: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      label: "Citat",
      icon: Quote,
      active: () => editor.isActive("blockquote"),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    "separator",
  ];

  if (attachments !== undefined) {
    actions.push(
      {
        label: "Dodaj sliku",
        icon: ImagePlus,
        run: () => document.getElementById(imageInputId)?.click(),
      },
      {
        label: "Priloži fajl",
        icon: Paperclip,
        run: () => document.getElementById(fileInputId)?.click(),
      },
    );
  }
  actions.push(
    {
      label: "Ubaci tabelu",
      icon: Table2,
      // Tabela u tabeli pravi nečitljiv sadržaj — unutar tabele se ne nudi.
      disabled: () => editor.isActive("table"),
      run: () =>
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
    {
      label: "Uvezi tabelu (CSV/XLSX)",
      icon: FileSpreadsheet,
      disabled: () => editor.isActive("table"),
      run: () => setTableImportOpen(true),
    },
  );

  if (editor.isActive("table")) {
    actions.push(
      "separator",
      {
        label: "Dodaj red",
        icon: BetweenHorizontalEnd,
        run: () => editor.chain().focus().addRowAfter().run(),
      },
      {
        label: "Obriši red",
        icon: TableRowsSplit,
        run: () => editor.chain().focus().deleteRow().run(),
      },
      {
        label: "Dodaj kolonu",
        icon: BetweenVerticalEnd,
        run: () => editor.chain().focus().addColumnAfter().run(),
      },
      {
        label: "Obriši kolonu",
        icon: TableColumnsSplit,
        run: () => editor.chain().focus().deleteColumn().run(),
      },
      {
        label: "Red zaglavlja",
        icon: PanelTop,
        run: () => editor.chain().focus().toggleHeaderRow().run(),
      },
      {
        label: "Obriši tabelu",
        icon: Trash2,
        run: () => editor.chain().focus().deleteTable().run(),
      },
    );
  }

  actions.push(
    "separator",
    {
      label: "Poništi",
      icon: Undo2,
      disabled: () => !editor.can().chain().focus().undo().run(),
      run: () => editor.chain().focus().undo().run(),
    },
    {
      label: "Ponovi",
      icon: Redo2,
      disabled: () => !editor.can().chain().focus().redo().run(),
      run: () => editor.chain().focus().redo().run(),
    },
  );

  return (
    <div className="relative">
      {editable ? (
        <div
          className="sticky top-0 z-10 -mx-2 flex min-h-12 flex-wrap items-center gap-0.5 overflow-visible border-y border-border/60 bg-background/90 px-2 py-1.5 backdrop-blur-xl sm:flex-nowrap sm:overflow-x-auto sm:rounded-xl sm:border sm:shadow-[0_8px_28px_-24px_rgba(15,23,42,0.7)] sm:[scrollbar-width:thin]"
          role="toolbar"
          aria-label="Alati za uređivanje"
        >
          {actions.map((action, index) => {
            if (action === "separator") {
              return <span key={`separator-${index}`} className="mx-1 h-5 w-px shrink-0 bg-border" />;
            }

            const Icon = action.icon;
            const isActive = action.active?.() ?? false;
            return (
              <button
                key={action.label}
                type="button"
                title={action.label}
                aria-label={action.label}
                aria-pressed={action.active ? isActive : undefined}
                disabled={action.disabled?.()}
                onClick={action.run}
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35",
                  isActive && "bg-primary/10 text-primary",
                )}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
        </div>
      ) : null}
      {editable && attachments !== undefined ? (
        <>
          <input
            id={imageInputId}
            type="file"
            accept="image/*"
            multiple
            tabIndex={-1}
            className="sr-only"
            aria-label="Izbor slika za belešku"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void insertFiles(files);
            }}
          />
          <input
            id={fileInputId}
            type="file"
            multiple
            tabIndex={-1}
            className="sr-only"
            aria-label="Izbor fajlova za belešku"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void insertFiles(files);
            }}
          />
        </>
      ) : null}
      <EditorContent editor={editor} />
      {pendingUploads > 0 ? (
        <div
          className="pointer-events-none absolute bottom-4 right-2 z-20 flex items-center gap-2 rounded-full border border-border/70 bg-background/95 px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-lg backdrop-blur"
          role="status"
          aria-live="polite"
        >
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
          Otpremanje…
        </div>
      ) : null}
      <NoteTableImportDialog
        open={tableImportOpen}
        onOpenChange={setTableImportOpen}
        getBodyLength={() => editorRef.current?.getHTML().length ?? 0}
        onImport={(matrix, firstRowIsHeader) => {
          editorRef.current
            ?.chain()
            .focus()
            .insertContent(noteTableContent(matrix, firstRowIsHeader))
            .run();
        }}
      />
    </div>
  );
}
