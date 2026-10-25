"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import {
  CALENDAR_WEEKDAYS,
  calendarMoveForKey,
  datePickerChips,
  dayAriaLabel,
  dayKeyOf,
  dayKeyOfDue,
  dueFromDayKey,
  ENTER_OFFSET_PX,
  formatDateShort,
  formatMonthTitle,
  monthGrid,
  monthKeyOf,
  moveCalendarFocus,
  selectedDatePickerChip,
  SR_WEEKDAYS,
  type DayKey,
} from "@devotion/shared";

import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { reducedFade, standardTween, useTweenSlots } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type DatePickerPanelProps = {
  /** Lokalno podne izabranog dana ili `null`. */
  value: number | null;
  now: number;
  /** Izbor čipa ili dana — uvek lokalno podne (ili `null` za „Bez roka"). */
  onSelect: (value: number | null) => void;
  /** Čip „Bez roka" (podrazumevano da). */
  allowClear?: boolean;
  className?: string;
};

/**
 * Sadržaj birača datuma (P9, plan K07 §1.4): čipovi brzog izbora (Danas,
 * Sutra, Vikend, Sledeće nedelje, Bez roka) i mesečni kalendar — ponedeljak
 * prvi, srpski nazivi. Tastatura po obrascu WAI-ARIA: strelice dan/nedelja,
 * PageUp/PageDown mesec (Shift: godina), Home/End početak i kraj nedelje,
 * Enter/Space bira. Vrednost je lokalno podne (shared `dueFromDayKey`).
 */
