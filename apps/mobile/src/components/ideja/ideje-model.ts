/**
 * Ideje na telefonu (PROSTOR P6, P16; plan K07 §5.9) — ČISTA logika bez React-a:
 * čipovi faza sa brojem, sekcije liste, pretraga, tekstovi i dozvole za prikaz.
 * Server odlučuje o dozvolama (`ideas.list › permissions`); ovde se samo crta
 * isto što on dozvoljava — telefon ništa ne računa sam (R17).
 */
import {
  formatTrashAge,
  IDEA_STAGE_LABELS,
  IDEA_STAGE_ORDER,
  normalizeSearchText,
  stageTargets,
  type IdeaStage,
  type IdeaStoredStage,
} from '@devotion/shared';

export type IdeaVote = 'up' | 'down';

/** Dozvole ideje kako ih vraća `ideas.list`. */
export type IdeaPermissions = {
  canEdit: boolean;
  canVote: boolean;
  canSetStage: boolean;
  canConvert: boolean;
  canArchive: boolean;
  canComment: boolean;
};

/** Onoliko ideje koliko lista i detalj čitaju (podskup `ideas.list › nodes[number]`). */
export type IdeaRowModel = {
  _id: string;
  title: string | null;
  text: string;
  createdAt: number;
  stage: IdeaStage;
  convertedPageId: string | null;
  upvotes: number;
  downvotes: number;
  userVote: IdeaVote | null;
  commentCount: number;
  commentCountCapped: boolean;
  author: { displayName: string } | null;
  permissions: IdeaPermissions;
};

/**
 * Grupe po PRIKAZANOJ fazi. Server već vraća prikazanu fazu u `stage` (pretvorena
 * ideja je „Postalo zadatak"); `convertedPageId` je rezerva ako bi stigao zastareo
 * odgovor. Svaka grupa čuva ulazni redosled.
 */
export function groupByStage<T extends Pick<IdeaRowModel, 'stage' | 'convertedPageId'>>(
  ideas: ReadonlyArray<T>,
): Record<IdeaStage, T[]> {
  const groups: Record<IdeaStage, T[]> = {
    predlog: [],
    razmatra_se: [],
    odobreno: [],
    postalo_zadatak: [],
    odbijeno: [],
  };
  for (const idea of ideas) {
    groups[idea.convertedPageId !== null ? 'postalo_zadatak' : idea.stage].push(idea);
  }
  return groups;
}

/** Čip „Sve" ili jedna faza. */
export type IdeaStageFilter = 'sve' | IdeaStage;

/** Faza koja je na listi skupljena dok je ne otvoriš (Odbijeno, K07 §5.9). */
export const COLLAPSED_STAGE: IdeaStage = 'odbijeno';

/** Čipovi, tim redom: Sve · Predlog · Razmatra se · Odobreno · Postalo zadatak · Odbijeno. */
export const IDEA_STAGE_CHIPS: ReadonlyArray<{ value: IdeaStageFilter; label: string }> = [
  { value: 'sve', label: 'Sve' },
  ...IDEA_STAGE_ORDER.map((stage) => ({ value: stage, label: IDEA_STAGE_LABELS[stage] })),
];

/** Broj ideja po fazi (čip „Razmatra se 5"); „Sve" je zbir svih faza. */
export function stageCounts(ideas: ReadonlyArray<IdeaRowModel>): Record<IdeaStageFilter, number> {
  const groups = groupByStage(ideas);
  const counts = { sve: ideas.length } as Record<IdeaStageFilter, number>;
  for (const stage of IDEA_STAGE_ORDER) counts[stage] = groups[stage].length;
  return counts;
}

/** Oznaka čipa: „Razmatra se 5"; faza bez ideja nosi 0, „Sve" nosi ukupan broj. */
export function chipLabel(label: string, count: number): string {
  return `${label} ${count}`;
}

/** Pretraga po naslovu i tekstu, bez kvačica i velikih slova (kao web). */
export function filterIdeas<T extends Pick<IdeaRowModel, 'title' | 'text'>>(
  ideas: ReadonlyArray<T>,
  query: string,
): T[] {
  const needle = normalizeSearchText(query);
  if (needle === '') return [...ideas];
  return ideas.filter((idea) =>
    normalizeSearchText(`${idea.title ?? ''} ${idea.text}`).includes(needle),
  );
}

/** Najnovije prvo (stabilno: isti `createdAt` zadržava ulazni redosled). */
export function newestFirst<T extends Pick<IdeaRowModel, 'createdAt'>>(ideas: ReadonlyArray<T>): T[] {
  return ideas
    .map((idea, index) => ({ idea, index }))
    .sort((a, b) => b.idea.createdAt - a.idea.createdAt || a.index - b.index)
    .map((entry) => entry.idea);
}

export type IdeaSection<T> = {
  stage: IdeaStage;
  title: string;
  count: number;
  /** Skupljena sekcija ne prikazuje redove dok je ne otvoriš. */
  collapsed: boolean;
  data: T[];
};

/**
 * Sekcije liste. „Sve" grupiše po fazi (prazne faze se izostavljaju); jedna faza
 * je jedna sekcija. Odbijeno je skupljeno samo u „Sve" — kad si izabrao baš tu
 * fazu, hteo si da je vidiš.
 */
