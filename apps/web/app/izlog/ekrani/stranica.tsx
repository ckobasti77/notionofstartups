"use client";

import { useState, type ReactNode } from "react";
import { FileText, History, Lock, LockOpen, Map as MapIcon, MessageSquare, MessagesSquare, Trash2 } from "lucide-react";

import { CommentComposer } from "@/components/collab/comment-composer";
import { CommentList } from "@/components/collab/comment-list";
import { CommentsPanel } from "@/components/collab/comments-section";
import { ConflictDialog } from "@/components/collab/conflict-dialog";
import type { PresenceEditor } from "@/components/collab/presence-indicator";
import { RichTextEditor } from "@/components/rich-text-editor";
import {
  PageDocument,
  PageDocumentSkeleton,
  PageRouteProblem,
  type PageDocumentMenuItem,
} from "@/components/workspace/page/page-document";
import type { PageEditorSaveState } from "@/components/workspace/page/page-autosave-model";
import { lockView, type DocumentPermissions } from "@/components/workspace/page/page-document-model";
import { PageSideFacts } from "@/components/workspace/page/page-side-column";
import { SubpagesList } from "@/components/workspace/page/subpages-list";
import { PageRelationsCompact } from "@/components/workspace/page-relations";

import type { IzlogEkranProps } from "../registry";
import { IZLOG_NOW } from "../fixtures/now";
import {
  IZLOG_COMMENTS,
  IZLOG_DOC_CANDIDATES,
  IZLOG_DOC_CONTENT,
  IZLOG_DOC_CRUMBS,
  IZLOG_DOC_MEMBERS,
  IZLOG_DOC_META,
  IZLOG_DOC_PEOPLE,
  IZLOG_DOC_RELATIONS,
  IZLOG_DOC_SELF,
  IZLOG_DOC_SUBPAGES,
  IZLOG_DOC_TITLE,
  IZLOG_FILES,
  IZLOG_TABLE,
} from "../fixtures/page-document";

const noop = () => {};
const asyncNoop = async () => {};

const BASE: DocumentPermissions = {
  canEdit: true,
  canMove: true,
  canDetach: false,
  canArchive: true,
  canLock: false,
  canUnlock: false,
  canComment: true,
  canRestoreRevision: true,
  isLocked: false,
};

/** Dozvole po varijanti, kao što ih šalje `pages.get` (P1). */
const PERMISSIONS: Record<string, DocumentPermissions> = {
  clan: BASE,
  "zakljucana-autor": { ...BASE, canUnlock: true, canDetach: true, isLocked: true },
  "zakljucana-clan": { ...BASE, canEdit: false, canMove: false, canArchive: false, canRestoreRevision: false, isLocked: true },
};

const EDITORS: PresenceEditor[] = [
  { profileId: IZLOG_DOC_PEOPLE.ana._id, displayName: IZLOG_DOC_PEOPLE.ana.displayName, avatarUrl: null },
  { profileId: IZLOG_DOC_PEOPLE.marko._id, displayName: IZLOG_DOC_PEOPLE.marko.displayName, avatarUrl: null },
];

function menuFor(permissions: DocumentPermissions): PageDocumentMenuItem[] {
  const items: PageDocumentMenuItem[] = [
    { key: "comments", label: "Komentari", icon: MessageSquare, onSelect: noop },
    { key: "history", label: "Istorija izmena", icon: History, onSelect: noop },
  ];
  if (permissions.canLock) items.push({ key: "lock", label: "Zaključaj stranicu", icon: Lock, onSelect: noop });
  if (permissions.canUnlock) items.push({ key: "unlock", label: "Otključaj", icon: LockOpen, onSelect: noop });
  items.push({ key: "map", label: "Prikaži na mapi", icon: MapIcon, onSelect: noop });
  items.push({ key: "discussion", label: "Diskusija u Porukama · 3", icon: MessagesSquare, onSelect: noop });
  if (permissions.canArchive) items.push({ key: "archive", label: "Obriši", icon: Trash2, onSelect: noop, destructive: true });
  return items;
}

