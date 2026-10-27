"use client";

import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { toast } from "sonner";
import {
  arrangeNotes,
  NOTE_ARCHIVED_MESSAGE,
  NOTE_SEARCH_LIMIT,
  NOTE_SEARCH_MIN,
  noteCreatedMessage,
  noteFilterKey,
  noteScopeArg,
  NOTES_PAGE_SIZE,
  notesMapStartupId,
  resolveNoteFilter,
  sentToStartupMessage,
  type NoteEditPatch,
  type NoteFilter,
} from "@devotion/shared";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/errors";
import type { Today } from "@/lib/today";

import { useQueryState } from "../my-day/use-query-state";
import type { NoteItemModel, NoteStartup } from "./note-row";
import { NotesView, type NotesListState } from "./notes-view";
import { SendToStartupDialog } from "./send-to-startup-dialog";

export type NotesContainerProps = {
  today: Today;
  /** Moji aktivni startupi, redosledom ljuske (čipovi filtera i ciljevi slanja). */
  startups: ReadonlyArray<{ _id: Id<"startups">; name: string; logoUrl: string | null }>;
  /** Mapa beleški jednog startupa (`?view=thoughts&startupId=`). */
  onOpenMap: (startupId: Id<"startups">) => void;
  /** „Otvori" iz toasta posle slanja: ideja u njenom startupu. */
  onOpenIdea: (startupId: Id<"startups">, ideaId: Id<"ideaNodes">) => void;
};

/** „Poništi" traje 8 s (plan K07 E6). */
const UNDO_MS = 8_000;
/** Server filtrira posle paginacije (K05-7): lista sama učitava dalje do ove granice. */
const AUTO_LOAD_MAX = 300;
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Beleške (K18): `thoughts.listMine` (paginirano, učitava dalje dok ima),
 * `thoughts.searchMine` od dva znaka, izmena u mestu kroz `updateNode`,
 * arhiva sa „Poništi" (`archiveNodes` / `restoreNodes`) i „Pošalji u startup"
 * (`convertToIdeas`). Filter i pretraga žive iznad ponovnog montiranja, pa
 * „Pokušaj ponovo" ne vraća prikaz na „Sve".
 */
