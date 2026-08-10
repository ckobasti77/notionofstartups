"use client";

import { useParams } from "next/navigation";

import { NoteEmbed } from "./note-embed";

/**
 * Embed ruta editora beleške (M3.2, `docs/mobile/00-PLAN.md` §5.1/§5.2). Pun ekran,
 * bez sidebara i chrome-a (root layout obavija samo providere). Učitava se u mobilnom
 * `WebView`-u; isti auth model kao canvas embed (injekcija tokena pre učitavanja).
 *
 * `id === 'probe'` je merni prototip (KORAK 1) — renderuje PRAVI `RichTextEditor` sa
 * ~2000 reči, bez auth-a i bez snimanja, da se na uređaju izmeri latencija PRE nego što
 * se izgradi pun editor (auth + autosave). Sentinel u `id`-u izbegava `useSearchParams`
 * (a time i `<Suspense>`), isto kao canvas embed.
 */
export default function EmbedNotePage() {
  const params = useParams<{ id: string }>();
  return <NoteEmbed pageId={params.id} />;
}
