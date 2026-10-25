"use client";

import { useId, type ReactNode, type RefObject } from "react";
import { ChevronDown, ListFilter, Search, X } from "lucide-react";
import {
  activeFilterCount,
  clearTaskFilters,
  DUE_BUCKET_LABELS,
  hasActiveFilters,
  PERSONAL_FILTER_KEY,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_FILTER_DUE,
  TASK_FILTER_PRIORITIES,
  TASK_FILTER_STATUSES,
  TASK_GROUP_BY_OPTIONS,
  toggleFilterValue,
  type StartupMini,
  type TaskFilters,
  type TaskGroupBy,
} from "@devotion/shared";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { StartupChip } from "../startup-chip";

type Option = { value: string; label: string; leading?: ReactNode };

function filterOptions(startups: ReadonlyArray<StartupMini>) {
  return {
    startup: [
      { value: PERSONAL_FILTER_KEY, label: "Lično", leading: <StartupChip startup={null} size="xs" /> },
      ...startups.map((startup) => ({
        value: startup._id,
        label: startup.name,
        leading: <StartupChip startup={startup} size="xs" />,
      })),
    ] satisfies Option[],
    status: TASK_FILTER_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] })) satisfies Option[],
    priority: TASK_FILTER_PRIORITIES.map((priority) => ({
      value: priority,
      label: priority === "none" ? "Bez prioriteta" : PRIORITY_LABELS[priority],
    })) satisfies Option[],
    due: TASK_FILTER_DUE.map((bucket) => ({ value: bucket, label: DUE_BUCKET_LABELS[bucket] })) satisfies Option[],
  };
}

type Category = { id: "startup" | "status" | "priority" | "due"; label: string; values: string[]; options: Option[] };

function categories(filters: TaskFilters, startups: ReadonlyArray<StartupMini>): Category[] {
  const options = filterOptions(startups);
  return [
    { id: "startup", label: "Startup", values: filters.startupIds, options: options.startup },
    { id: "status", label: "Status", values: filters.statuses, options: options.status },
    { id: "priority", label: "Prioritet", values: filters.priorities, options: options.priority },
    { id: "due", label: "Rok", values: filters.due, options: options.due },
  ];
}

function toggled(filters: TaskFilters, category: Category["id"], value: string): TaskFilters {
  switch (category) {
    case "startup":
      return { ...filters, startupIds: toggleFilterValue(filters.startupIds, value) };
    case "status":
      return { ...filters, statuses: toggleFilterValue(filters.statuses, value as TaskFilters["statuses"][number]) };
    case "priority":
      return { ...filters, priorities: toggleFilterValue(filters.priorities, value as TaskFilters["priorities"][number]) };
    case "due":
      return { ...filters, due: toggleFilterValue(filters.due, value as TaskFilters["due"][number]) };
  }
}

export type TaskFilterBarProps = {
  filters: TaskFilters;
  startups: ReadonlyArray<StartupMini>;
  onChange: (filters: TaskFilters) => void;
  groupBy: TaskGroupBy;
  onGroupByChange: (groupBy: TaskGroupBy) => void;
  searchRef: RefObject<HTMLInputElement | null>;
};

/**
 * Traka filtera Mojih zadataka (plan K07 §1.3): pretraga, Startup / Status /
 * Prioritet / Rok (`DropdownMenu` sa čekiranjem), „Očisti filtere",
 * grupisanje i „Prikaži završene". Ispod `md` filteri su jedno dugme
 * „Filteri (n)" koje otvara donji sheet, a grupisanje je `Select`.
 */