export function NotesContainer(props: NotesContainerProps) {
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<NoteFilter<Id<"startups">>>({ kind: "all" });
  const [search, setSearch] = useState("");
  return (
    <NotesContent
      key={attempt}
      {...props}
      retry={() => setAttempt((value) => value + 1)}
      filter={filter}
      setFilter={setFilter}
      search={search}
      setSearch={setSearch}
    />
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function NotesContent({
  today,
  startups,
  onOpenMap,
  onOpenIdea,
  retry,
  filter,
  setFilter,
  search,
  setSearch,
}: NotesContainerProps & {
  retry: () => void;
  filter: NoteFilter<Id<"startups">>;
  setFilter: (filter: NoteFilter<Id<"startups">>) => void;
  search: string;
  setSearch: (value: string) => void;
}) {
  const createNote = useMutation(api.thoughts.createNote);
  const updateNode = useMutation(api.thoughts.updateNode);
  const archiveNodes = useMutation(api.thoughts.archiveNodes);
  const restoreNodes = useMutation(api.thoughts.restoreNodes);
  const convertToIdeas = useMutation(api.thoughts.convertToIdeas);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sendNote, setSendNote] = useState<NoteItemModel | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  // „Otvori" iz toasta može stići i 8 s kasnije: uvek najnoviji rukovalac ljuske.
  const openIdeaRef = useRef(onOpenIdea);
  useLayoutEffect(() => {
    openIdeaRef.current = onOpenIdea;
  });

  const noteStartups = useMemo<NoteStartup[]>(
    () => startups.map((startup) => ({ _id: startup._id, name: startup.name, logoUrl: startup.logoUrl })),
    [startups],
  );
  // Startup koji više nije u mojoj listi (napušten) vraća prikaz na „Sve".
  const effectiveFilter = resolveNoteFilter(
    filter,
    startups.map((startup) => startup._id),
  );
  const term = search.trim();
  const debounced = useDebounced(term, SEARCH_DEBOUNCE_MS);
  // Od dva znaka ide serveru; kraće je obična lista (isto na telefonu).
  const query = term.length >= NOTE_SEARCH_MIN && debounced.length >= NOTE_SEARCH_MIN ? debounced : null;
  const scopeArg = noteScopeArg(effectiveFilter);
  const mapStartupId = notesMapStartupId(effectiveFilter);

  /** Najava se prvo isprazni, da čitač ekrana ponovi isti tekst. */
  const announce = (message: string) => {
    setAnnouncement("");
    window.setTimeout(() => setAnnouncement(message), 50);
  };

  const quickAdd = async (startupId: string | null, text: string) => {
    let noteId: Id<"thoughtNodes">;
    try {
      noteId = await createNote({ startupId: startupId as Id<"startups"> | null, text });
    } catch (error) {
      throw new Error(accessErrorMessage(error, "Beleška nije sačuvana. Pokušaj ponovo."));
    }
    const name = startupId === null ? null : (startups.find((startup) => startup._id === startupId)?.name ?? null);
    const message = noteCreatedMessage(name);
    announce(message);
    toast.success(message, {
      duration: UNDO_MS,
      action: {
        label: "Poništi",
        onClick: () => {
          void archiveNodes({ nodeIds: [noteId] })
            .then(() => toast.info("Unos je poništen."))
            .catch((error: unknown) => toast.error(accessErrorMessage(error, "Poništavanje nije uspelo.")));
        },
      },
    });
  };

  const save = async (note: NoteItemModel, patch: NoteEditPatch) => {
    try {
      await updateNode({ nodeId: note._id as Id<"thoughtNodes">, ...patch });
    } catch (error) {
      throw new Error(accessErrorMessage(error, "Izmena nije sačuvana. Pokušaj ponovo."));
    }
  };

  const archive = (note: NoteItemModel) => {
    const nodeId = note._id as Id<"thoughtNodes">;
    // Red nestaje: fokus ide na sledeći red, ili na prethodni.
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-note-id]") ?? []);
    const index = rows.findIndex((row) => row.dataset.noteId === note._id);
    const neighbour = index === -1 ? null : (rows[index + 1] ?? rows[index - 1] ?? null);
    void archiveNodes({ nodeIds: [nodeId] })
      .then(() => {
        setExpandedId((current) => (current === note._id ? null : current));
        announce(NOTE_ARCHIVED_MESSAGE);
        if (neighbour?.isConnected) neighbour.querySelector<HTMLElement>("button")?.focus();
        toast.success(NOTE_ARCHIVED_MESSAGE, {
          duration: UNDO_MS,
          action: {
            label: "Poništi",
            onClick: () => {
              void restoreNodes({ nodeIds: [nodeId] })
                .then(() => toast.info("Beleška je vraćena."))
                .catch((error: unknown) => toast.error(accessErrorMessage(error, "Vraćanje nije uspelo.")));
            },
          },
        });
      })
      .catch((error: unknown) => toast.error(accessErrorMessage(error, "Arhiviranje nije uspelo.")));
  };

  const send = async (startupId: string) => {
    if (!sendNote) return;
    const target = startups.find((startup) => startup._id === startupId);
    if (!target) throw new Error("Startup više nije dostupan.");
    let ideaId: Id<"ideaNodes"> | undefined;
    try {
      const result = await convertToIdeas({
        startupId: target._id,
        nodeIds: [sendNote._id as Id<"thoughtNodes">],
      });
      ideaId = result.ideaIds[0];
    } catch (error) {
      throw new Error(accessErrorMessage(error, "Beleška nije poslata. Pokušaj ponovo."));
    }
    const message = sentToStartupMessage(target.name);
    announce(message);
    toast.success(message, {
      duration: UNDO_MS,
      action: ideaId ? { label: "Otvori", onClick: () => openIdeaRef.current(target._id, ideaId) } : undefined,
    });
  };

  const renderView = (list: NotesListState) => (
    <NotesView
      now={today.now}
      startups={noteStartups}
      filter={effectiveFilter}
      onFilterChange={(next) => {
        // Id-jevi čipova potiču iz `startups` (view ih vraća kao stringove).
        setFilter(next as NoteFilter<Id<"startups">>);
        setExpandedId(null);
      }}
      search={search}
      onSearchChange={setSearch}
      searching={query !== null}
      list={list}
      expandedId={expandedId}
      onToggle={(id) => setExpandedId((current) => (current === id ? null : id))}
      onQuickAdd={quickAdd}
      onSave={save}
      onArchive={archive}
      onSend={(note) => {
        setSendNote(note);
        setSendOpen(true);
      }}
      onOpenMap={mapStartupId ? () => onOpenMap(mapStartupId) : undefined}
      announcement={announcement}
      listRef={listRef}
    />
  );

  return (
    <>
      <ListBoundary retry={retry} render={renderView} resetKey={`${noteFilterKey(effectiveFilter)}|${query ?? ""}`}>
        <ListBridge
          scopeArg={scopeArg}
          query={query}
          expandedId={expandedId}
          startups={noteStartups}
          retry={retry}
          render={renderView}
        />
      </ListBoundary>
      <SendToStartupDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        note={sendNote}
        startups={noteStartups}
        onSend={send}
      />
    </>
  );
}

