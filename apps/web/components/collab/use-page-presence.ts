"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useMutation } from "convex/react";

import { useQueryTolerant } from "@/components/workspace/workspace-error-boundary";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PAGE_PRESENCE_REFRESH_MS } from "@/convex/lib/pagePresence";

import { activeEditors } from "./collab-model";

/** Prvo kucanje posle tišine šalje otkucaj odmah, ali ne češće od ovoga. */
const EAGER_HEARTBEAT_GAP_MS = 3_000;

/**
 * „<Ime> uređuje" (PROSTOR P23, plan K07 §6.4). Dok je stranica otvorena i
 * prozor vidljiv, šalje `presence.heartbeat` na mount i na
 * `PAGE_PRESENCE_REFRESH_MS` (15 s); `editing` je pravo izmene ∧ aktivnost
 * (fokus, kucanje) u `region` u poslednjih 15 s. Na odlasku `presence.leave`.
 * Upit ne čita sat: sveže redove bira klijent (`activeEditors`) sa satom koji
 * tiče na 15 s. Greška prisustva se tiho preskače — nije radnja korisnika.
 */
export function usePagePresence(
  pageId: Id<"pages">,
  { canEdit, region }: { canEdit: boolean; region: RefObject<HTMLElement | null> },
) {
  const heartbeat = useMutation(api.presence.heartbeat);
  const leave = useMutation(api.presence.leave);
  const rows = useQueryTolerant(api.presence.listForPage, { pageId });
  const [now, setNow] = useState(() => Date.now());
  const lastActivityRef = useRef(0);
  const reportedEditingRef = useRef(false);
  const lastSentRef = useRef(0);
  const canEditRef = useRef(canEdit);
  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  useEffect(() => {
    let cancelled = false;
    const visible = () => document.visibilityState === "visible";
    const isEditing = () =>
      canEditRef.current && Date.now() - lastActivityRef.current < PAGE_PRESENCE_REFRESH_MS;

    const send = () => {
      if (cancelled || !visible()) return;
      const editing = isEditing();
      reportedEditingRef.current = editing;
      lastSentRef.current = Date.now();
      void heartbeat({ pageId, editing }).catch(() => {});
    };

    const onActivity = (event: Event) => {
      const element = region.current;
      const target = event.target;
      if (!element || !(target instanceof HTMLElement) || !element.contains(target)) return;
      // Tab preko dugmadi nije uređivanje: računa se samo polje za pisanje.
      const writable =
        target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if (!writable) return;
      lastActivityRef.current = Date.now();
      if (
        !reportedEditingRef.current &&
        canEditRef.current &&
        Date.now() - lastSentRef.current > EAGER_HEARTBEAT_GAP_MS
      ) {
        send();
      }
    };

    send();
    const interval = window.setInterval(() => {
      setNow(Date.now());
      send();
    }, PAGE_PRESENCE_REFRESH_MS);
    const onVisibility = () => {
      if (visible()) {
        setNow(Date.now());
        send();
      }
    };
    const onHide = () => void leave({ pageId }).catch(() => {});
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("focusin", onActivity);
    document.addEventListener("input", onActivity, true);
    window.addEventListener("pagehide", onHide);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("focusin", onActivity);
      document.removeEventListener("input", onActivity, true);
      window.removeEventListener("pagehide", onHide);
      reportedEditingRef.current = false;
      void leave({ pageId }).catch(() => {});
    };
  }, [heartbeat, leave, pageId, region]);

  const editors = useMemo(() => activeEditors(rows, now), [rows, now]);
  return { editors };
}
