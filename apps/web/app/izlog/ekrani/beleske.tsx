"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  arrangeNotes,
  filterNotes,
  noteCreatedMessage,
  NOTE_ARCHIVED_MESSAGE,
  notesMapStartupId,
  sentToStartupMessage,
  type NoteFilter,
} from "@devotion/shared";

import type { NoteItemModel } from "@/components/me/notes/note-row";
import { NotesView, type NotesListState } from "@/components/me/notes/notes-view";
import { SendToStartupDialog } from "@/components/me/notes/send-to-startup-dialog";

import type { IzlogEkranProps } from "../registry";
import { IZLOG_NOTE_STARTUPS, IZLOG_NOTES } from "../fixtures/notes";
import { IZLOG_NOW } from "../fixtures/now";

const noop = () => {};
const wait = () => new Promise<void>((resolve) => window.setTimeout(resolve, 250));

/** Isto što radi server pretraga, nad lokalnim podacima. */
function matches(note: NoteItemModel, term: string) {
  const needle = term.toLowerCase();
  return (note.title ?? "").toLowerCase().includes(needle) || note.text.toLowerCase().includes(needle);
}

/**
 * Beleške u izlogu (K18): isti `NotesView` i `SendToStartupDialog` kao u
 * aplikaciji, sa stanjem u memoriji umesto upita — filter, pretraga, brzi unos,
 * izmena u mestu, arhiva i slanje rade nad lokalnim podacima.
 */
function IzlogBeleske({
  initialNotes,
  initialFilter = { kind: "all" },
  initialExpanded = null,
  initialSend = false,
  initialSearch = "",
  override,
}: {
  initialNotes: NoteItemModel[];
  initialFilter?: NoteFilter;
  initialExpanded?: string | null;
  initialSend?: boolean;
  initialSearch?: string;
  override?: NotesListState;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [filter, setFilter] = useState<NoteFilter>(initialFilter);
  const [search, setSearch] = useState(initialSearch);
  const [expandedId, setExpandedId] = useState<string | null>(initialExpanded);
  const [sendNote, setSendNote] = useState<NoteItemModel | null>(initialSend ? initialNotes[0] : null);
  const [sendOpen, setSendOpen] = useState(initialSend);
  const [announcement, setAnnouncement] = useState("");
  const counter = useRef(100);

  const term = search.trim();
  const searching = term.length >= 2;
  const scoped = useMemo(() => filterNotes(notes, filter), [notes, filter]);
  const list: NotesListState = override ?? {
    status: "ready",
    rows: searching
      ? scoped.filter((item) => matches(item, term)).map((item) => ({ note: item, depth: 0 }))
      : arrangeNotes(scoped),
    canLoadMore: false,
    loadingMore: false,
    onLoadMore: noop,
  };
  const mapStartupId = notesMapStartupId(filter);

  return (
    <div className="desk-surface overflow-hidden rounded-2xl border bg-background">
      <NotesView
        now={IZLOG_NOW}
        startups={IZLOG_NOTE_STARTUPS}
        filter={filter}
        onFilterChange={(next) => {
          setFilter(next);
          setExpandedId(null);
        }}
        search={search}
        onSearchChange={setSearch}
        searching={searching}
        list={list}
        expandedId={expandedId}
        onToggle={(id) => setExpandedId((current) => (current === id ? null : id))}
        onQuickAdd={async (startupId, text) => {
          await wait();
          const n = (counter.current += 1);
          const startup = IZLOG_NOTE_STARTUPS.find((item) => item._id === startupId) ?? null;
          setNotes((current) => [
            {
              _id: `thoughtNodes_${n}`,
              startupId,
              startup,
              title: text.split("\n")[0].slice(0, 80),
              text,
              parentThoughtId: null,
              updatedAt: IZLOG_NOW,
            },
            ...current,
          ]);
          const message = noteCreatedMessage(startup?.name ?? null);
          toast.success(message);
          setAnnouncement(message);
        }}
        onSave={async (target, patch) => {
          await wait();
          setNotes((current) =>
            current.map((item) => (item._id === target._id ? { ...item, ...patch, updatedAt: IZLOG_NOW } : item)),
          );
        }}
        onArchive={(target) => {
          setNotes((current) => current.filter((item) => item._id !== target._id));
          setExpandedId((current) => (current === target._id ? null : current));
          toast.success(NOTE_ARCHIVED_MESSAGE);
          setAnnouncement(NOTE_ARCHIVED_MESSAGE);
        }}
        onSend={(target) => {
          setSendNote(target);
          setSendOpen(true);
        }}
        onOpenMap={mapStartupId ? () => toast.info("Otvara Mapu beleški ovog startupa.") : undefined}
        announcement={announcement}
      />
      <SendToStartupDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        note={sendNote}
        startups={IZLOG_NOTE_STARTUPS}
        onSend={async (startupId) => {
          await wait();
          const target = IZLOG_NOTE_STARTUPS.find((item) => item._id === startupId);
          toast.success(sentToStartupMessage(target?.name ?? "startup"));
          setAnnouncement(sentToStartupMessage(target?.name ?? "startup"));
        }}
      />
    </div>
  );
}

export default function BeleskeEkran({ varijanta }: IzlogEkranProps) {
  switch (varijanta) {
    case "filter-startup":
      return (
        <IzlogBeleske
          key={varijanta}
          initialNotes={IZLOG_NOTES}
          initialFilter={{ kind: "startup", startupId: IZLOG_NOTE_STARTUPS[0]._id }}
        />
      );
    case "izmena":
      return <IzlogBeleske key={varijanta} initialNotes={IZLOG_NOTES} initialExpanded={IZLOG_NOTES[0]._id} />;
    case "prazno":
      return <IzlogBeleske key={varijanta} initialNotes={[]} />;
    case "pretraga-prazna":
      return <IzlogBeleske key={varijanta} initialNotes={IZLOG_NOTES} initialSearch="nepostojeće" />;
    case "posalji":
      return <IzlogBeleske key={varijanta} initialNotes={IZLOG_NOTES} initialSend />;
    case "ucitavanje":
      return <IzlogBeleske key={varijanta} initialNotes={IZLOG_NOTES} override={{ status: "loading" }} />;
    case "greska":
      return <IzlogBeleske key={varijanta} initialNotes={IZLOG_NOTES} override={{ status: "error", retry: noop }} />;
    default:
      return <IzlogBeleske key="mesano" initialNotes={IZLOG_NOTES} />;
  }
}