/** Statična tabela za izlog (`PageTablePanel` čita Convex). */
function FixtureTable() {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[28rem] text-sm">
        <thead className="border-b text-left text-xs font-medium text-muted-foreground">
          <tr>
            {IZLOG_TABLE.columns.map((column) => (
              <th key={column} className="h-10 px-3 font-medium">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {IZLOG_TABLE.rows.map((row) => (
            <tr key={row[0]} className="border-b last:border-0">
              {row.map((cell, index) => (
                <td key={index} className="h-10 px-3 tabular-nums">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Statični prilozi za izlog (`PageFilesPanel` čita Convex). */
function FixtureFiles() {
  return (
    <ul className="space-y-0.5">
      {IZLOG_FILES.map((file) => (
        <li key={file.name} className="flex min-h-10 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{file.meta}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Dokument tima sa fixture podacima — isti `PageDocument` kao u aplikaciji;
 * telo tabele i fajla je statičan prikaz (pravi paneli čitaju Convex).
 */
export function IzlogDocument({
  varijanta,
  overlay,
}: {
  varijanta: string;
  overlay?: ReactNode;
}) {
  const permissions = PERMISSIONS[varijanta] ?? BASE;
  const kind = varijanta === "tabela" ? "table" : varijanta === "fajl" ? "file" : "note";
  const [title, setTitle] = useState(kind === "table" ? "Provizije po kartici" : kind === "file" ? "Ugovori i šeme" : IZLOG_DOC_TITLE);
  const [selected, setSelected] = useState<string | "">("");
  const editable = permissions.canEdit;
  const saveState: PageEditorSaveState | null = !editable
    ? null
    : varijanta === "konflikt"
      ? "conflict"
      : varijanta === "prisustvo"
        ? "dirty"
        : "saved";
  const view = lockView(permissions);

  const body =
    kind === "table" ? (
      <FixtureTable />
    ) : kind === "file" ? (
      <FixtureFiles />
    ) : (
      <RichTextEditor
        documentKey={`izlog-${varijanta}`}
        content={IZLOG_DOC_CONTENT}
        editable={editable}
        onChange={noop}
      />
    );

  return (
    <div className="app-canvas desk-surface overflow-hidden rounded-2xl border bg-background">
      <PageDocument
        crumbs={IZLOG_DOC_CRUMBS}
        title={title}
        editable={editable}
        onTitleChange={setTitle}
        saveState={saveState}
        notice={null}
        editors={varijanta === "prisustvo" ? EDITORS : []}
        lock={{
          view,
          lockedByName: IZLOG_DOC_PEOPLE.ana.displayName,
          lockedAt: IZLOG_NOW - 26 * 60 * 60_000,
        }}
        meta={IZLOG_DOC_META}
        commentCount={String(IZLOG_COMMENTS.length)}
        onJumpToComments={noop}
        onOpenHistory={noop}
        menuItems={menuFor(permissions)}
        body={body}
        subpages={
          <SubpagesList
            headingId="izlog-podstranice"
            state={{ status: "ready", items: IZLOG_DOC_SUBPAGES, loadMore: null }}
            count={String(IZLOG_DOC_SUBPAGES.length)}
            onOpen={noop}
            onCreate={editable ? noop : undefined}
            onShowMap={noop}
          />
        }
        sideFacts={
          <PageSideFacts
            author={IZLOG_DOC_PEOPLE.ana}
            lastEdit={{ editorName: IZLOG_DOC_META.editorName, at: IZLOG_DOC_META.updatedAt }}
            lock={{
              locked: permissions.isLocked,
              canLock: permissions.canLock,
              canUnlock: permissions.canUnlock,
              busy: false,
              onLock: noop,
              onUnlock: noop,
            }}
            now={IZLOG_NOW}
          />
        }
        relations={
          <PageRelationsCompact
            loading={false}
            relations={IZLOG_DOC_RELATIONS}
            candidates={IZLOG_DOC_CANDIDATES}
            selectedCandidate={selected}
            onSelectedCandidate={setSelected}
            busy={false}
            onCreate={asyncNoop}
            onDelete={asyncNoop}
            onOpenPage={noop}
          />
        }
        comments={
          <CommentsPanel
            headingId="izlog-komentari"
            count={String(IZLOG_COMMENTS.length)}
            composer={<CommentComposer members={IZLOG_DOC_MEMBERS} selfProfileId={IZLOG_DOC_SELF} onSubmit={asyncNoop} />}
          >
            <CommentList
              state={{ status: "ready", items: IZLOG_COMMENTS, loadMore: null }}
              now={IZLOG_NOW}
              members={IZLOG_DOC_MEMBERS}
              selfProfileId={IZLOG_DOC_SELF}
              editingId={null}
              onStartEdit={noop}
              onCancelEdit={noop}
              onSaveEdit={asyncNoop}
              onRemove={noop}
              animateArrivals={false}
            />
          </CommentsPanel>
        }
        now={IZLOG_NOW}
      />
      {overlay}
    </div>
  );
}

/**
 * Stranica kao dokument tima (K10): član menja tuđu stranicu, zaključana za
 * autora i za člana, konflikt (dijalog), prisustvo, tabela i fajl u istom
 * okviru, učitavanje i obrisana.
 */
export default function StranicaEkran({ varijanta }: IzlogEkranProps) {
  if (varijanta === "ucitavanje") {
    return (
      <div className="app-canvas desk-surface overflow-hidden rounded-2xl border bg-background">
        <PageDocumentSkeleton />
      </div>
    );
  }
  if (varijanta === "obrisana" || varijanta === "greska") {
    return (
      <div className="app-canvas desk-surface overflow-hidden rounded-2xl border bg-background">
        <PageRouteProblem missing={varijanta === "obrisana"} onRetry={noop} onOpenTrash={noop} />
      </div>
    );
  }
  return (
    <IzlogDocument
      varijanta={varijanta}
      overlay={
        varijanta === "konflikt" ? (
          <ConflictDialog
            open
            onOpenChange={noop}
            updaterName={IZLOG_DOC_PEOPLE.ana.displayName}
            updatedAt={IZLOG_NOW - 2 * 60_000}
            now={IZLOG_NOW}
            onCopy={noop}
            onLoadLatest={noop}
            onOverwrite={noop}
          />
        ) : null
      }
    />
  );
}
