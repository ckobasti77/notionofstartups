"use client";

import { useId, useState } from "react";
import { CheckSquare2, FileText } from "lucide-react";

import { MotionDialog } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { IDEA_TEXT_MAX, IDEA_TITLE_MAX, ideaDraftError } from "./ideas-model";

/**
 * Nova ideja (ili nova grana sa Mape). Ideja odmah ide u fazu „Predlog";
 * boja se ne bira (boja je samo oznaka na Mapi, PROSTOR P17). `MotionDialog`
 * vraća fokus na dugme koje ga je otvorilo.
 */
export function IdeaCreateDialog({
  open,
  onOpenChange,
  parentTitle,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nova grana: naslov ideje-roditelja. */
  parentTitle: string | null;
  onCreate: (draft: { title: string; text: string }) => Promise<boolean>;
}) {
  const formId = useId();
  const titleId = useId();
  const textId = useId();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const dirty = title.trim().length > 0 || text.trim().length > 0;
  const error = ideaDraftError({ title, text });

  function reset() {
    setTitle("");
    setText("");
  }

  function requestClose() {
    if (pending) return;
    if (dirty && !window.confirm("Odbaciti nesačuvanu ideju?")) return;
    reset();
    onOpenChange(false);
  }

  async function submit() {
    if (error !== null || pending) return;
    setPending(true);
    try {
      if (await onCreate({ title: title.trim(), text: text.trim() })) {
        reset();
        onOpenChange(false);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <MotionDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}
      title={parentTitle ? "Nova grana ideje" : "Nova ideja"}
      description={parentTitle ? `Ispod „${parentTitle}”.` : undefined}
      width="32rem"
      initialFocus={() => document.getElementById(titleId)}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={requestClose} disabled={pending}>
            Otkaži
          </Button>
          <Button type="submit" form={formId} disabled={error !== null || pending}>
            {pending ? "Čuvam…" : "Dodaj ideju"}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor={titleId} className="text-sm font-medium">
            Naslov
          </label>
          <Input id={titleId} value={title} maxLength={IDEA_TITLE_MAX} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={textId} className="text-sm font-medium">
            Šta predlažeš i zašto?
          </label>
          <Textarea
            id={textId}
            value={text}
            maxLength={IDEA_TEXT_MAX}
            className="min-h-28"
            onChange={(event) => setText(event.target.value)}
          />
        </div>
      </form>
    </MotionDialog>
  );
}

/**
 * „Pretvori u zadatak ili belešku" (PROSTOR P6): samo u fazi „Odobreno" i
 * samo autor, vlasnik startupa ili admin — server proverava isto.
 */
export function IdeaConvertDialog({
  open,
  onOpenChange,
  ideaTitle,
  areas,
  onConvert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ideaTitle: string;
  areas: ReadonlyArray<{ _id: string; label: string }>;
  onConvert: (input: { kind: "task" | "note"; areaId: string }) => Promise<boolean>;
}) {
  const areaFieldId = useId();
  const [kind, setKind] = useState<"task" | "note">("task");
  const [areaId, setAreaId] = useState<string>(areas[0]?._id ?? "");
  const [pending, setPending] = useState(false);
  const area = areas.some((item) => item._id === areaId) ? areaId : (areas[0]?._id ?? "");

  async function submit() {
    if (!area || pending) return;
    setPending(true);
    try {
      if (await onConvert({ kind, areaId: area })) onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  const options = [
    { value: "task" as const, label: "Zadatak", icon: CheckSquare2 },
    { value: "note" as const, label: "Beleška", icon: FileText },
  ];

  return (
    <MotionDialog
      open={open}
      onOpenChange={(next) => (!pending ? onOpenChange(next) : undefined)}
      title="Pretvori u zadatak ili belešku"
      description={`„${ideaTitle}” postaje stranica u izabranoj oblasti.`}
      width="28rem"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Otkaži
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!area || pending}>
            {pending ? "Pretvaram…" : "Pretvori"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Vrsta" className="grid grid-cols-2 gap-2">
          {options.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={kind === value}
              onClick={() => setKind(value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  setKind(value === "task" ? "note" : "task");
                  event.currentTarget.parentElement?.querySelector<HTMLElement>(`[aria-checked="false"]`)?.focus();
                }
              }}
              tabIndex={kind === value ? 0 : -1}
              className={cn(
                "flex h-10 items-center gap-2 rounded-md border px-3 text-sm outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
                kind === value && "border-primary bg-accent text-accent-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <label htmlFor={areaFieldId} className="text-sm font-medium">
            Oblast
          </label>
          <Select value={area} onValueChange={setAreaId}>
            <SelectTrigger id={areaFieldId}>
              <SelectValue placeholder="Izaberi oblast" />
            </SelectTrigger>
            <SelectContent>
              {areas.map((item) => (
                <SelectItem key={item._id} value={item._id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </MotionDialog>
  );
}

/** „Ugnezdi u…" sa Mape ideja: bira se ideja-roditelj (bez same ideje). */
export function IdeaNestDialog({
  open,
  onOpenChange,
  ideaTitle,
  candidates,
  onNest,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ideaTitle: string;
  candidates: ReadonlyArray<{ _id: string; title: string }>;
  onNest: (parentId: string) => Promise<boolean>;
}) {
  const fieldId = useId();
  const [parentId, setParentId] = useState("");
  const [pending, setPending] = useState(false);
  // Izbor iz prethodnog otvaranja (druga ideja) ne važi ako više nije kandidat.
  const parent = candidates.some((item) => item._id === parentId) ? parentId : "";

  async function submit() {
    if (!parent || pending) return;
    setPending(true);
    try {
      if (await onNest(parent)) {
        setParentId("");
        onOpenChange(false);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <MotionDialog
      open={open}
      onOpenChange={(next) => (!pending ? onOpenChange(next) : undefined)}
      title="Ugnezdi u…"
      description={`„${ideaTitle}” prelazi ispod izabrane ideje.`}
      width="28rem"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Otkaži
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!parent || pending}>
            Ugnezdi
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <label htmlFor={fieldId} className="text-sm font-medium">
          Nadređena ideja
        </label>
        <Select value={parent} onValueChange={setParentId}>
          <SelectTrigger id={fieldId}>
            <SelectValue placeholder="Izaberi ideju" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((item) => (
              <SelectItem key={item._id} value={item._id}>
                {item.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </MotionDialog>
  );
}
