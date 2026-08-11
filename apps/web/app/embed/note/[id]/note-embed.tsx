"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { RichTextEditor } from "@/components/rich-text-editor";

/**
 * Embed editora beleške u mobilnom `WebView`-u (M3.2).
 *
 * KORAK 1 (ovaj fajl za sada): samo MERNI PROTOTIP (`pageId === 'probe'`) —
 * renderuje PRAVI `RichTextEditor` (istu komponentu koja se šalje) sa ~2000 reči,
 * BEZ auth-a i BEZ snimanja, uz mali HUD (ready/warm/kucanja). Postoji da se na
 * fizičkom uređaju izmeri latencija PRE nego što se izgradi pun editor.
 *
 * KORAK 2 (posle mernog gejta): prava grana dobija auth ljusku iz `canvas-embed.tsx`
 * (`window.__DEVOTION_AUTH__` → `ConvexReactClient`), `api.pages.get`/`pageFiles.list`,
 * autosave kroz `api.areasV2.updatePage` (650 ms, revizija, `KONFLIKT_IZMENA`). Dok
 * gejt ne prođe, mobilni ekran beleške i dalje pokazuje placeholder, pa ova grana nije
 * u upotrebi.
 */
export function NoteEmbed({ pageId }: { pageId: string }) {
  if (pageId === "probe") return <ProbeEditor />;

  // Pun editor stiže posle mernog gejta (KORAK 2). Neutralno stanje dok se ne izgradi —
  // mobilni ekran beleške ovu granu još ne otvara.
  return (
    <div
      role="status"
      className="fixed inset-0 grid place-items-center bg-background px-6 text-center text-sm text-muted-foreground"
    >
      Editor beleške je u pripremi.
    </div>
  );
}

/** ~2000 reči realnog sadržaja — dužina dokumenta je ono što opterećuje ProseMirror. */
function buildProbeContent(): string {
  const para =
    "Ovaj pasus postoji da napuni editor stvarnim tekstom kako bi se izmerilo kašnjenje kucanja na dugačkom dokumentu, jer ProseMirror obrađuje celu transakciju na svaki pritisak tastera i dužina dokumenta direktno utiče na latenciju koju osećaš dok pišeš belešku na telefonu u pokretu bez laptopa pri ruci.";
  const para2 =
    "Drugi pasus dodaje još težine dokumentu da bi merenje bilo bliže stvarnoj belešci sa nekoliko ekrana teksta, jer kratak dokument nikad ne otkrije usporenje koje se pojavi tek kad editor mora da preračuna raspored preko više stotina reči odjednom.";
  const parts: string[] = [];
  parts.push("<h1>Merni dokument (~2000 reči)</h1>");
  parts.push(
    "<p>Kucaj bilo gde u tekstu. Snimi 240fps kamerom drugog telefona i izbroj frejmove od dodira do slova. Skroluj do dna i kucaj tamo da proveriš da tastatura ne prekriva kursor.</p>",
  );
  for (let i = 1; i <= 13; i++) {
    parts.push(`<h2>Odeljak ${i}</h2>`);
    parts.push(`<p>${para} <strong>Podebljani deo ${i}.</strong> <em>Kurzivni deo ${i}.</em></p>`);
    parts.push(`<p>${para2}</p>`);
    parts.push(`<p>${para}</p>`);
    if (i % 3 === 0) {
      parts.push(
        "<ul><li>Prva stavka liste.</li><li>Druga stavka liste.</li><li>Treća stavka liste.</li></ul>",
      );
    }
    if (i % 4 === 0) {
      parts.push(
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Nezavršen zadatak.</p></div></li><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>Završen zadatak.</p></div></li></ul>',
      );
    }
    if (i % 5 === 0) {
      parts.push("<blockquote><p>Citat radi provere blok elemenata.</p></blockquote>");
      parts.push("<pre><code>const x = 1;\nconsole.log(x);</code></pre>");
    }
  }
  return parts.join("");
}

/**
 * Merni prototip. Meri:
 *  - `ready`: `performance.now()` (od navigacije stranice) kad se `.tiptap` prvi put
 *    pojavi u DOM-u — proxy za cold „otvori → prvi mogući unos".
 *  - `warm`: delta od „Ponovo montiraj" klika do ponovnog `.tiptap` (re-init editora
 *    bez reload-a stranice — donja granica; pun reload embed-a je uvek mrežni).
 *  - `kucanja`: broj `onUpdate` događaja (potvrda da unos stiže; latencija se meri kamerom).
 */
function ProbeEditor() {
  const content = useMemo(() => buildProbeContent(), []);
  const [remount, setRemount] = useState(0);
  const [readyMs, setReadyMs] = useState<number | null>(null);
  const [warmMs, setWarmMs] = useState<number | null>(null);
  const [keystrokes, setKeystrokes] = useState(0);
  const warmStartRef = useRef<number | null>(null);

  // Detektuj pojavu editabilnog `.tiptap` elementa (RichTextEditor prikazuje skeleton dok
  // Tiptap nije spreman, pa tek onda `EditorContent`). `MutationObserver` (ne rAF): tačan je
  // i okida se i kad tab nije u prvom planu — rAF se guši u pozadinskom WebView-u.
  useEffect(() => {
    const record = () => {
      const now = performance.now();
      if (warmStartRef.current !== null) {
        setWarmMs(Math.round(now - warmStartRef.current));
        warmStartRef.current = null;
      } else {
        setReadyMs((prev) => (prev === null ? Math.round(now) : prev));
      }
    };
    if (document.querySelector(".tiptap")) {
      record();
      return;
    }
    const observer = new MutationObserver(() => {
      if (document.querySelector(".tiptap")) {
        record();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [remount]);

  return (
    <div className="fixed inset-0 flex flex-col bg-background text-foreground">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-muted/40 px-3 py-2 text-xs">
        <Metric label="Ready" value={readyMs} budget={1500} />
        <Metric label="Warm" value={warmMs} budget={500} />
        <span className="font-semibold tabular-nums">Kucanja: {keystrokes}</span>
        <button
          type="button"
          onClick={() => {
            warmStartRef.current = performance.now();
            setWarmMs(null);
            setRemount((n) => n + 1);
          }}
          className="rounded-md border border-border px-2 py-1 font-medium hover:bg-accent"
        >
          Ponovo montiraj
        </button>
        <span className="text-muted-foreground">keystroke→glyph: 240fps kamera</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        <RichTextEditor
          key={remount}
          documentKey="probe"
          content={content}
          onChange={() => setKeystrokes((n) => n + 1)}
        />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  budget,
}: {
  label: string;
  value: number | null;
  budget: number;
}) {
  const tone =
    value === null ? "text-muted-foreground" : value < budget ? "text-success" : "text-destructive";
  return (
    <span className="font-semibold tabular-nums">
      {label}: <span className={tone}>{value === null ? "—" : `${value} ms`}</span>
    </span>
  );
}
