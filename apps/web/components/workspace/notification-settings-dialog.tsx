"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { BellRing, Info, Moon } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { NotificationType } from "@/convex/lib/notifications";
import {
  isRowEnabled,
  NOTIFICATION_SETTINGS_GROUPS,
  toggleRow,
  type SettingsRow,
} from "@/convex/lib/notificationSettingsCatalog";

/** Podrazumevani prozor tihih sati pri prvom uključivanju (22:00–08:00). */
const DEFAULT_QUIET_START = 22 * 60;
const DEFAULT_QUIET_END = 8 * 60;

type Settings = {
  mutedTypes: Array<NotificationType>;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
};

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

/** Minuti od ponoći → „HH:MM" za `<input type="time">`. */
function minutesToTime(minutes: number) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** „HH:MM" → minuti od ponoći; `null` za neispravan unos. */
function timeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (match === null) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

/**
 * Web verzija ekrana „Obaveštenja i zvuci" (docs/mobile/03-NOTIFIKACIJE.md
 * sekcija 7). Isti prekidači i tihi sati kao na mobilnom, jer su podešavanja PO
 * PROFILU (`notificationSettings`) — isključen tip važi na svim uređajima.
 *
 * IZUZETAK: nema dugmeta za probu zvuka. Sistemske zvuke obaveštenja pušta OS
 * preko native push-a; web push nema ekvivalent (ni Web Audio ne može da odsvira
 * OS zvuk obaveštenja), pa proba zvuka postoji samo na mobilnom.
 *
 * Podela na omotač (učitavanje) + `SettingsForm` (unos): forma inicijalizuje
 * `useState` iz učitanih podešavanja i montira se tek kad podaci stignu, pa
 * prekidači nikad ne „trepnu" iz default stanja — bez seed-a kroz efekat.
 */
export function NotificationSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const settings = useQuery(api.notificationSettings.get, open ? {} : "skip");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="size-5 text-primary" aria-hidden="true" /> Obaveštenja i zvuci
          </DialogTitle>
          <DialogDescription>
            Šta te obaveštava. Isključen tip važi na svim tvojim uređajima.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-6 overflow-y-auto px-6 py-5">
          {settings === undefined ? (
            <div className="space-y-3">
              <span className="sr-only" role="status" aria-live="polite">
                Učitavanje podešavanja…
              </span>
              <div className="space-y-3" aria-hidden="true">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="h-14 animate-pulse rounded-lg bg-muted/60" />
                ))}
              </div>
            </div>
          ) : (
            <SettingsForm initial={settings} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * `initial` prati server (omotač ga prosleđuje iz realtime upita), ali stanje se
 * inicijalizuje samo pri montiranju — realtime izmene ne gaze korisnikov unos.
 * `initial` se koristi i kao cilj vraćanja ako upis padne (uvek server-istina).
 */
function SettingsForm({ initial }: { initial: Settings }) {
  const update = useMutation(api.notificationSettings.update);
  const [mutedTypes, setMutedTypes] = useState<string[]>(initial.mutedTypes);
  const [quietStart, setQuietStart] = useState<number | null>(initial.quietHoursStart);
  const [quietEnd, setQuietEnd] = useState<number | null>(initial.quietHoursEnd);

  async function persist(next: {
    mutedTypes: string[];
    quietHoursStart: number | null;
    quietHoursEnd: number | null;
  }) {
    try {
      await update({
        // Katalog garantuje poznate tipove; kastujemo za validator.
        mutedTypes: next.mutedTypes as Array<NotificationType>,
        quietHoursStart: next.quietHoursStart,
        quietHoursEnd: next.quietHoursEnd,
      });
    } catch (error) {
      setMutedTypes(initial.mutedTypes);
      setQuietStart(initial.quietHoursStart);
      setQuietEnd(initial.quietHoursEnd);
      toast.error(
        error instanceof Error ? error.message : "Podešavanje nije sačuvano.",
      );
    }
  }

  function onToggleRow(row: SettingsRow, enabled: boolean) {
    const next = toggleRow(row, mutedTypes, enabled);
    setMutedTypes(next);
    void persist({
      mutedTypes: next,
      quietHoursStart: quietStart,
      quietHoursEnd: quietEnd,
    });
  }

  function onToggleQuiet(enabled: boolean) {
    const nextStart = enabled ? quietStart ?? DEFAULT_QUIET_START : null;
    const nextEnd = enabled ? quietEnd ?? DEFAULT_QUIET_END : null;
    setQuietStart(nextStart);
    setQuietEnd(nextEnd);
    void persist({ mutedTypes, quietHoursStart: nextStart, quietHoursEnd: nextEnd });
  }

  function onChangeTime(which: "start" | "end", value: string) {
    const minutes = timeToMinutes(value);
    if (minutes === null) return; // nepotpun/neispravan unos — čekamo validan
    const nextStart = which === "start" ? minutes : quietStart;
    const nextEnd = which === "end" ? minutes : quietEnd;
    setQuietStart(nextStart);
    setQuietEnd(nextEnd);
    void persist({ mutedTypes, quietHoursStart: nextStart, quietHoursEnd: nextEnd });
  }

  const quietOn = quietStart !== null && quietEnd !== null;

  return (
    <>
      {NOTIFICATION_SETTINGS_GROUPS.map((group) => (
        <section key={group.key} className="space-y-1">
          <h3 className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {group.label}
          </h3>
          <div className="divide-y divide-border/60 rounded-lg border">
            {group.rows.map((row) => (
              <div key={row.key} className="flex items-center gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <Label
                    htmlFor={`notif-${row.key}`}
                    className="block text-sm font-medium"
                  >
                    {row.label}
                  </Label>
                  {row.description ? (
                    <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
                      {row.description}
                    </p>
                  ) : null}
                </div>
                <Switch
                  id={`notif-${row.key}`}
                  checked={isRowEnabled(row, mutedTypes)}
                  onCheckedChange={(enabled) => onToggleRow(row, enabled)}
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Tihi sati */}
      <section className="space-y-1">
        <h3 className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Tihi sati
        </h3>
        <div className="rounded-lg border">
          <div className="flex items-center gap-3 px-3.5 py-3">
            <Moon className="size-4 text-muted-foreground" aria-hidden="true" />
            <Label htmlFor="quiet-enabled" className="flex-1 text-sm font-medium">
              Uključeno
            </Label>
            <Switch
              id="quiet-enabled"
              checked={quietOn}
              onCheckedChange={onToggleQuiet}
            />
          </div>
          {quietOn ? (
            <>
              <div className="flex items-end gap-3 border-t px-3.5 py-3">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="quiet-start" className="text-xs text-muted-foreground">
                    Od
                  </Label>
                  <Input
                    id="quiet-start"
                    type="time"
                    value={minutesToTime(quietStart)}
                    onChange={(event) => onChangeTime("start", event.target.value)}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label htmlFor="quiet-end" className="text-xs text-muted-foreground">
                    Do
                  </Label>
                  <Input
                    id="quiet-end"
                    type="time"
                    value={minutesToTime(quietEnd)}
                    onChange={(event) => onChangeTime("end", event.target.value)}
                  />
                </div>
              </div>
              <p className="flex items-center gap-2 border-t px-3.5 py-2.5 text-xs text-muted-foreground">
                <Info className="size-3.5 shrink-0" aria-hidden="true" />
                Rokovi i pominjanja i dalje prolaze.
              </p>
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}
