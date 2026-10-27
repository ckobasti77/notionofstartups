"use client";

import { useState } from "react";

import {
  RestoreConfirmDialog,
  RevisionList,
  RevisionPreview,
  type RevisionListState,
} from "@/components/collab/revision-history";
import { Drawer } from "@/components/motion";
import { RichTextEditor } from "@/components/rich-text-editor";

import type { IzlogEkranProps } from "../registry";
import { IZLOG_NOW } from "../fixtures/now";
import { IZLOG_REVISIONS, IZLOG_REVISIONS_LOCKED, revisionDetail } from "../fixtures/page-document";
import { IzlogDocument } from "./stranica";

const noop = () => {};

/**
 * Istorija izmena (K10, K07 §6.2): fioka nad dokumentom — lista po danima,
 * pregled verzije, potvrda „Vrati ovu verziju", zaključano (vraćanje
 * onemogućeno uz razlog) i prazno. Iste komponente kao u aplikaciji.
 */
export default function IstorijaIzmenaEkran({ varijanta }: IzlogEkranProps) {
  const [open, setOpen] = useState(true);
  const locked = varijanta === "zakljucano";
  const items = locked ? IZLOG_REVISIONS_LOCKED : IZLOG_REVISIONS;
  const preview = varijanta === "pregled" || varijanta === "potvrda" || locked;
  const detail = revisionDetail(items[3]);
  const listState: RevisionListState =
    varijanta === "ucitavanje"
      ? { status: "loading" }
      : varijanta === "greska"
        ? { status: "error", onRetry: noop }
        : { status: "ready", items: varijanta === "prazno" ? [] : items, loadMore: null };

  return (
    <>
      <IzlogDocument varijanta={locked ? "zakljucana-clan" : "clan"} />
      <Drawer open={open} onOpenChange={setOpen} title="Istorija izmena" width="28rem">
        {preview ? (
          <RevisionPreview
            state={{ status: "ready", revision: detail }}
            now={IZLOG_NOW}
            onBack={noop}
            preview={
              <RichTextEditor
                documentKey={`izlog-revizija-${varijanta}`}
                content={detail.content}
                editable={false}
                onChange={noop}
              />
            }
            blockedReason={locked ? "Stranica je zaključana." : null}
            onRestore={noop}
          />
        ) : (
          <RevisionList state={listState} now={IZLOG_NOW} onSelect={noop} />
        )}
      </Drawer>
      <RestoreConfirmDialog
        open={varijanta === "potvrda"}
        onOpenChange={noop}
        revisionAt={detail.updatedAt}
        now={IZLOG_NOW}
        busy={false}
        onConfirm={noop}
      />
    </>
  );
}
