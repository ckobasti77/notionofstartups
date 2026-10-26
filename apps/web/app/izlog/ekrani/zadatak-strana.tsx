"use client";

import { useState } from "react";
import { History, Lock, LockOpen, MessageSquare, MessagesSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CommentComposer } from "@/components/collab/comment-composer";
import { CommentList } from "@/components/collab/comment-list";
import { CommentsPanel } from "@/components/collab/comments-section";
import { LOCK_NOTICE_TASK } from "@/components/collab/collab-model";
import { InstructionsSection, type StartupTaskPanelChange } from "@/components/me/task-panel/startup-task-panel-view";
import { TaskDetailLayout } from "@/components/me/task-panel/task-detail-layout";
import { Button } from "@/components/ui/button";
import { PageDocument, type PageDocumentMenuItem } from "@/components/workspace/page/page-document";
import { lockView } from "@/components/workspace/page/page-document-model";
import { PageSideFacts } from "@/components/workspace/page/page-side-column";
import { SubpagesList } from "@/components/workspace/page/subpages-list";
import { PageRelationsCompact } from "@/components/workspace/page-relations";

import type { IzlogEkranProps } from "../registry";
import { IZLOG_NOW } from "../fixtures/now";
import {
  IZLOG_DOC_CANDIDATES,
  IZLOG_DOC_MEMBERS,
  IZLOG_DOC_PEOPLE,
  IZLOG_DOC_RELATIONS,
  IZLOG_DOC_SELF,
  IZLOG_DOC_SUBPAGES,
} from "../fixtures/page-document";
import {
  IZLOG_TASK_COMMENTS,
  IZLOG_TASK_PAGE_ASSIGNEES,
  IZLOG_TASK_PAGE_CRUMBS,
  IZLOG_TASK_PAGE_INSTRUCTIONS,
  IZLOG_TASK_PAGE_MEMBERS,
  IZLOG_TASK_PAGE_META,
  IZLOG_TASK_PAGE_TASK,
  IZLOG_TASK_PAGE_TITLE,
  izlogTaskPageDocumentPermissions,
  izlogTaskPagePermissions,
  type IzlogTaskPageVariant,
} from "../fixtures/task-page";
import { IzlogCheckpoints } from "./panel-zadatka";

const noop = () => {};
const asyncNoop = async () => {};

const VARIANTS: ReadonlyArray<IzlogTaskPageVariant> = ["clan", "zakljucan", "sa-komentarima"];

/**
 * Zadatak na celu stranu (K11) — isti `PageDocument` i `TaskDetailLayout` kao u
 * aplikaciji, sa lokalnim stanjem umesto mutacija. Koraci su statičan prikaz
 * (`TaskCheckpointList` čita Convex).
 */