export function TaskFilterBar({ filters, startups, onChange, groupBy, onGroupByChange, searchRef }: TaskFilterBarProps) {
  const groups = categories(filters, startups);
  const count = activeFilterCount(filters);
  const showDoneId = useId();
  const groupLabelId = useId();

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <SearchField
          value={filters.query}
          onChange={(query) => onChange({ ...filters, query })}
          inputRef={searchRef}
        />
        <div className="hidden flex-wrap items-center gap-1.5 md:flex">
          {groups.map((category) => (
            <FilterMenu
              key={category.id}
              category={category}
              onToggle={(value) => onChange(toggled(filters, category.id, value))}
            />
          ))}
          {hasActiveFilters(filters) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(clearTaskFilters(filters));
                // Dugme nestaje: fokus na pretragu.
                searchRef.current?.focus();
              }}
            >
              <X aria-hidden="true" />
              Očisti filtere
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <FilterSheet groups={groups} count={count} filters={filters} onChange={onChange} />
          <Select value={groupBy} onValueChange={(value) => onGroupByChange(value as TaskGroupBy)}>
            <SelectTrigger aria-label="Grupiši" className="h-11 flex-1 rounded-xl bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_GROUP_BY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  Grupiši: {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-labelledby={groupLabelId} className="hidden items-center gap-2 md:flex">
          <span id={groupLabelId} className="text-xs text-muted-foreground">
            Grupiši:
          </span>
          <div className="inline-flex rounded-xl border bg-card p-0.5">
            {TASK_GROUP_BY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={groupBy === option.value}
                onClick={() => onGroupByChange(option.value)}
                className={cn(
                  "inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium transition-colors",
                  groupBy === option.value
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <label htmlFor={showDoneId} className="ml-auto flex min-h-9 cursor-pointer items-center gap-2 text-sm pointer-coarse:min-h-11">
          <Switch
            id={showDoneId}
            checked={filters.showDone}
            onCheckedChange={(showDone) => onChange({ ...filters, showDone })}
          />
          Prikaži završene
        </label>
      </div>
    </div>
  );
}

function SearchField({
  value,
  onChange,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="relative min-w-0 md:w-72 lg:w-80">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          // Prvi Esc briše upit, drugi izlazi iz polja (prečice liste opet rade).
          if (value) onChange("");
          else event.currentTarget.blur();
        }}
        placeholder="Pretraži zadatke…"
        aria-label="Pretraži zadatke"
        className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-16 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden"
      />
      <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {value ? (
          <button
            type="button"
            aria-label="Obriši pretragu"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : (
          <span aria-hidden="true" className="hidden md:pointer-fine:inline-flex">
            <Kbd>/</Kbd>
          </span>
        )}
      </span>
    </div>
  );
}

function FilterMenu({ category, onToggle }: { category: Category; onToggle: (value: string) => void }) {
  const active = category.values.length;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={active > 0 ? `${category.label}, izabrano: ${active}` : category.label}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm transition-colors data-[state=open]:bg-accent",
          active > 0
            ? "border-primary/60 bg-accent text-accent-foreground"
            : "border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )}
      >
        {category.label}
        {active > 0 ? <span className="rounded-full bg-primary px-1.5 font-mono text-[0.6875rem] tabular-nums text-primary-foreground">{active}</span> : null}
        <ChevronDown className="size-3.5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
        <DropdownMenuLabel>{category.label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {category.options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={category.values.includes(option.value)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => onToggle(option.value)}
            className="gap-2 pointer-coarse:min-h-11"
          >
            {option.leading}
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilterSheet({
  groups,
  count,
  filters,
  onChange,
}: {
  groups: Category[];
  count: number;
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" className="h-11 rounded-xl" aria-label={count > 0 ? `Filteri, ${count} aktivno` : "Filteri"}>
          <ListFilter aria-hidden="true" />
          Filteri{count > 0 ? ` (${count})` : ""}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader>
          <SheetTitle>Filteri</SheetTitle>
          <SheetDescription>Izbor važi odmah.</SheetDescription>
        </SheetHeader>
        <div className="space-y-5">
          {groups.map((category) => (
            <fieldset key={category.id} className="space-y-1.5">
              <legend className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">{category.label}</legend>
              <div className="flex flex-wrap gap-1.5">
                {category.options.map((option) => {
                  const checked = category.values.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => onChange(toggled(filters, category.id, option.value))}
                      className={cn(
                        "inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                        checked
                          ? "border-primary/60 bg-accent text-accent-foreground"
                          : "border-border bg-card text-muted-foreground",
                      )}
                    >
                      {option.leading}
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
          {hasActiveFilters(filters) ? (
            <Button type="button" variant="ghost" className="h-11" onClick={() => onChange(clearTaskFilters(filters))}>
              <X aria-hidden="true" />
              Očisti filtere
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
