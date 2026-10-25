"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import {
  groupShortcuts,
  isTypingTarget,
  matchShortcut,
  SHELL_SHORTCUTS,
  type ShortcutDef,
  type ShortcutGroup,
} from "@/lib/shortcuts/registry";

import { ShortcutHelpDialog } from "./shortcut-help-dialog";

type Registration = {
  defs: ReadonlyArray<ShortcutDef>;
  handler: (id: string, event: KeyboardEvent) => void;
};

type ShortcutContextValue = {
  register: (registration: RefObject<Registration>) => () => void;
  openHelp: () => void;
};

const ShortcutContext = createContext<ShortcutContextValue | null>(null);

/** Otvoren modalni sloj (dijalog, sheet, meni) — tada obične prečice ćute. */
const OPEN_LAYER_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
].join(",");

function isMacPlatform() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
}

/**
 * Jedan `keydown` slušalac za celu ljusku (plan K01 §5). Komponente prijavljuju
 * prečice kroz `useShortcuts`; najnovija prijava ima prednost. `?` otvara
 * dijalog pomoći sa svim trenutno aktivnim prečicama.
 */
export function ShortcutProvider({ children }: { children: ReactNode }) {
  const registrations = useRef(new Set<RefObject<Registration>>());
  const [help, setHelp] = useState<{
    open: boolean;
    groups: Array<{ group: ShortcutGroup; defs: ShortcutDef[] }>;
    isMac: boolean;
  }>({ open: false, groups: [], isMac: false });

  const openHelp = useCallback(() => {
    const defs = [...registrations.current].flatMap((entry) => entry.current?.defs ?? []);
    setHelp({ open: true, groups: groupShortcuts(defs), isMac: isMacPlatform() });
  }, []);

  const register = useCallback((registration: RefObject<Registration>) => {
    registrations.current.add(registration);
    return () => {
      registrations.current.delete(registration);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;
      const typing =
        isTypingTarget(event.target) ||
        (typeof document !== "undefined" && isTypingTarget(document.activeElement));
      const dialogOpen = document.querySelector(OPEN_LAYER_SELECTOR) !== null;
      const shortcutEvent = {
        key: event.key,
        code: event.code,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        repeat: event.repeat,
        typing,
        dialogOpen,
      };
      // Najnovija prijava ima prednost (prikaz preko ljuske).
      for (const registration of [...registrations.current].reverse()) {
        const current = registration.current;
        if (!current) continue;
        const id = matchShortcut(shortcutEvent, current.defs);
        if (id === null) continue;
        event.preventDefault();
        current.handler(id, event);
        return;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(() => ({ register, openHelp }), [register, openHelp]);

  return (
    <ShortcutContext.Provider value={value}>
      <HelpShortcut />
      {children}
      <ShortcutHelpDialog
        open={help.open}
        onOpenChange={(open) => setHelp((current) => ({ ...current, open }))}
        groups={help.groups}
        isMac={help.isMac}
      />
    </ShortcutContext.Provider>
  );
}

function HelpShortcut() {
  const context = useContext(ShortcutContext);
  useShortcuts([SHELL_SHORTCUTS.help], () => context?.openHelp());
  return null;
}

/**
 * Prijavi prečice dok je komponenta montirana (i `enabled`). `onTrigger` dobija
 * `id` definicije. Definicije se čitaju iz poslednjeg rendera.
 */
export function useShortcuts(
  defs: ReadonlyArray<ShortcutDef>,
  onTrigger: (id: string, event: KeyboardEvent) => void,
  enabled = true,
): void {
  const context = useContext(ShortcutContext);
  const registration = useRef<Registration>({ defs, handler: onTrigger });
  useLayoutEffect(() => {
    registration.current = { defs, handler: onTrigger };
  });
  useEffect(() => {
    if (!enabled || !context) return;
    return context.register(registration);
  }, [context, enabled]);
}

/** Otvori dijalog pomoći iz koda (npr. dugme „Prečice"). */
export function useOpenShortcutHelp(): () => void {
  const context = useContext(ShortcutContext);
  return useCallback(() => context?.openHelp(), [context]);
}
