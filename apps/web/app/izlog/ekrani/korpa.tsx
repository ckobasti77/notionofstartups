"use client";

import { useState } from "react";
import type { TrashKind } from "@devotion/shared";

import { TrashList, TrashView, type TrashListState } from "@/components/workspace/trash/trash-view";
import type { TrashItem } from "@/components/workspace/trash/trash-model";

import type { IzlogEkranProps } from "../registry";
import { IZLOG_NOW } from "../fixtures/now";
import {
  IZLOG_TRASH_COUNTS,
  IZLOG_TRASH_EMPTY_COUNTS,
  IZLOG_TRASH_FILES,
  IZLOG_TRASH_IDEAS,
  IZLOG_TRASH_PAGES,
  IZLOG_TRASH_RECOVERED,
} from "../fixtures/trash";

const noop = () => {};

const ITEMS: Record<TrashKind, TrashItem[]> = {
  page: IZLOG_TRASH_PAGES,
  idea: IZLOG_TRASH_IDEAS,
  file: IZLOG_TRASH_FILES,
  recovered: IZLOG_TRASH_RECOVERED,
};

const VARIANT_SEGMENT: Record<string, TrashKind> = {
  stranice: "page",
  ideje: "idea",
  prilozi: "file",
  oporavljeno: "recovered",
};

/**
 * Korpa (K08): segmenti sa stavkama, prazno, učitavanje i greška. Klik na
 * karticu menja segment u mestu; „Vrati" i „Ukloni" ovde ne rade ništa.
 */
export default function KorpaEkran({ varijanta }: IzlogEkranProps) {
  const [segment, setSegment] = useState<TrashKind>(VARIANT_SEGMENT[varijanta] ?? "page");
  const empty = varijanta === "prazna";
  const state: TrashListState =
    varijanta === "ucitavanje"
      ? { status: "loading" }
      : varijanta === "greska"
        ? { status: "error", onRetry: noop }
        : {
            status: "ready",
            items: empty ? [] : ITEMS[segment],
            loadMore: !empty && segment === "page" ? { busy: false, onLoad: noop } : null,
          };
  return (
    <div className="app-canvas desk-surface min-h-[40rem] overflow-hidden rounded-2xl border bg-background">
      <TrashView
        segment={segment}
        onSegmentChange={setSegment}
        counts={varijanta === "ucitavanje" ? undefined : empty ? IZLOG_TRASH_EMPTY_COUNTS : IZLOG_TRASH_COUNTS}
      >
        <TrashList
          segment={segment}
          state={state}
          now={IZLOG_NOW}
          busyKey={null}
          onRestore={noop}
          onDismiss={noop}
        />
      </TrashView>
    </div>
  );
}
