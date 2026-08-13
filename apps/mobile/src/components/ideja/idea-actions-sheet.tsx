import { useMutation } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import {
  Archive,
  Check,
  ChevronLeft,
  Copy,
  FileOutput,
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
import { fontWeight, radius } from '@/theme/tokens';

/** Čvor/ivica iz `ideas.list` — ista pretplata koju lista, detalj i kanvas drže. */
export type IdeaListNode = FunctionReturnType<typeof api.ideas.list>['nodes'][number];
export type IdeaListEdge = FunctionReturnType<typeof api.ideas.list>['edges'][number];

export type IdeaActionsView = 'menu' | 'connect' | 'nest' | 'size';

const VIEW_TITLE: Record<Exclude<IdeaActionsView, 'menu'>, string> = {
  connect: 'Poveži sa idejom',
  nest: 'Ugnjezdi u…',
  size: 'Veličina oblačića',
};

/** Naslov ideje za prikaz — naslov, pa početak teksta, pa rezerva. */
export function ideaDisplayTitle(node: { title: string | null; text: string }): string {
  return (node.title ?? '').trim() || node.text.trim().slice(0, 60) || 'Ideja';
}

/**
 * Akcije nad jednom idejom (PARITET A4) — mobilni pandan web gestovima sa kanvasa
 * (drag ručica→ručica za vezu, drop-na-karticu za gnježdenje) i dugmadima liste:
 * povezivanje, ugnježdavanje, izdvajanje, veličina, konverzija, brisanje sa undo.
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
  currentProfileId,
  startupId,
  initialView = 'menu',
  onClose,
  onEdit,
  onConvert,
  onBranch,
  onArchived,
}: {
  open: boolean;
  idea: IdeaListNode | null;
  nodes: IdeaListNode[];
  edges: IdeaListEdge[];
  currentProfileId: Id<'profiles'>;
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
  /** „Pretvori u stranicu": isti handoff ugovor kao `onEdit`. */
  onConvert: (idea: IdeaListNode) => void;
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
  const requestDeletion = useMutation(api.collaboration.requestDeletion);
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
  const isMine = target.authorProfileId === currentProfileId;
  const activeSize = activeThoughtSizePreset(target.width);
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

  const archive = () => {
    if (busyId !== null) return;
    haptics.warning();
    const direct = target.canDeleteDirectly;
    Alert.alert(
      direct ? 'Obrisati ideju?' : 'Zatražiti brisanje?',
      direct
        ? 'Ideja se uklanja iz kanvasa i liste. Diskusija ostaje sačuvana.'
        : 'Ideja nije tvoja, pa se pokreće glasanje tima o brisanju.',
      [
        { text: 'Otkaži', style: 'cancel' },
        {
          text: direct ? 'Obriši' : 'Zatraži',
          style: 'destructive',
          onPress: () =>
            void runAction('archive', async () => {
              if (!direct) {
                await requestDeletion({ target: { kind: 'idea', id: target._id } });
                return 'Glasanje o brisanju je pokrenuto.';
              }
              const result = await archiveIdea({ startupId, ideaId: target._id });
              if (result.recoveredId !== null) {
                // Server ODBIJA undo kad je arhiviranje izdvojilo tuđe izmene u
                // „Oporavljeno" — traka bi nudila dugme koje garantovano pada
                // (web radi isto, `ideas-canvas-view.tsx`).
                onArchived?.();
                return 'Ideja je obrisana, a tuđe izmene su sačuvane u „Oporavljeno".';
              }
              // Push PRE `onArchived` (router.back) — traka preživi navigaciju
              // (modul-store) i pojavi se na ekranu ispod.
              pushUndo({
                label: 'Ideja je obrisana.',
                action: { kind: 'idea', startupId, ideaId: result.ideaId },
                undoUntil: result.undoUntil,
              });
              onArchived?.();
              return null;
            }),
        },
      ],
    );
  };

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
            {target.canEdit && onEdit ? (
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
              subtitle="Veza ka drugoj ideji, vidljiva na kanvasu"
              onPress={() => setView('connect')}
              disabled={busyId !== null}
              style={styles.row}
              icon={<Link2 size={20} color={colors.mutedForeground} />}
            />
            {target.canEdit ? (
              // Server: samo svoja kartica sme da se ugnjezdi (`requestNesting`).
              <Row
                title="Ugnjezdi u…"
                subtitle="Kod tuđe kartice vlasnik odobrava predlog"
                onPress={() => setView('nest')}
                disabled={busyId !== null}
                style={styles.row}
                icon={<FolderInput size={20} color={colors.mutedForeground} />}
              />
            ) : null}
            {target.canDetach ? (
              <Row
                title="Izdvoji iz grupe"
                subtitle="Vraća karticu na vrh kanvasa; povlači i predlog"
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
            {!target.convertedPageId ? (
              // Već pretvorena ideja i dalje nema ovaj red (detalj tada nudi
              // „Pretvorena u stranicu", `ideja/[id].tsx`). Neodobrena ideja OSTAJE
              // vidljiva ali onemogućena — objašnjenje u podnaslovu (C16), umesto
              // da red tiho nestane i pojavi se bez razloga.
              <Row
                title="Pretvori u stranicu"
                subtitle={
                  target.isApproved
                    ? 'Odobrena ideja postaje zadatak ili beleška'
                    : 'Treba više glasova za nego protiv.'
                }
                onPress={() => onConvert(target)}
                disabled={busyId !== null || !target.isApproved}
                style={styles.row}
                icon={<FileOutput size={20} color={colors.mutedForeground} />}
              />
            ) : null}
            <Row
              title={target.canDeleteDirectly ? 'Obriši ideju' : 'Zatraži brisanje'}
              subtitle={
                target.canDeleteDirectly
                  ? 'Sklanja ideju; traka „Poništi" vraća'
                  : 'Tuđa ideja se briše glasanjem tima'
              }
              onPress={archive}
              disabled={busyId !== null}
              showChevron={false}
              style={styles.row}
              icon={<Archive size={20} color={colors.destructive} />}
              value={busyId === 'archive' ? <ActivityIndicator color={colors.primary} /> : undefined}
            />
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
                    : 'Nema druge ideje u koju bi se ova ugnjezdila.'}
                </Text>
              ) : (
                candidates.map((candidate) => {
                  const candidateTitle = ideaDisplayTitle(candidate);
                  // Nevažeći kandidati ostaju vidljivi ali prigušeni, sa razlogom u
                  // podnaslovu — jasnije od tihog izostavljanja (isti obrazac kao
                  // misli; cikluse pri gnježdenju svejedno čuva server).
                  const alreadyConnected = view === 'connect' && connectedIds.has(candidate._id);
                  // Server: bar jedna strana veze mora biti moja kartica.
                  const needsMine =
                    view === 'connect' &&
                    !isMine &&
                    candidate.authorProfileId !== currentProfileId;
                  const currentParent =
                    view === 'nest' && target.parentIdeaId === candidate._id;
                  const reason = alreadyConnected
                    ? 'Već povezana'
                    : needsMine
                      ? 'Veza traži tvoju karticu'
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
                              return result.status === 'approved'
                                ? 'Ideja je ugnježdena.'
                                : 'Predlog ugnježdenja je odmah vidljiv timu — vlasnik kartice ga odobrava u Odobrenjima.';
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
    fontSize: 18,
    fontWeight: fontWeight.semibold,
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