export default function ZadatakStranaEkran({ varijanta }: IzlogEkranProps) {
  const variant: IzlogTaskPageVariant = VARIANTS.find((value) => value === varijanta) ?? "clan";
  const documentPermissions = izlogTaskPageDocumentPermissions(variant);
  const permissions = izlogTaskPagePermissions(variant);
  const editable = documentPermissions.canEdit;
  const comments = variant === "sa-komentarima" ? IZLOG_TASK_COMMENTS : IZLOG_TASK_COMMENTS.slice(0, 1);

  const [title, setTitle] = useState(IZLOG_TASK_PAGE_TITLE);
  const [task, setTask] = useState(IZLOG_TASK_PAGE_TASK);
  const [assignees, setAssignees] = useState(IZLOG_TASK_PAGE_ASSIGNEES);
  const [instructions, setInstructions] = useState(IZLOG_TASK_PAGE_INSTRUCTIONS);
  const [planned, setPlanned] = useState(false);
  const [selected, setSelected] = useState<string | "">("");

  const change = (patch: StartupTaskPanelChange) => {
    if (patch.assigneeProfileIds) {
      setAssignees(IZLOG_TASK_PAGE_MEMBERS.filter((person) => patch.assigneeProfileIds?.includes(person._id)));
    }
    setTask((current) => ({
      ...current,
      ...(patch.status === undefined ? {} : { status: patch.status }),
      ...(patch.priority === undefined ? {} : { priority: patch.priority }),
      ...(patch.dueDate === undefined ? {} : { dueDate: patch.dueDate }),
    }));
  };

  const menuItems: PageDocumentMenuItem[] = [
    { key: "comments", label: "Komentari", icon: MessageSquare, onSelect: noop },
    { key: "history", label: "Istorija izmena", icon: History, onSelect: noop },
    ...(documentPermissions.canLock
      ? [{ key: "lock" as const, label: "Zaključaj zadatak", icon: Lock, onSelect: noop }]
      : []),
    ...(documentPermissions.canUnlock ? [{ key: "unlock" as const, label: "Otključaj", icon: LockOpen, onSelect: noop }] : []),
    { key: "discussion", label: "Diskusija u Porukama · 2", icon: MessagesSquare, onSelect: noop },
    ...(documentPermissions.canArchive
      ? [{ key: "archive" as const, label: "Obriši", icon: Trash2, onSelect: noop, destructive: true }]
      : []),
  ];

  return (
    <div className="app-canvas desk-surface overflow-hidden rounded-2xl border bg-background">
      <PageDocument
        crumbs={IZLOG_TASK_PAGE_CRUMBS}
        title={title}
        titleLabel="Naslov zadatka"
        lockNotice={LOCK_NOTICE_TASK}
        subject="task"
        editable={editable}
        onTitleChange={setTitle}
        saveState={editable ? "saved" : null}
        notice={null}
        editors={[]}
        lock={{
          view: lockView(documentPermissions),
          lockedByName: IZLOG_DOC_PEOPLE.ana.displayName,
          lockedAt: IZLOG_NOW - 26 * 60 * 60_000,
        }}
        meta={IZLOG_TASK_PAGE_META}
        commentCount={String(comments.length)}
        onJumpToComments={noop}
        onOpenHistory={noop}
        menuItems={menuItems}
        body={
          <TaskDetailLayout
            variant="page"
            now={IZLOG_NOW}
            task={task}
            assignees={assignees}
            members={IZLOG_TASK_PAGE_MEMBERS}
            permissions={permissions}
            isSelfAssigned={assignees.some((person) => person._id === IZLOG_DOC_SELF)}
            planned={planned}
            onChange={change}
            onJoin={() => setAssignees((current) => [...current, IZLOG_TASK_PAGE_MEMBERS[0]])}
            onLeave={() => setAssignees((current) => current.filter((person) => person._id !== IZLOG_DOC_SELF))}
            onTogglePlan={() => setPlanned((value) => !value)}
            onDenied={(reason) => toast.error(reason)}
            checkpoints={<IzlogCheckpoints editable={permissions.checkpoints.allowed} />}
            instructions={
              <InstructionsSection
                headingAs="h2"
                value={instructions}
                onValueChange={setInstructions}
                onCommit={noop}
                editable={permissions.instructions.allowed}
                lockedReason={permissions.instructions.allowed ? null : permissions.instructions.reason}
                onDenied={(reason) => toast.error(reason)}
                saveState="saved"
                aside={
                  <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={noop}>
                    Istorija izmena
                  </Button>
                }
              />
            }
          />
        }
        subpages={
          <SubpagesList
            headingId="izlog-podstranice"
            state={{ status: "ready", items: IZLOG_DOC_SUBPAGES.slice(0, 1), loadMore: null }}
            count="1"
            onOpen={noop}
            onCreate={editable ? noop : undefined}
          />
        }
        sideFacts={
          <PageSideFacts
            author={IZLOG_DOC_PEOPLE.ana}
            lastEdit={{ editorName: IZLOG_TASK_PAGE_META.editorName, at: IZLOG_TASK_PAGE_META.updatedAt }}
            lock={{
              locked: documentPermissions.isLocked,
              canLock: documentPermissions.canLock,
              canUnlock: documentPermissions.canUnlock,
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
            relations={IZLOG_DOC_RELATIONS.slice(0, 1)}
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
            count={comments.length > 0 ? String(comments.length) : null}
            composer={<CommentComposer members={IZLOG_DOC_MEMBERS} selfProfileId={IZLOG_DOC_SELF} onSubmit={asyncNoop} />}
          >
            <CommentList
              state={{ status: "ready", items: comments, loadMore: null }}
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
    </div>
  );
}
