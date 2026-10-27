/**
 * Fixture podaci Beleški u „Ja" (K18): lične i startup beleške, podbeleške do
 * trećeg nivoa. Redosled je kao sa servera (poslednja izmena prvo, sortirano ispod). Nikad ne
 * idu na server.
 */
import type { NoteItemModel, NoteStartup } from "@/components/me/notes/note-row";

import { IZLOG_STARTUPS } from "./me";
import { IZLOG_NOW } from "./now";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Startupi iz kojih izlog ima beleške: Cluck Rush, Silly Handyman, Scan Me. */
export const IZLOG_NOTE_STARTUPS: NoteStartup[] = IZLOG_STARTUPS.map((startup) => ({
  _id: startup._id,
  name: startup.name,
  logoUrl: startup.logoUrl,
}));

const S = (index: number) => IZLOG_NOTE_STARTUPS[index];

function note(
  n: number,
  startupIndex: number | null,
  title: string,
  text: string,
  ago: number,
  parent: number | null = null,
): NoteItemModel {
  return {
    _id: `thoughtNodes_${String(n).padStart(4, "0")}`,
    startupId: startupIndex === null ? null : S(startupIndex)._id,
    startup: startupIndex === null ? null : S(startupIndex),
    title,
    text,
    parentThoughtId: parent === null ? null : `thoughtNodes_${String(parent).padStart(4, "0")}`,
    updatedAt: IZLOG_NOW - ago,
  };
}

export const IZLOG_NOTES: NoteItemModel[] = [...[
  note(
    1,
    0,
    "Ideja za onboarding",
    "Novi član odmah dobija tri zadatka: upoznavanje sa timom, pristup alatima i prvi mali zadatak.\nProveriti sa Anom da li staje u prvu nedelju.",
    2 * HOUR,
  ),
  note(2, 0, "Podbeleška: tekst poruke dobrodošlice", "Kratko, bez emotikona. Ime i jedna rečenica o timu.", DAY, 1),
  note(3, null, "Oprema za snimanje", "Stativ, dva mikrofona, rasveta.\nPitati Marka za kameru dok ne stigne nova.", 3 * DAY),
  note(4, 4, "Landing za QR menije — pitanja", "Šta je prvi ekran? Da li ide cena odmah?\nKonkurencija pokazuje demo na vrhu.", 5 * HOUR),
  note(5, 4, "Podbeleška: primeri iz restorana", "Tri restorana koja već koriste QR meni, sa screenshotovima.", 2 * DAY, 4),
  note(6, 4, "Treći nivo: pitanja za Marka", "Koliko košta štampa nalepnica?", 2 * DAY + HOUR, 5),
  note(7, 1, "Ponuda za kupatilo", "Obići lokaciju u utorak, izmeriti i poslati okvirnu cenu do petka.", 4 * DAY),
  note(8, null, "Knjige za jesen", "Deep Work, Four Thousand Weeks.", 9 * DAY),
  note(9, 0, "Cena menija za poneti", "Razmisliti o jednoj ceni za sve kombinacije.", 12 * DAY),
].sort((left, right) => right.updatedAt - left.updatedAt)];
