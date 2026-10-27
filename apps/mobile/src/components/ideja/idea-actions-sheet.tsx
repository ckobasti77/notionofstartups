import { IDEA_STAGE_LABELS } from '@devotion/shared';
import { useMutation } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import {
  Archive,
  Check,
  ChevronLeft,
  Copy,
  FileOutput,
  Flag,
  FolderInput,
  GitBranchPlus,
  Lightbulb,
  Link2,
  Pencil,
  Scaling,
  Scissors,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text } from 'react-native';

import { convertHint } from '@/components/ideja/ideje-model';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { absoluteNodePosition } from '@/lib/canvas-position';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import {
  activeThoughtSizePreset,
  THOUGHT_SIZE_DIMENSIONS,
  THOUGHT_SIZE_LABEL,
  THOUGHT_SIZE_PRESETS,
} from '@/lib/thought-layout';
import { pushUndo } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, text } from '@/theme/tokens';

/** Čvor/ivica iz `ideas.list` — ista pretplata koju lista, detalj i kanvas drže. */
export type IdeaListNode = FunctionReturnType<typeof api.ideas.list>['nodes'][number];
export type IdeaListEdge = FunctionReturnType<typeof api.ideas.list>['edges'][number];

export type IdeaActionsView = 'menu' | 'connect' | 'nest' | 'size';

const VIEW_TITLE: Record<Exclude<IdeaActionsView, 'menu'>, string> = {
  connect: 'Poveži sa idejom',
  nest: 'Ugnezdi u…',
  size: 'Veličina oblačića',
};

/** Naslov ideje za prikaz — naslov, pa početak teksta, pa rezerva. */
export function ideaDisplayTitle(node: { title: string | null; text: string }): string {
  return (node.title ?? '').trim() || node.text.trim().slice(0, 60) || 'Ideja';
}

/**
 * Akcije nad jednom idejom (PARITET A4) — mobilni pandan web gestovima sa kanvasa
 * (drag ručica→ručica za vezu, drop-na-karticu za gnježdenje) i dugmadima liste:
 * povezivanje, ugnježdavanje, izdvajanje, veličina, faza, konverzija, brisanje sa undo.
 * PROSTOR (K17): sve ove radnje ima svaki član, osim faze i pretvaranja — njih
 * uključuje `permissions` sa servera; telefon ne računa „autor" sam (R17).
 * Isti obrazac kao `thought-actions-sheet.tsx`: JEDAN sheet sa pod-prikazima, ne
 * ugnježdeni modali (Android guta `onRequestClose`); `busyId` brava.
 *
 * `idea` je snimak u trenutku otvaranja — sheet se posle svake akcije zatvara.
 * `nodes`/`edges` stižu iz ISTE `ideas.list` pretplate koju ekran već drži —
 * nema drugog upita.
 */