type ScopeArg = { startupId?: Id<"startups"> | null };

/**
 * Pretplata na listu (ili pretragu) i pretvaranje u stanje prikaza. Isto drvo
 * u oba režima, da polje pretrage ne gubi fokus kad pretraga počne.
 */
function ListBridge({
  scopeArg,
  query,
  expandedId,
  startups,
  retry,
  render,
}: {
  scopeArg: ScopeArg;
  query: string | null;
  expandedId: string | null;
  startups: ReadonlyArray<NoteStartup>;
  retry: () => void;
  render: (list: NotesListState) => ReactNode;
}) {
  const { results, status, loadMore } = usePaginatedQuery(api.thoughts.listMine, scopeArg, {
    initialNumItems: NOTES_PAGE_SIZE,
  });
  // Server izbacuje beleške napuštenih startupa POSLE čitanja, pa strana može biti kraća.
  useEffect(() => {
    if (status === "CanLoadMore" && results.length < AUTO_LOAD_MAX) loadMore(NOTES_PAGE_SIZE);
  }, [status, results.length, loadMore]);

  const searchState = useQueryState(api.thoughts.searchMine, query === null ? "skip" : { query, limit: NOTE_SEARCH_LIMIT, ...scopeArg });
  const hits = searchState.status === "ready" ? searchState.data : null;
  const expandedHit = hits?.some((hit) => hit._id === expandedId) === true;
  const fullState = useQueryState(
    api.thoughts.getNote,
    expandedHit && expandedId ? { nodeId: expandedId as Id<"thoughtNodes"> } : "skip",
  );

  const items = useMemo<NoteItemModel[]>(
    () =>
      results.map((note) => ({
        _id: note._id,
        startupId: note.startupId,
        title: note.title,
        text: note.text,
        parentThoughtId: note.parentThoughtId,
        updatedAt: note.updatedAt,
        startup: note.startup,
      })),
    [results],
  );
  const rows = useMemo(() => arrangeNotes(items), [items]);

  let list: NotesListState;
  if (query !== null) {
    if (searchState.status === "error") {
      list = { status: "error", retry };
    } else if (hits === null) {
      list = { status: "loading" };
    } else {
      list = {
        status: "ready",
        rows: hits.map((hit) => {
          // Startup van učitane liste se ne prikazuje kao „Lično" (to bi bila laž o opsegu).
          const startup =
            hit.startupId === null
              ? null
              : (startups.find((item) => item._id === hit.startupId) ?? { _id: hit.startupId, name: "Startup", logoUrl: null });
          const base: NoteItemModel = {
            _id: hit._id,
            startupId: hit.startupId,
            title: hit.title,
            text: hit.text,
            parentThoughtId: null,
            updatedAt: 0,
            startup,
            snippet: true,
          };
          if (hit._id !== expandedId) return { note: base, depth: 0 };
          if (fullState.status === "ready" && fullState.data !== null) {
            const full = fullState.data;
            return {
              note: { ...base, title: full.title, text: full.text, parentThoughtId: full.parentThoughtId, updatedAt: full.updatedAt, snippet: false },
              depth: 0,
            };
          }
          const detail = fullState.status === "loading" ? "loading" : "missing";
          return { note: { ...base, detail }, depth: 0 };
        }),
        canLoadMore: false,
        loadingMore: false,
        onLoadMore: () => {},
      };
    }
  } else if (status === "LoadingFirstPage" || (results.length === 0 && status !== "Exhausted")) {
    // Prazna strana uz „ima još" nije prazna lista: čeka se sledeća (automatski).
    list = { status: "loading" };
  } else {
    list = {
      status: "ready",
      rows,
      canLoadMore: status === "CanLoadMore",
      loadingMore: status === "LoadingMore",
      onLoadMore: () => loadMore(NOTES_PAGE_SIZE),
    };
  }
  return <>{render(list)}</>;
}

/**
 * `usePaginatedQuery` baca grešku servera tokom rendera. Granica je ovde, oko
 * same liste (obrazac Inboxa); promena filtera ili pretrage je nova pretplata,
 * pa greška starog filtera ne važi.
 */
class ListBoundary extends Component<
  {
    children: ReactNode;
    retry: () => void;
    render: (list: NotesListState) => ReactNode;
    resetKey: string;
  },
  { failed: boolean }
> {
  state = { failed: false };

  componentDidUpdate(previous: { resetKey: string }) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return this.props.render({ status: "error", retry: this.props.retry });
    return this.props.children;
  }
}
