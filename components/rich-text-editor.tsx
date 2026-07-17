"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from "lucide-react";

import { cn } from "@/lib/utils";

type RichTextEditorProps = {
  content: string;
  documentKey: string;
  editable?: boolean;
  placeholder?: string;
  onChange: (value: { html: string; text: string }) => void;
};

type ToolbarAction = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: () => boolean;
  disabled?: () => boolean;
  run: () => void;
};

export function RichTextEditor({
  content,
  documentKey,
  editable = true,
  placeholder = "Zapiši kontekst, odluke i sledeće korake…",
  onChange,
}: RichTextEditorProps) {
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
    ],
    content,
    editorProps: {
      attributes: {
        class:
          "tiptap min-h-[42vh] w-full max-w-none px-1 pb-28 pt-4 text-[15px] leading-7 text-foreground outline-none sm:min-h-[52vh] sm:text-base",
        "aria-label": "Sadržaj stranice",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange({ html: currentEditor.getHTML(), text: currentEditor.getText() });
    },
  }, [documentKey]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editable, editor]);

  useEffect(() => {
    if (!editor) return;
    const nextContent = content || "<p></p>";
    if (editor.getHTML() !== nextContent) {
      editor
        .chain()
        .setMeta("addToHistory", false)
        .setContent(nextContent, { emitUpdate: false })
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
  ];

  return (
    <div className="relative">
      {editable ? (
        <div
          className="sticky top-0 z-10 -mx-2 flex min-h-12 items-center gap-0.5 overflow-x-auto border-y border-border/60 bg-background/90 px-2 py-1.5 backdrop-blur-xl [scrollbar-width:none] sm:rounded-xl sm:border sm:shadow-[0_8px_28px_-24px_rgba(15,23,42,0.7)]"
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
      <EditorContent editor={editor} />
    </div>
  );
}