export function buildSections<T extends IdeaRowModel>(
  ideas: ReadonlyArray<T>,
  filter: IdeaStageFilter,
  expandedRejected: boolean,
): IdeaSection<T>[] {
  const groups = groupByStage(ideas);
  const stages = filter === 'sve' ? IDEA_STAGE_ORDER : [filter];
  const sections: IdeaSection<T>[] = [];
  for (const stage of stages) {
    const items = newestFirst(groups[stage]);
    if (items.length === 0) continue;
    const collapsed = filter === 'sve' && stage === COLLAPSED_STAGE && !expandedRejected;
    sections.push({
      stage,
      title: IDEA_STAGE_LABELS[stage],
      count: items.length,
      collapsed,
      data: collapsed ? [] : items,
    });
  }
  return sections;
}

// --- Tekstovi -----------------------------------------------------------------

/** „1 ideja", „3 ideje", „5 ideja" (11–14 → „ideja"). */
export function ideasCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'ideje' : 'ideja';
  return `${count} ${word}`;
}

/** „Ana · pre 3 dana" (bez autora „Član tima"). */
export function ideaAuthorLine(
  idea: Pick<IdeaRowModel, 'author' | 'createdAt'>,
  now: number,
): string {
  return `${idea.author?.displayName ?? 'Član tima'} · ${formatTrashAge(idea.createdAt, now)}`;
}

/** Broj komentara za red („20+" kad je server odsekao brojanje). */
export function commentCountText(
  idea: Pick<IdeaRowModel, 'commentCount' | 'commentCountCapped'>,
): string {
  return idea.commentCountCapped ? `${idea.commentCount}+` : String(idea.commentCount);
}

/** „3 komentara" za meta red i čitač ekrana. */
export function commentsLabel(idea: Pick<IdeaRowModel, 'commentCount' | 'commentCountCapped'>): string {
  const count = idea.commentCount;
  // Množina je „komentara" za sve osim 1, 21, 31… (2–4 i 5+ se ovde ne razlikuju).
  const word = count % 10 === 1 && count % 100 !== 11 ? 'komentar' : 'komentara';
  return `${commentCountText(idea)} ${word}`;
}

/** Najava posle glasa (čitač ekrana; isti tekst kao web). */
export function voteMessage(previous: IdeaVote | null, vote: IdeaVote): string {
  return previous === vote ? 'Glas je povučen.' : 'Glas je sačuvan.';
}

/** Najava posle promene faze. */
export function stageChangedMessage(stage: IdeaStoredStage): string {
  return `Ideja je u fazi „${IDEA_STAGE_LABELS[stage]}”.`;
}

/** Poruka posle pretvaranja ideje. */
export function convertedMessage(kind: 'task' | 'note', title: string): string {
  return kind === 'task'
    ? `Ideja je postala zadatak „${title}”.`
    : `Ideja je postala beleška „${title}”.`;
}

/** Prazno stanje liste: bez ideja uopšte, ili bez ideja u izabranoj fazi. */
export function emptyCopy(input: { total: number; filter: IdeaStageFilter; searching: boolean }): {
  title: string;
  description: string | null;
} {
  if (input.searching) return { title: 'Nijedna ideja ne odgovara pretrazi.', description: null };
  if (input.total === 0) return { title: 'Još nema ideja.', description: null };
  return { title: 'Nema ideja u ovoj fazi.', description: null };
}

// --- Dozvole za prikaz ---------------------------------------------------------

/** Faze u koje ideja sme da pređe; bez prava ili pretvorena — nijedna. */
export function stageOptions(idea: Pick<IdeaRowModel, 'stage' | 'permissions'>): IdeaStoredStage[] {
  return idea.permissions.canSetStage ? stageTargets(idea.stage) : [];
}

/**
 * „Pretvori u zadatak ili belešku" u detalju: dugme samo kome je dozvoljeno
 * (`canConvert`); odgovornom članu van faze „Odobreno" meta kaže kada može.
 */
export function convertHint(
  idea: Pick<IdeaRowModel, 'stage' | 'convertedPageId' | 'permissions'>,
): { kind: 'button' } | { kind: 'hint'; text: string } | { kind: 'none' } {
  if (idea.convertedPageId !== null) return { kind: 'none' };
  if (idea.permissions.canConvert) return { kind: 'button' };
  if (idea.permissions.canSetStage && idea.stage !== 'odobreno') {
    return { kind: 'hint', text: 'Pretvara se u fazi „Odobreno”.' };
  }
  return { kind: 'none' };
}

/** Razlog koji stoji uz red „Faza" kad je ne možeš menjati (inače `null`). */
export function stageLockedReason(
  idea: Pick<IdeaRowModel, 'convertedPageId' | 'permissions'>,
  reasons: { changeStage: string; converted: string },
): string | null {
  if (idea.permissions.canSetStage) return null;
  return idea.convertedPageId !== null ? reasons.converted : reasons.changeStage;
}

/** Naslov ideje: naslov, pa početak teksta, pa rezerva. */
export function ideaTitle(idea: Pick<IdeaRowModel, 'title' | 'text'>): string {
  return (idea.title ?? '').trim() || idea.text.trim().slice(0, 60) || 'Ideja';
}

// --- Izmena teksta --------------------------------------------------------------

export const IDEA_TITLE_MAX = 200;
export const IDEA_TEXT_MAX = 12_000;

/** Greška nacrta izmene ili `null` (isti uslovi kao server: ne prazno, u granicama). */
export function ideaDraftError(draft: { title: string; text: string }): string | null {
  const title = draft.title.trim();
  const body = draft.text.trim();
  if (title === '') return 'Naslov ne može biti prazan.';
  if (body === '') return 'Tekst ne može biti prazan.';
  if (title.length > IDEA_TITLE_MAX) return `Naslov može imati najviše ${IDEA_TITLE_MAX} znakova.`;
  if (body.length > IDEA_TEXT_MAX) return `Tekst može imati najviše ${IDEA_TEXT_MAX} znakova.`;
  return null;
}
