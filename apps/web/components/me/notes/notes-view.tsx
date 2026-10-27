"use client";

import { useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { ChevronDown, LoaderCircle, Map as MapIcon, NotebookPen, Plus, Search, TriangleAlert, X } from "lucide-react";
import {
  cleanNoteText,
  NOTE_SEARCH_LIMIT,
  NOTE_TEXT_MAX,
  notesCountLabel,
  notesEmptyText,
  noteScopeLabel,
  sameNoteFilter,
  type NoteEditPatch,
  type NoteFilter,
  type NoteRow as NoteRowModel,
} from "@devotion/shared";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/workspace/workspace-ui";
import { cn } from "@/lib/utils";

import { StartupChip } from "../startup-chip";
import { NoteRow, type NoteItemModel, type NoteStartup } from "./note-row";
import { NotesSkeleton } from "./notes-skeleton";

export type NotesListState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | {
      status: "ready";
      rows: ReadonlyArray<NoteRowModel<NoteItemModel>>;
      canLoadMore: boolean;
      loadingMore: boolean;
      onLoadMore: () => void;
    };

export type NotesViewProps = {
  now: number;
  startups: ReadonlyArray<NoteStartup>;
  filter: NoteFilter;
  onFilterChange: (filter: NoteFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  /** Pretraga je u toku (dovoljno znakova): lista je ravna, bez uvlačenja. */
  searching: boolean;
  list: NotesListState;
  expandedId: string | null;
  onToggle: (id: string) => void;
  /** Brzi unos: `startupId === null` = Lično. Greška (poruka) se prikazuje ispod polja. */
  onQuickAdd: (startupId: string | null, text: string) => Promise<void>;
  onSave: (note: NoteItemModel, patch: NoteEditPatch) => Promise<void>;
  onArchive: (note: NoteItemModel) => void;
  onSend: (note: NoteItemModel) => void;
  /** Mapa beleški izabranog startupa; odsutno kad filter nije jedan startup. */
  onOpenMap?: () => void;
  /** Najava za čitač ekrana (npr. „Beleška je arhivirana."). */
  announcement?: string;
  /** Izlog: početni tekst brzog unosa i greška. */
  initialQuickText?: string;
  initialQuickError?: string | null;
  listRef?: RefObject<HTMLDivElement | null>;
};

const chipClass =
  "relative inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11";

/**
 * Beleške u „Ja" (PROSTOR P7, K07 §5.10): moje misli iz svih startupa i lične
 * na jednom mestu — brzi unos, filter Sve · Lično · startupi, pretraga, redovi
 * koji se otvaraju u mestu i „Pošalji u startup". Prezentacija: podaci i radnje
 * kroz props (izlog je prikazuje bez prijave).
 */
export function NotesView({
  now,
  startups,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  searching,
  list,
  expandedId,
  onToggle,
  onQuickAdd,
  onSave,
  onArchive,
  onSend,
  onOpenMap,
  announcement = "",
  initialQuickText,
  initialQuickError,
  listRef,
}: NotesViewProps) {
  const ownListRef = useRef<HTMLDivElement>(null);
  const scopeRef = listRef ?? ownListRef;
  const quickRef = useRef<HTMLTextAreaElement>(null);
  const selectedStartup = filter.kind === "startup" ? startups.find((item) => item._id === filter.startupId) : undefined;
  const count = list.status === "ready" ? list.rows.length : null;
  const more = list.status === "ready" && (list.canLoadMore || list.loadingMore);
  const hasSearchText = search.trim().length > 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-7 lg:px-8 lg:py-8">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <header data-workspace-enter className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h1 className="text-xl font-semibold tracking-[-0.02em] lg:text-2xl">Beleške</h1>
            {count !== null && count > 0 && !searching ? (
              <p className="text-sm text-muted-foreground">{notesCountLabel(count, more)}</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onOpenMap ? (
            <Button type="button" variant="outline" onClick={onOpenMap}>
              <MapIcon aria-hidden="true" /> Mapa
            </Button>
          ) : null}
          <Button type="button" onClick={() => quickRef.current?.focus()}>
            <Plus aria-hidden="true" /> Nova beleška
          </Button>
        </div>
      </header>

      <QuickNote
        quickRef={quickRef}
        startups={startups}
        defaultStartupId={selectedStartup?._id ?? null}
        onSubmit={onQuickAdd}
        initialText={initialQuickText}
        initialError={initialQuickError}
      />

      <div className="mt-4 space-y-2">
        <div
          role="group"
          aria-label="Filter beležaka"
          className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 py-1"
        >
          <FilterChip active={filter.kind === "all"} onClick={() => onFilterChange({ kind: "all" })}>
            Sve
          </FilterChip>
          <FilterChip
            active={filter.kind === "personal"}
            onClick={() => onFilterChange({ kind: "personal" })}
            leading={<StartupChip startup={null} size="xs" />}
          >
            Lično
          </FilterChip>
          {startups.map((startup) => (
            <FilterChip
              key={startup._id}
              active={sameNoteFilter(filter, { kind: "startup", startupId: startup._id })}
              onClick={() => onFilterChange({ kind: "startup", startupId: startup._id })}
              leading={<StartupChip startup={startup} size="xs" />}
            >
              <span className="max-w-32 truncate">{startup.name}</span>
            </FilterChip>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && hasSearchText) {
                event.stopPropagation();
                onSearchChange("");
              }
            }}
            placeholder="Pretraži beleške…"
            aria-label="Pretraži beleške"
            autoComplete="off"
            className="h-9 pl-9 pr-9 pointer-coarse:h-11"
          />
          {hasSearchText ? (
            <button
              type="button"
              aria-label="Obriši pretragu"
              onClick={() => onSearchChange("")}
              className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-11"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div ref={scopeRef} className="mt-3">
        <div data-workspace-enter>
          {list.status === "loading" ? (
            <NotesSkeleton />
          ) : list.status === "error" ? (
            <EmptyState
              headingAs="h2"
              icon={TriangleAlert}
              title="Beleške se ne mogu učitati"
              description="Proveri vezu i pokušaj ponovo."
              action={
                <Button type="button" variant="outline" className="mt-4" onClick={list.retry}>
                  Pokušaj ponovo
                </Button>
              }
            />
          ) : list.rows.length === 0 ? (
            <EmptyNotes filter={filter} searching={searching} startupName={selectedStartup?.name ?? null} />
          ) : (
            <>
              <ul aria-label={searching ? "Rezultati pretrage" : "Beleške"} className="divide-y-0">
                {list.rows.map(({ note, depth }) => (
                  <NoteRow
                    key={note._id}
                    note={note}
                    depth={depth}
                    now={now}
                    expanded={expandedId === note._id}
                    canSend={startups.length > 0}
                    onToggle={() => onToggle(note._id)}
                    onSave={(patch) => onSave(note, patch)}
                    onArchive={() => onArchive(note)}
                    onSend={() => onSend(note)}
                  />
                ))}
              </ul>
              {searching && list.rows.length >= NOTE_SEARCH_LIMIT ? (
                <p role="status" className="mt-3 px-2 text-sm text-muted-foreground">
                  Prikazano je prvih {NOTE_SEARCH_LIMIT} beležaka. Suzi pretragu.
                </p>
              ) : null}
              {more ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full pointer-coarse:h-11"
                  disabled={list.loadingMore}
                  onClick={list.onLoadMore}
                >
                  {list.loadingMore ? "Učitavam…" : "Učitaj još"}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyNotes({
  filter,
  searching,
  startupName,
}: {
  filter: NoteFilter;
  searching: boolean;
  startupName: string | null;
}) {
  const copy = notesEmptyText(filter, { searching, startupName });
  return (
    <EmptyState
      headingAs="h2"
      icon={NotebookPen}
      title={copy.title}
      description={copy.description ?? undefined}
    />
  );
}

function FilterChip({
  active,
  onClick,
  leading,
  children,
}: {
  active: boolean;
  onClick: () => void;
  leading?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        chipClass,
        active
          ? "border-primary/40 bg-accent text-accent-foreground"
          : "border-border bg-card/60 text-foreground hover:bg-muted/60",
      )}
    >
      {leading}
      {children}
    </button>
  );
}

/**
 * Brzi unos: Enter čuva, Shift+Enter je novi red. Odredište je izabrani startup
 * (ili Lično) i može da se promeni u meniju uz polje; promena filtera vraća
 * podrazumevano odredište.
 */
function QuickNote({
  quickRef,
  startups,
  defaultStartupId,
  onSubmit,
  initialText = "",
  initialError = null,
}: {
  quickRef: RefObject<HTMLTextAreaElement | null>;
  startups: ReadonlyArray<NoteStartup>;
  defaultStartupId: string | null;
  onSubmit: (startupId: string | null, text: string) => Promise<void>;
  initialText?: string;
  initialError?: string | null;
}) {
  const [text, setText] = useState(initialText);
  const [target, setTarget] = useState<string | null>(defaultStartupId);
  // Promena filtera vraća podrazumevano odredište, a ukucan tekst ostaje.
  const [seenDefault, setSeenDefault] = useState(defaultStartupId);
  if (seenDefault !== defaultStartupId) {
    setSeenDefault(defaultStartupId);
    setTarget(defaultStartupId);
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const errorId = useId();
  const check = cleanNoteText(text);
  const targetStartup = target === null ? undefined : startups.find((item) => item._id === target);
  // Startup koji je u međuvremenu nestao iz liste vraća unos na Lično.
  const effectiveTarget = targetStartup ? target : null;
  const shownError = error ?? (check.ok ? null : check.reason);

  const submit = async () => {
    if (!check.ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(effectiveTarget, check.text);
      setText("");
      quickRef.current?.focus();
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "Beleška nije sačuvana. Pokušaj ponovo.");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  };

  return (
    <div data-workspace-enter className="mt-5 rounded-xl border bg-card/40 p-2 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
      <Textarea
        ref={quickRef}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
        onKeyDown={onKeyDown}
        maxLength={NOTE_TEXT_MAX + 1}
        rows={text.includes("\n") ? Math.min(8, text.split("\n").length + 1) : 1}
        placeholder="Brza beleška…"
        aria-label="Brza beleška"
        aria-invalid={shownError ? true : undefined}
        aria-describedby={shownError ? errorId : undefined}
        className="min-h-10 resize-none border-0 bg-transparent px-2 py-2 text-base shadow-none focus-visible:ring-0 md:text-sm"
      />
      {shownError ? (
        <p id={errorId} role="alert" className="px-2 pb-1 text-sm text-destructive">
          {shownError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1">
        <div className="flex min-w-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Čuva se u: ${noteScopeLabel({ startup: targetStartup ?? null })}`}
                className="min-w-0 text-muted-foreground hover:text-foreground pointer-coarse:h-11"
              >
                <StartupChip startup={targetStartup ?? null} size="xs" />
                <span className="max-w-40 truncate">{noteScopeLabel({ startup: targetStartup ?? null })}</span>
                <ChevronDown aria-hidden="true" className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={effectiveTarget ?? "personal"}
                onValueChange={(value) => setTarget(value === "personal" ? null : value)}
              >
                <DropdownMenuRadioItem value="personal">
                  <StartupChip startup={null} size="xs" /> Lično
                </DropdownMenuRadioItem>
                {startups.map((startup) => (
                  <DropdownMenuRadioItem key={startup._id} value={startup._id}>
                    <StartupChip startup={startup} size="xs" />
                    <span className="max-w-48 truncate">{startup.name}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="hidden text-xs text-muted-foreground sm:block">Enter čuva · Shift+Enter nov red</p>
        </div>
        <Button type="button" size="sm" disabled={!check.ok || busy} onClick={() => void submit()} className="pointer-coarse:h-11">
          {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
          Sačuvaj
        </Button>
      </div>
    </div>
  );
}