export function IdeaActionsSheet({
  open,
  idea,
  nodes,
  edges,
  startupId,
  initialView = 'menu',
  onClose,
  onEdit,
  onConvert,
  onStage,
  onBranch,
  onArchived,
}: {
  open: boolean;
  idea: IdeaListNode | null;
  nodes: IdeaListNode[];
  edges: IdeaListEdge[];
  startupId: Id<'startups'>;
  /** Korak na kom se sheet otvara (detalj ume da preskoči meni). */
  initialView?: IdeaActionsView;
  onClose: () => void;
  /**
   * „Izmeni ideju": roditelj zatvara OVAJ sheet pa (uz pauzu) otvara edit sheet —
   * dva istovremena modala na Androidu gutaju `onRequestClose`. Red postoji samo
   * kad je callback prosleđen (lista nema edit sheet).
   */
  onEdit?: () => void;
  /** „Pretvori u zadatak ili belešku": isti handoff ugovor kao `onEdit`. */
  onConvert: (idea: IdeaListNode) => void;
  /** „Promeni fazu": isti handoff ugovor; red postoji samo uz `permissions.canSetStage`. */
  onStage?: (idea: IdeaListNode) => void;
  /**
   * „Nova grana ideje…": isti handoff ugovor kao `onEdit` — roditelj zatvara OVAJ
   * sheet pa (uz pauzu) otvara `IdeaCreateSheet` sa `parent` popunjenim.
   */
  onBranch?: () => void;
  /** Detalj: `router.back()` posle brisanja; lista ne prosleđuje ništa. */
  onArchived?: () => void;
}) {
  const colors = useThemeColors();
  const [view, setView] = useState<IdeaActionsView>(initialView);
  useEffect(() => {
    if (open) setView(initialView);
  }, [open, initialView]);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Roditelj na zatvaranje odmah postavi `idea` na null — poslednji ne-null snimak
  // ostaje za telo sheet-a tokom izlazne animacije (inače prazan sheet klizi dole).
  const lastIdeaRef = useRef<IdeaListNode | null>(null);
  if (idea !== null) lastIdeaRef.current = idea;
  const renderIdea = idea ?? lastIdeaRef.current;

  const connect = useMutation(api.ideas.connect);
  const requestNesting = useMutation(api.collaboration.requestNesting);
  const detachIdea = useMutation(api.collaboration.detachIdea);
  const updateLayout = useMutation(api.ideas.updateLayout);
  const resetLayoutSize = useMutation(api.ideas.resetLayoutSize);
  const archiveIdea = useMutation(api.ideas.archive);
  const createIdea = useMutation(api.ideas.create);

  // Već povezane ideje — „Poveži" ih obeležava umesto da server tiho no-op-uje.
  const connectedIds = useMemo(() => {
    const set = new Set<string>();
    if (idea === null) return set;
    for (const edge of edges) {
      if (edge.nodeAId === idea._id) set.add(edge.nodeBId);
      else if (edge.nodeBId === idea._id) set.add(edge.nodeAId);
    }
    return set;
  }, [edges, idea]);

  const close = () => {
    setView('menu');
    onClose();
  };

  /** Zajednički omotač: brava, haptika, prikaz greške, zatvaranje po uspehu. */
  const runAction = async (targetId: string, action: () => Promise<string | null>) => {
    if (busyId !== null) return;
    setBusyId(targetId);
    haptics.tap();
    try {
      const note = await action();
      haptics.success();
      if (note) Alert.alert('Gotovo', note);
      close();
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Radnja nije izvršena.'));
    } finally {
      setBusyId(null);
    }
  };

  // Nikad nije bio otvoren — nema ni izlazne animacije, nema šta da se crta.
  if (renderIdea === null) return null;
  const target = renderIdea;

  const title = ideaDisplayTitle(target);
  const activeSize = activeThoughtSizePreset(target.width);
  const convert = convertHint(target);
  const candidates = nodes.filter((candidate) => candidate._id !== target._id);

  const duplicate = () =>
    void runAction('duplicate', async () => {
      // Apsolutna pozicija: `target.x/y` je RELATIVNA ako je ugnježdena
      // (`ZA-POPRAVKU` §9) — kopija mora da sleti pored VIDLJIVOG položaja, ne
      // preko tuđe kartice. Kad lanac roditelja nije pun, x/y se izostavljaju i
      // server bira poziciju sam (`ideas.ts:324-325`).
      const at = absoluteNodePosition(nodes, target._id, (n) => n.parentIdeaId);
      const ideaId = await createIdea({
        startupId,
        title: (target.title ?? '').trim() || 'Kopija ideje',
        text: target.text,
        color: target.color ?? 'violet',
        ...(at.complete ? { x: Math.round(at.x + 36), y: Math.round(at.y + 36) } : {}),
      });
      pushUndo({ label: 'Ideja je duplirana.', action: { kind: 'ideaCreate', startupId, ideaId } });
      return null;
    });

  /**
   * Brisanje je uvek u Korpu i vraća se (SMIRENJE §1.5): bez potvrde, sa trakom
   * „Poništi". Svaki član briše (`permissions.canArchive`), pa nema glasanja.
   */
  const archive = () =>
    void runAction('archive', async () => {
      haptics.warning();
      const result = await archiveIdea({ startupId, ideaId: target._id });
      if (result.recoveredId !== null) {
        // Server ODBIJA undo kad je arhiviranje izdvojilo tuđe izmene u
        // „Oporavljeno" — traka bi nudila dugme koje garantovano pada.
        onArchived?.();
        return 'Ideja je u Korpi, a tuđe izmene su sačuvane u „Oporavljeno”.';
      }
      // Push PRE `onArchived` (router.back) — traka preživi navigaciju
      // (modul-store) i pojavi se na ekranu ispod.
      pushUndo({
        label: `„${title}” je u Korpi.`,
        action: { kind: 'idea', startupId, ideaId: result.ideaId },
        undoUntil: result.undoUntil,
      });
      onArchived?.();
      return null;
    });

  return (
    <Sheet visible={open && idea !== null} onClose={close} style={styles.sheet}>
      {view === 'menu' ? (
        <>
          <Text
            accessibilityRole="header"
            numberOfLines={2}
            style={[styles.heading, { color: colors.foreground }]}>
            {title}
          </Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
            {target.permissions.canEdit && onEdit ? (
              <Row
                title="Izmeni ideju"
                subtitle="Naslov i tekst ideje"
                onPress={onEdit}
                disabled={busyId !== null}
                style={styles.row}
                icon={<Pencil size={20} color={colors.mutedForeground} />}
              />
            ) : null}
            <Row
              title="Dupliraj"
              subtitle="Kopija odmah pored originala; veze se ne kopiraju"
              onPress={duplicate}
              disabled={busyId !== null}
              showChevron={false}
              style={styles.row}
              icon={<Copy size={20} color={colors.mutedForeground} />}
              value={busyId === 'duplicate' ? <ActivityIndicator color={colors.primary} /> : undefined}
            />
            {onBranch ? (
              <Row
                title="Nova grana ideje…"
                subtitle="Nova ideja, odmah povezana sa ovom"
                onPress={onBranch}
                disabled={busyId !== null}
                style={styles.row}
                icon={<GitBranchPlus size={20} color={colors.mutedForeground} />}
              />
            ) : null}
            <Row
              title="Poveži sa idejom…"
              subtitle="Veza ka drugoj ideji, vidljiva na Mapi"
              onPress={() => setView('connect')}
              disabled={busyId !== null}
              style={styles.row}
              icon={<Link2 size={20} color={colors.mutedForeground} />}
            />
            {target.permissions.canEdit ? (
              <Row
                title="Ugnezdi u…"
                subtitle="Kartica ulazi u grupu odmah"
                onPress={() => setView('nest')}
                disabled={busyId !== null}
                style={styles.row}
                icon={<FolderInput size={20} color={colors.mutedForeground} />}
              />
            ) : null}
            {target.canDetach ? (
              <Row
                title="Izdvoji iz grupe"
                subtitle="Vraća karticu na vrh Mape"
                onPress={() =>
                  void runAction('detach', async () => {
                    await detachIdea({ startupId, ideaId: target._id });
                    return 'Ideja je izvučena iz grupe.';
                  })
                }
                disabled={busyId !== null}
                showChevron={false}
                style={styles.row}
                icon={<Scissors size={20} color={colors.mutedForeground} />}
                value={busyId === 'detach' ? <ActivityIndicator color={colors.primary} /> : undefined}
              />
            ) : null}
            {target.canResize ? (
              <Row
                title="Veličina oblačića"
                subtitle={activeSize === null ? 'Automatska' : THOUGHT_SIZE_LABEL[activeSize]}
                onPress={() => setView('size')}
                disabled={busyId !== null}
                style={styles.row}
                icon={<Scaling size={20} color={colors.mutedForeground} />}
              />
            ) : null}
            {onStage && target.permissions.canSetStage ? (
              <Row
                title="Promeni fazu"
                subtitle={IDEA_STAGE_LABELS[target.stage]}
                onPress={() => onStage(target)}
                disabled={busyId !== null}
                style={styles.row}
                icon={<Flag size={20} color={colors.mutedForeground} />}
              />
            ) : null}
            {convert.kind !== 'none' ? (
              // Dugme samo kome server dozvoljava; odgovornom van faze „Odobreno"
              // red stoji prigušen sa objašnjenjem (C16), umesto da nestane.
              <Row
                title="Pretvori u zadatak ili belešku"
                subtitle={
                  convert.kind === 'button'
                    ? 'Odobrena ideja postaje zadatak'
                    : convert.text
                }
                onPress={() => onConvert(target)}
                disabled={busyId !== null || convert.kind !== 'button'}
                style={styles.row}
                icon={<FileOutput size={20} color={colors.mutedForeground} />}
              />
            ) : null}
            {target.permissions.canArchive ? (
              <Row
                title="Obriši"
                subtitle="Ide u Korpu; traka „Poništi” vraća"
                onPress={archive}
                disabled={busyId !== null}
                showChevron={false}
                style={styles.row}
                icon={<Archive size={20} color={colors.destructive} />}
                value={busyId === 'archive' ? <ActivityIndicator color={colors.primary} /> : undefined}
              />
            ) : null}
          </ScrollView>
        </>
      ) : (
        <>
          <Row
            title={VIEW_TITLE[view]}
            onPress={() => setView('menu')}
            disabled={busyId !== null}
            showChevron={false}
            accessibilityLabel={`Nazad na akcije ideje — ${VIEW_TITLE[view]}`}
            style={styles.row}
            icon={<ChevronLeft size={22} color={colors.foreground} />}
          />
          <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
            {view === 'connect' || view === 'nest' ? (
              candidates.length === 0 ? (
                <Text style={[styles.empty, { color: colors.mutedForeground }]}>
                  {view === 'connect'
                    ? 'Nema druge ideje za povezivanje.'
                    : 'Nema druge ideje u koju bi se ova ugnezdila.'}
                </Text>
              ) : (
                candidates.map((candidate) => {
                  const candidateTitle = ideaDisplayTitle(candidate);
                  // Nevažeći kandidati ostaju vidljivi ali prigušeni, sa razlogom u
                  // podnaslovu — jasnije od tihog izostavljanja (isti obrazac kao
                  // misli; cikluse pri gnježdenju svejedno čuva server).
                  const alreadyConnected = view === 'connect' && connectedIds.has(candidate._id);
                  const currentParent =
                    view === 'nest' && target.parentIdeaId === candidate._id;
                  const reason = alreadyConnected
                    ? 'Već povezana'
                    : currentParent
                      ? 'Trenutna grupa'
                      : undefined;
                  const disabled = busyId !== null || reason !== undefined;
                  return (
                    <Row
                      key={candidate._id}
                      title={candidateTitle}
                      titleNumberOfLines={2}
                      subtitle={reason}
                      // `Row` u label spaja samo string `value` — razlog prigušenosti
                      // mora eksplicitno, inače čitač čuje samo „onemogućeno".
                      accessibilityLabel={
                        reason ? `${candidateTitle}, ${reason.toLowerCase()}` : candidateTitle
                      }
                      onPress={() =>
                        view === 'connect'
                          ? void runAction(candidate._id, async () => {
                              await connect({
                                startupId,
                                nodeAId: target._id,
                                nodeBId: candidate._id,
                              });
                              // Alert, ne tihi uspeh: lista ideja ne prikazuje veze,
                              // pa bez poruke ne bi bilo potvrde (tekst = web toast).
                              return 'Ideje su povezane.';
                            })
                          : void runAction(candidate._id, async () => {
                              const result = await requestNesting({
                                startupId,
                                childIdeaId: target._id,
                                parentIdeaId: candidate._id,
                              });
                              // Server ugnježdava odmah za svakog člana (`status` je uvek `approved`).
                              void result;
                              return 'Ideja je ugnežđena.';
                            })
                      }
                      disabled={disabled}
                      showChevron={busyId === null && reason === undefined}
                      style={styles.row}
                      icon={<Lightbulb size={20} color={colors.mutedForeground} />}
                      value={
                        busyId === candidate._id ? (
                          <ActivityIndicator color={colors.primary} />
                        ) : undefined
                      }
                    />
                  );
                })
              )
            ) : null}

            {view === 'size' ? (
              <>
                {THOUGHT_SIZE_PRESETS.map((preset) => {
                  // Preseti su NAMERNO iz `thought-layout.ts`: web deli isti
                  // `ITEM_SIZE_DIMENSIONS` za misli i ideje — ne praviti dupli modul.
                  const dims = THOUGHT_SIZE_DIMENSIONS[preset];
                  return (
                    <Row
                      key={preset}
                      title={THOUGHT_SIZE_LABEL[preset]}
                      subtitle={`${dims.width} × ${dims.height}`}
                      onPress={() =>
                        void runAction(preset, async () => {
                          // `updateLayout` traži i x/y — pozicija se ne menja,
                          // prosleđuju se postojeće koordinate čvora (kao web).
                          await updateLayout({
                            startupId,
                            ideaId: target._id,
                            x: target.x,
                            y: target.y,
                            width: dims.width,
                            height: dims.height,
                          });
                          return null;
                        })
                      }
                      disabled={busyId !== null}
                      showChevron={false}
                      style={styles.row}
                      accessibilityLabel={`${THOUGHT_SIZE_LABEL[preset]}${activeSize === preset ? ', aktivna' : ''}`}
                      value={
                        busyId === preset ? (
                          <ActivityIndicator color={colors.primary} />
                        ) : activeSize === preset ? (
                          <Check size={18} color={colors.primaryText} />
                        ) : undefined
                      }
                    />
                  );
                })}
                <Row
                  title="Automatska"
                  subtitle="Oblačić raste sa sadržajem"
                  onPress={() =>
                    void runAction('auto-size', async () => {
                      await resetLayoutSize({ startupId, ideaId: target._id });
                      return null;
                    })
                  }
                  disabled={busyId !== null}
                  showChevron={false}
                  style={styles.row}
                  accessibilityLabel={`Automatska${activeSize === null ? ', aktivna' : ''}`}
                  value={
                    busyId === 'auto-size' ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : activeSize === null ? (
                      <Check size={18} color={colors.primaryText} />
                    ) : undefined
                  }
                />
              </>
            ) : null}
          </ScrollView>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 12,
  },
  heading: {
    ...text.title,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  scroll: {
    flexGrow: 0,
  },
  list: {
    paddingBottom: 4,
    gap: 2,
  },
  row: {
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
  empty: {
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
});
