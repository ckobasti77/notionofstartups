"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { History, Lock, LockOpen, Map as MapIcon, MessageSquare, MessagesSquare, Trash2, Unlink } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/errors";

import type { PageDocumentMenuItem } from "./page-document";
import { trashedMessage, type PageMenuKey } from "./page-document-model";

/** Tekstovi radnji dokumenta: stranica (ž) i zadatak (m) — isti tok, drugi rod. */
export const PAGE_ACTION_TEXT = {
  page: {
    lockItem: "Zaključaj stranicu",
    locked: "Stranica je zaključana.",
    unlocked: "Stranica je otključana.",
    lockFailed: "Stranica nije zaključana.",
    unlockFailed: "Stranica nije otključana.",
    archiveFailed: "Stranica nije obrisana.",
    restoreFailed: "Stranica nije vraćena.",
    detached: "Stranica je odvojena i premeštena na vrh oblasti.",
    detachFailed: "Stranica nije odvojena.",
    notNested: "Stranica više nije ugnežđena.",
  },
  task: {
    lockItem: "Zaključaj zadatak",
    locked: "Zadatak je zaključan.",
    unlocked: "Zadatak je otključan.",
    lockFailed: "Zadatak nije zaključan.",
    unlockFailed: "Zadatak nije otključan.",
    archiveFailed: "Zadatak nije obrisan.",
    restoreFailed: "Zadatak nije vraćen.",
    detached: "Zadatak je odvojen i premešten na vrh oblasti.",
    detachFailed: "Zadatak nije odvojen.",
    notNested: "Zadatak više nije ugnežđen.",
  },
} as const;

export type PageActionKind = keyof typeof PAGE_ACTION_TEXT;

/**
 * Radnje dokumenta koje dele stranica i zadatak na punoj strani: zaključaj /
 * otključaj, Korpa (uz „Poništi" kroz `trash.restore`) i odvajanje na vrh
 * oblasti. Brisanje čeka da se izmene sačuvaju.
 */
export function usePageDocumentActions({
  kind,
  startupId,
  pageId,
  title,
  saveState,
  onArchived,
}: {
  kind: PageActionKind;
  startupId: Id<"startups">;
  pageId: Id<"pages">;
  title: string;
  saveState: "saved" | "saving" | "dirty" | "error" | "conflict" | "invalid";
  onArchived: () => void;
}) {
  const text = PAGE_ACTION_TEXT[kind];
  const lockPage = useMutation(api.pages.lock);
  const unlockPage = useMutation(api.pages.unlock);
  const archivePage = useMutation(api.areasV2.archivePage);
  const restoreFromTrash = useMutation(api.trash.restore);
  const detachPage = useMutation(api.areasV2.detachPage);
  const [lockBusy, setLockBusy] = useState(false);

  async function setLocked(locked: boolean) {
    if (lockBusy) return;
    setLockBusy(true);
    try {
      if (locked) await lockPage({ pageId });
      else await unlockPage({ pageId });
      toast.success(locked ? text.locked : text.unlocked);
    } catch (error) {
      toast.error(accessErrorMessage(error, locked ? text.lockFailed : text.unlockFailed));
    } finally {
      setLockBusy(false);
    }
  }

  async function archive() {
    if (saveState === "dirty" || saveState === "saving") {
      toast.info("Sačekaj trenutak da se izmene sačuvaju.");
      return;
    }
    try {
      await archivePage({ startupId, pageId });
      toast.success(trashedMessage(title), {
        action: {
          label: "Poništi",
          onClick: () =>
            void restoreFromTrash({ target: { kind: "page", id: pageId } }).catch((error: unknown) =>
              toast.error(accessErrorMessage(error, text.restoreFailed)),
            ),
        },
      });
      onArchived();
    } catch (error) {
      toast.error(accessErrorMessage(error, text.archiveFailed));
    }
  }

  async function detach() {
    try {
      const result = await detachPage({ startupId, pageId });
      if (result.status !== "detached") throw new Error(text.notNested);
      toast.success(text.detached);
    } catch (error) {
      toast.error(accessErrorMessage(error, text.detachFailed));
    }
  }

  return { lockBusy, setLocked, archive, detach };
}

/** Ctrl/⌘ S: sačuvaj odmah (pregledač ne otvara svoj dijalog); poslednja funkcija stiže kroz ref. */
export function useSaveShortcut(onSave: () => void) {
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "s" || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      event.preventDefault();
      saveRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

/** Stavke menija „…" redom ključeva iz `pageMenuKeys` (K07 §5.6). */
export function buildPageMenuItems({
  keys,
  kind,
  discussionLabel,
  onJumpToComments,
  onOpenHistory,
  onSetLocked,
  onOpenMap,
  onDetach,
  onDiscussion,
  onArchive,
}: {
  keys: ReadonlyArray<PageMenuKey>;
  kind: PageActionKind;
  discussionLabel: string;
  onJumpToComments: () => void;
  onOpenHistory: () => void;
  onSetLocked: (locked: boolean) => void;
  onOpenMap: () => void;
  onDetach: () => void;
  onDiscussion: () => void;
  onArchive: () => void;
}): PageDocumentMenuItem[] {
  const items: PageDocumentMenuItem[] = [];
  for (const key of keys) {
    if (key === "comments") items.push({ key, label: "Komentari", icon: MessageSquare, onSelect: onJumpToComments, afterClose: true });
    if (key === "history") items.push({ key, label: "Istorija izmena", icon: History, onSelect: onOpenHistory });
    if (key === "lock") items.push({ key, label: PAGE_ACTION_TEXT[kind].lockItem, icon: Lock, onSelect: () => onSetLocked(true) });
    if (key === "unlock") items.push({ key, label: "Otključaj", icon: LockOpen, onSelect: () => onSetLocked(false) });
    if (key === "map") items.push({ key, label: "Prikaži na mapi", icon: MapIcon, onSelect: onOpenMap });
    if (key === "detach") items.push({ key, label: "Odvoji na vrh oblasti", icon: Unlink, onSelect: onDetach });
    if (key === "discussion") items.push({ key, label: discussionLabel, icon: MessagesSquare, onSelect: onDiscussion });
    if (key === "archive") items.push({ key, label: "Obriši", icon: Trash2, onSelect: onArchive, destructive: true });
  }
  return items;
}
