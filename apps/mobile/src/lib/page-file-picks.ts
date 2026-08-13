/**
 * Predprovera serije priloga stranice — klijentsko OGLEDALO serverskih granica iz
 * `packages/backend/convex/lib/page_files.ts`.
 *
 * Zašto postoji: od lanca 6 / P7 galerija i birač dokumenata vraćaju VIŠE fajlova
 * odjednom. Bez ovoga bi svaki nepodržan ili prevelik fajl prošao ceo put
 * (upload URL → POST bloba → `attach`) samo da bi ga server odbio; korisnik bi
 * dobio niz `Alert`-a posle nekoliko sekundi čekanja, a fajl koji ne staje u
 * granicu od `MAX_PAGE_FILES` bi tiho nestao.
 *
 * Server ostaje JEDINI autoritet — `pageFiles.attach` i dalje sam odbija i sam
 * briše blob u istoj transakciji (`pageFiles.ts:206-250`). Ovo je ušteda i
 * poštena poruka, ne provera pristupa.
 *
 * Granice se UVOZE, ne prepisuju: promena na serveru pomera i klijenta. Uvoz je
 * bezbedan iz istog razloga kao u `components/chat/message-composer.tsx` —
 * `lib/page_files.ts` ovde daje samo čiste funkcije i brojeve (tipovi `Doc`/`Id`
 * su `import type`, ne vučemo `_generated` u bundle).
 */
import {
  MAX_PAGE_FILES,
  maxPageFileBytesFor,
  pageFileCategoryFor,
} from '@/convex/lib/page_files';

/** Minimum koji svaki izvor (galerija, kamera, birač dokumenata) ume da da. */
export type PageFilePick = {
  name: string;
  mimeType: string;
  /** `null` kad izvor ne javi veličinu (Android galerija često ne javi). */
  size: number | null;
};

export type RejectedPick = { name: string; reason: string };

export type PageFilePickPlan<T> = {
  /** Fajlovi koji smeju da krenu na upload, u izabranom redosledu. */
  accepted: T[];
  /** Odbijeni sa razlogom — pozivalac ih MORA reći naglas (jedan `Alert`). */
  rejected: RejectedPick[];
};

/**
 * Deli izbor na „ide na upload" i „odbijeno, evo zašto".
 *
 * Redosled provera je isti kao na serveru: tip → veličina → kapacitet. Kapacitet
 * se troši samo prihvaćenim fajlovima, pa nepodržan fajl ne „pojede" mesto.
 *
 * Poruke su doslovno serverske (`pageFiles.attach`) da korisnik ne dobija dve
 * različite formulacije za istu stvar.
 */
export function planPageFilePicks<T extends PageFilePick>({
  existingCount,
  picked,
}: {
  existingCount: number;
  picked: readonly T[];
}): PageFilePickPlan<T> {
  const accepted: T[] = [];
  const rejected: RejectedPick[] = [];

  for (const pick of picked) {
    const category = pageFileCategoryFor(pick.mimeType || undefined, pick.name);
    if (category === null) {
      rejected.push({
        name: pick.name,
        reason: `tip nije podržan${pick.mimeType ? ` (${pick.mimeType})` : ''}`,
      });
      continue;
    }
    const maxBytes = maxPageFileBytesFor(category);
    // `size === null` NE odbija fajl: Android galerija ume da ne vrati veličinu,
    // a odbiti fajl zbog toga što ga ne umemo izmeriti je gore od jednog
    // uzaludnog upload-a. Server ga izmeri iz metapodataka bloba.
    if (pick.size !== null && pick.size > maxBytes) {
      rejected.push({
        name: pick.name,
        reason: `veći od ${Math.round(maxBytes / (1024 * 1024))} MB`,
      });
      continue;
    }
    if (existingCount + accepted.length >= MAX_PAGE_FILES) {
      rejected.push({
        name: pick.name,
        reason: `oblačić može imati najviše ${MAX_PAGE_FILES} fajlova`,
      });
      continue;
    }
    accepted.push(pick);
  }

  return { accepted, rejected };
}

/**
 * Jedna rečenica za `Alert` — imenuje BAŠ odbijene fajlove. „Neki fajlovi nisu
 * poslati" bi ostavilo korisnika da pogađa koji.
 */
export function rejectedPicksMessage(rejected: readonly RejectedPick[]): string {
  return rejected.map((item) => `„${item.name}" — ${item.reason}`).join('\n');
}