export function DatePickerPanel({ value, now, onSelect, allowClear = true, className }: DatePickerPanelProps) {
  const todayKey = dayKeyOf(now);
  const selectedKey = dayKeyOfDue(value);
  const [focusKey, setFocusKey] = useState<DayKey>(selectedKey ?? todayKey);
  const month = monthKeyOf(focusKey);
  const weeks = useMemo(() => monthGrid(month, { todayKey, selectedKey }), [month, todayKey, selectedKey]);
  const chips = useMemo(() => datePickerChips(now, { allowClear }), [now, allowClear]);
  const selectedChip = selectedDatePickerChip(value, now);
  const titleId = useId();

  const gridRef = useRef<HTMLDivElement>(null);
  // Fokus prati aktivan dan samo kad je korisnik već u mreži (tastatura).
  const moveFocusToGrid = useRef(false);
  const previousMonth = useRef(month);
  const play = useTweenSlots();

  useLayoutEffect(() => {
    if (!moveFocusToGrid.current) return;
    moveFocusToGrid.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>('[data-active-day="true"]')?.focus({ preventScroll: true });
  }, [focusKey]);

  useLayoutEffect(() => {
    if (previousMonth.current === month) return;
    const direction = month > previousMonth.current ? 1 : -1;
    previousMonth.current = month;
    const grid = gridRef.current;
    if (!grid) return;
    // Promena meseca: mreža doputuje ±8 px uz neprozirnost (plan K07 §4.2).
    play("month", ({ gsap, reduced }) =>
      reduced
        ? gsap.fromTo(grid, { opacity: 0 }, { opacity: 1, ...reducedFade(), clearProps: "opacity" })
        : gsap.fromTo(
            grid,
            { opacity: 0, x: ENTER_OFFSET_PX * direction },
            { opacity: 1, x: 0, ...standardTween("quick"), clearProps: "opacity,transform" },
          ),
    );
  }, [month, play]);

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Alt+← (nazad u pregledaču) i Ctrl/⌘ prečice pripadaju pregledaču.
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const move = calendarMoveForKey(event.key, event.shiftKey);
    if (move === null) return;
    event.preventDefault();
    moveFocusToGrid.current = true;
    setFocusKey((current) => moveCalendarFocus(current, move));
  };

  const stepMonth = (delta: -1 | 1) =>
    setFocusKey((current) => moveCalendarFocus(current, delta === 1 ? "nextMonth" : "prevMonth"));

  return (
    <div className={cn("w-[17.5rem] space-y-3 pointer-coarse:w-[20.5rem]", className)}>
      <div role="group" aria-label="Brzi izbor" className="flex flex-wrap gap-1.5">
        {chips.map((chip) => {
          const selected = selectedChip === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              aria-pressed={selected}
              title={chip.value === null ? undefined : formatDateShort(chip.value)}
              onClick={() => onSelect(chip.value)}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors",
                selected
                  ? "border-primary/60 bg-accent text-accent-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {selected ? <Check className="size-3" aria-hidden="true" /> : null}
              {chip.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p id={titleId} aria-live="polite" className="pl-1 text-sm font-semibold">
            {formatMonthTitle(month)}
          </p>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="Prethodni mesec"
              onClick={() => stepMonth(-1)}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Sledeći mesec"
              onClick={() => stepMonth(1)}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div ref={gridRef} role="grid" aria-labelledby={titleId} onKeyDown={onGridKeyDown} className="select-none">
          <div role="row" className="grid grid-cols-7">
            {CALENDAR_WEEKDAYS.map((label, index) => (
              <span
                key={label}
                role="columnheader"
                aria-label={SR_WEEKDAYS[index]}
                className="grid h-7 place-items-center text-[0.6875rem] font-medium text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0].key} role="row" className="grid grid-cols-7">
              {week.map((day) => {
                const active = day.key === focusKey;
                return (
                  <span key={day.key} role="gridcell" aria-selected={day.isSelected} className="grid place-items-center p-px">
                    <button
                      type="button"
                      tabIndex={active ? 0 : -1}
                      data-active-day={active ? "true" : undefined}
                      aria-label={dayAriaLabel(day.key, todayKey)}
                      aria-pressed={day.isSelected}
                      onClick={() => onSelect(dueFromDayKey(day.key))}
                      onFocus={() => setFocusKey(day.key)}
                      className={cn(
                        "relative grid size-9 place-items-center rounded-lg text-sm tabular-nums transition-colors pointer-coarse:size-10",
                        day.isSelected
                          ? "bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                          : day.inMonth
                            ? "text-foreground hover:bg-muted"
                            : "text-muted-foreground hover:bg-muted/60",
                        day.isToday && !day.isSelected && "font-semibold text-primary",
                      )}
                    >
                      {day.day}
                      {day.isToday ? (
                        <span
                          aria-hidden="true"
                          className={cn(
                            "absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full",
                            day.isSelected ? "bg-primary-foreground" : "bg-primary",
                          )}
                        />
                      ) : null}
                    </button>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <p className="px-1 text-[0.6875rem] leading-4 text-muted-foreground pointer-coarse:hidden">
          Strelice biraju dan, Enter potvrđuje.
        </p>
      </div>
    </div>
  );
}

export type DatePickerProps = {
  value: number | null;
  onChange: (value: number | null) => void;
  now: number;
  /** Okidač (renderuje se kroz `PopoverTrigger asChild`). */
  children: ReactNode;
  /**
   * Element uz koji se popover postavlja umesto uz okidač (npr. desna ivica
   * reda kad je okidač sakriven na dodiru ili kad ga otvara prečica `d`).
   */
  anchor?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  allowClear?: boolean;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  /** Gde ide fokus posle zatvaranja (podrazumevano okidač, Radix). */
  onCloseAutoFocus?: (event: Event) => void;
};

/**
 * Birač datuma (P9): popover sa čipovima i kalendarom; izbor zatvara popover.
 * Pri otvaranju fokus dobija izabrani dan (ili danas), pa strelice odmah rade.
 * Zamenjuje izvorni datumski input (mm/dd/yyyy) za rok zadatka svuda: lični
 * nivo od K11, zadaci u startupu od K17.
 */
export function DatePicker({
  value,
  onChange,
  now,
  children,
  anchor,
  open: controlledOpen,
  onOpenChange,
  allowClear = true,
  align = "start",
  side = "bottom",
  onCloseAutoFocus,
}: DatePickerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      {/* Posle okidača: Radix uzima poslednji prikačen element kao sidro (ref callback). */}
      {anchor ? <PopoverAnchor asChild>{anchor}</PopoverAnchor> : null}
      <PopoverContent
        ref={contentRef}
        align={align}
        side={side}
        aria-label="Izaberi rok"
        collisionPadding={12}
        className="w-auto"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.querySelector<HTMLButtonElement>('[data-active-day="true"]')?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {open ? (
          <DatePickerPanel
            value={value}
            now={now}
            allowClear={allowClear}
            onSelect={(next) => {
              setOpen(false);
              onChange(next);
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
