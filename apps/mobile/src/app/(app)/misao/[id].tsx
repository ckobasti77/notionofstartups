import { formatNoteAge, noteBodyText, noteScopeLabel, notesCountLabel, NOTE_SEND_TITLE } from '@devotion/shared';
import { useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Crown, FolderInput, Link2, MoreHorizontal, NotebookPen, Send, TriangleAlert } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLiveNow } from '@/components/collab/use-live-now';
import { EmptyState } from '@/components/empty-state';
import { StartupChip } from '@/components/me/startup-chip';
import { NoteActionsSheet, type ActionNote } from '@/components/misli/note-actions-sheet';
import { NoteEditSheet, type NoteEditTarget } from '@/components/misli/note-edit-sheet';
import {
  ThoughtActionsSheet,
  type ThoughtActionsView,
} from '@/components/misli/thought-actions-sheet';
import {
  ThoughtConversionSheet,
  type ThoughtConversionNode,
} from '@/components/misli/thought-conversion-sheet';
import { ThoughtEdgeSheet, type ThoughtEdgeDetail } from '@/components/misli/thought-edge-sheet';
import { useMyStartups } from '@/components/misli/use-note-startups';
import { UndoBar } from '@/components/undo-bar';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { Row } from '@/components/ui/row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/convex/_generated/api';
import type { Doc, Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { useRetained } from '@/hooks/use-retained';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { thoughtDisplayTitle } from '@/lib/thought-layout';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, text } from '@/theme/tokens';

/** Ista pauza kao na listi — dva RN modala se ne otvaraju istovremeno. */
const SHEET_HANDOFF_MS = 320;
/** `getConnectedGroup` limit = backend `MAX_BULK_ITEMS`, pa „Pošalji grupu" uvek prolazi. */
const GROUP_LIMIT = 50;

/**
 * Detalj beleške (PROSTOR P7, K18) — pun ekran, ne sheet. Beleška se čita po
 * id-ju (`thoughts.getNote`), pa radi i za LIČNE beleške i ne zavisi od
 * aktivnog startupa (stiže se iz liste „Beleške", pretrage i trake „Otvori").
 * Veze, povezana grupa i „Poveži sa beleškom…" postoje samo uz startup
 * (`getConnectedGroup`): lične beleške nemaju Mapu. „Izmeni" otvara sheet sa
 * naslovom i tekstom, „Pošalji u startup" bira ciljni startup.
 *
 * TRKA PRI ARHIVIRANJU: čim beleška nestane, pretplata vrati „nije pronađena" —
 * PRE `router.back()`. Zato se upit prebacuje na `skip` (`leaving`) pre mutacije;
 * ako mutacija padne, `leaving` se vraća.
 */
export default function MisaoScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useLiveNow(60_000);
  const params = useLocalSearchParams<{ id: string }>();
  const nodeId = params.id as Id<'thoughtNodes'>;
  const { startups } = useMyStartups();

  const [leaving, setLeaving] = useState(false);
  const note = useQuery(api.thoughts.getNote, leaving ? 'skip' : { nodeId });
  // Poslednja učitana beleška: sheet-ovi ne smeju da nestanu usred radnje kad
  // `leaving` privremeno isprazni upit.
  const shownNote = useRetained(note ?? null);
  const startupId = note?.startupId ?? null;

  const group = useQuery(
    api.thoughts.getConnectedGroup,
    !leaving && startupId !== null ? { startupId, nodeId, limit: GROUP_LIMIT } : 'skip',
  );
  const parent = useQuery(
    api.thoughts.getNote,
    !leaving && note?.parentThoughtId ? { nodeId: note.parentThoughtId } : 'skip',
  );

  const groupNode = useMemo(
    () => group?.nodes.find((candidate) => candidate._id === nodeId) ?? null,
    [group, nodeId],
  );
  const titlesById = useMemo(
    () => new Map((group?.nodes ?? []).map((n) => [n._id, thoughtDisplayTitle(n, 'Beleška')])),
    [group],
  );
  // Direktne veze OVE beleške (grupa nosi i veze između suseda — one ovde ne idu).
  const connections = useMemo(
    () =>
      (group?.edges ?? [])
        .filter((edge) => edge.nodeAId === nodeId || edge.nodeBId === nodeId)
        .map((edge) => ({
          edge,
          otherId: edge.nodeAId === nodeId ? edge.nodeBId : edge.nodeAId,
        })),
    [group, nodeId],
  );

  const [editNote, setEditNote] = useState<NoteEditTarget | null>(null);
  const [actions, setActions] = useState<{
    node: Doc<'thoughtNodes'>;
    view: ThoughtActionsView;
  } | null>(null);
  const [noteActionsOpen, setNoteActionsOpen] = useState(false);
  const [edgeDetail, setEdgeDetail] = useState<ThoughtEdgeDetail | null>(null);
  const [conversionNodes, setConversionNodes] = useState<ThoughtConversionNode[] | null>(null);

  const openOther = (otherId: Id<'thoughtNodes'>) => {
    haptics.tap();
    router.push({ pathname: '/misao/[id]', params: { id: otherId } });
  };

  const loading = note === undefined;
  const refreshControl = useListRefresh();
  const explicitTitle = note?.title?.trim() ?? '';
  const bodyText = note ? noteBodyText(note) : '';

  // Startup beleške: puni meni (Mapa, veze, veličina…) traži čvor sa Mape, pa
  // dugme čeka grupu. Lična: mali meni (Pošalji · Arhiviraj).
  const actionsReady = note != null && (startupId === null || groupNode !== null);
  const personalActionNote = useMemo<ActionNote | null>(
    () =>
      shownNote === null
        ? null
        : { _id: shownNote._id, title: shownNote.title, text: shownNote.text, startupId: shownNote.startupId },
    [shownNote],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Beleška"
        subtitle={note ? noteScopeLabel(note) : undefined}
        onBack={() => router.back()}
        actions={
          actionsReady ? (
            <IconButton
              accessibilityLabel="Radnje nad beleškom"
              onPress={() => {
                haptics.tap();
                if (startupId === null) setNoteActionsOpen(true);
                else if (groupNode) setActions({ node: groupNode, view: 'menu' });
              }}>
              <MoreHorizontal size={22} color={colors.foreground} />
            </IconButton>
          ) : undefined
        }
      />

      {!loading && note === null ? (
        // Tuđa, arhivirana, nepostojeća ili iz startupa koji si napustio: isti odgovor.
        <EmptyState
          icon={<TriangleAlert size={20} color={colors.destructive} />}
          title="Beleška nije pronađena."
          description="Možda je arhivirana ili više nije dostupna."
          actionLabel="Nazad"
          onAction={() => router.back()}
        />
      ) : (
        <LoadingSwap loading={loading} skeleton={<MisaoSkeleton />}>
          {note == null ? null : (
            <ScrollView
              contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              refreshControl={refreshControl}>
              <View style={styles.head}>
                <View style={styles.metaRow}>
                  <StartupChip startup={note.startup} size="sm" />
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                    Izmenjeno {formatNoteAge(note.updatedAt, now)}
                  </Text>
                  {note.isParent && note.startupId !== null ? (
                    <>
                      <Crown size={14} color={colors.warning} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Glavna beleška</Text>
                    </>
                  ) : null}
                </View>
                {explicitTitle ? (
                  <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>
                    {explicitTitle}
                  </Text>
                ) : null}
                {bodyText ? (
                  <Text selectable style={[styles.body, { color: colors.foreground }]}>
                    {bodyText}
                  </Text>
                ) : null}
                {note.conversionCount > 0 ? (
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                    Poslato u Ideje {note.conversionCount}×
                  </Text>
                ) : null}
              </View>

              <View style={styles.buttonRow}>
                <Button
                  label="Izmeni"
                  variant="ghost"
                  onPress={() => {
                    haptics.tap();
                    setEditNote({ _id: note._id, title: note.title, text: note.text });
                  }}
                  style={styles.flexBtn}
                />
                <Button
                  label={NOTE_SEND_TITLE}
                  onPress={() => {
                    haptics.tap();
                    setConversionNodes([{ _id: note._id, title: note.title, text: note.text }]);
                  }}
                  style={styles.flexBtn}
                />
              </View>

              {note.parentThoughtId !== null ? (
                <Row
                  style={styles.row}
                  icon={<FolderInput size={20} color={colors.mutedForeground} />}
                  title={
                    parent
                      ? `Nadređena beleška: ${thoughtDisplayTitle(parent, 'Beleška')}`
                      : 'Nadređena beleška'
                  }
                  subtitle="Otvori nadređenu belešku"
                  onPress={() => openOther(note.parentThoughtId as Id<'thoughtNodes'>)}
                />
              ) : null}

              {note.startupId !== null ? (
                <>
                  <SectionHeader
                    title="Veze"
                    count={group === undefined ? undefined : connections.length}
                    style={styles.sectionHeader}
                  />
                  {group === undefined ? (
                    <Skeleton width="100%" height={52} borderRadius={radius.control} />
                  ) : connections.length === 0 ? (
                    <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                      Ova beleška još nema veza.
                    </Text>
                  ) : (
                    connections.map(({ edge, otherId }) => {
                      const otherTitle = titlesById.get(otherId) ?? 'Beleška';
                      return (
                        <Row
                          key={edge._id}
                          style={styles.row}
                          icon={<Link2 size={20} color={colors.mutedForeground} />}
                          title={otherTitle}
                          titleNumberOfLines={2}
                          subtitle={edge.label ?? undefined}
                          onPress={() => {
                            haptics.tap();
                            setEdgeDetail({
                              edgeId: edge._id,
                              label: edge.label,
                              otherTitle,
                              otherNodeId: otherId,
                            });
                          }}
                          accessibilityLabel={`Veza sa: ${otherTitle}${edge.label ? `, ${edge.label}` : ''}`}
                          accessibilityHint="Otvara uređivanje veze."
                        />
                      );
                    })
                  )}
                  {groupNode ? (
                    <Row
                      style={styles.row}
                      icon={<Link2 size={20} color={colors.subtle} />}
                      title="Poveži sa beleškom…"
                      showChevron={false}
                      onPress={() => {
                        haptics.tap();
                        setActions({ node: groupNode, view: 'connect' });
                      }}
                    />
                  ) : null}

                  {group !== undefined && group.nodes.length > 1 ? (
                    <>
                      <SectionHeader
                        title="Povezana grupa"
                        count={group.nodes.length}
                        style={styles.sectionHeader}
                      />
                      {group.truncated ? (
                        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                          Prikazano je prvih {GROUP_LIMIT} povezanih beleški — ova mreža je veća.
                        </Text>
                      ) : null}
                      <Row
                        style={styles.row}
                        icon={<Send size={20} color={colors.mutedForeground} />}
                        title={`Pošalji grupu u startup (${group.nodes.length})`}
                        subtitle={`Svih ${notesCountLabel(group.nodes.length)}, sa vezama`}
                        showChevron={false}
                        onPress={() => {
                          haptics.tap();
                          setConversionNodes(group.nodes);
                        }}
                      />
                    </>
                  ) : null}
                </>
              ) : null}
            </ScrollView>
          )}
        </LoadingSwap>
      )}

      <NoteEditSheet note={editNote} onClose={() => setEditNote(null)} />
      {shownNote !== null && shownNote.startupId !== null ? (
        <ThoughtActionsSheet
          open={actions !== null}
          node={actions?.node ?? null}
          startupId={shownNote.startupId}
          initialView={actions?.view ?? 'menu'}
          onClose={() => setActions(null)}
          onConvert={(nodes) => {
            setActions(null);
            setTimeout(() => setConversionNodes(nodes), SHEET_HANDOFF_MS);
          }}
          onBeforeArchive={() => setLeaving(true)}
          onArchived={() => router.back()}
          onArchiveFailed={() => setLeaving(false)}
        />
      ) : null}
      <NoteActionsSheet
        open={noteActionsOpen}
        note={noteActionsOpen ? personalActionNote : null}
        canSend={startups.length > 0}
        onClose={() => setNoteActionsOpen(false)}
        onSend={(target) => {
          setNoteActionsOpen(false);
          setTimeout(
            () => setConversionNodes([{ _id: target._id, title: target.title, text: target.text }]),
            SHEET_HANDOFF_MS,
          );
        }}
        onBeforeArchive={() => setLeaving(true)}
        onArchived={() => router.back()}
        onArchiveFailed={() => setLeaving(false)}
      />
      <ThoughtEdgeSheet
        edge={edgeDetail}
        onClose={() => setEdgeDetail(null)}
        onOpenOther={(otherId) => {
          setEdgeDetail(null);
          openOther(otherId);
        }}
      />
      <ThoughtConversionSheet
        open={conversionNodes !== null}
        targets={startups}
        sourceStartupId={shownNote?.startupId ?? null}
        nodes={conversionNodes ?? []}
        onClose={() => setConversionNodes(null)}
      />
      <UndoBar />
    </View>
  );
}

/** Oblik detalja: meta + naslov + tekst, red dugmadi, pa redovi veza. */
function MisaoSkeleton() {
  return (
    <View
      style={styles.content}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel="Učitavanje beleške">
      <Skeleton width="40%" height={14} />
      <Skeleton width="70%" height={22} />
      <Skeleton width="100%" height={72} borderRadius={radius.card} />
      <View style={styles.buttonRow}>
        <Skeleton width="48%" height={48} borderRadius={radius.control} />
        <Skeleton width="48%" height={48} borderRadius={radius.control} />
      </View>
    </View>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <MisaoError message={accessErrorMessage(error, 'Proveri vezu i pokušaj ponovo.')} onRetry={retry} />;
}

function MisaoError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Beleška" onBack={() => router.back()} />
      <EmptyState
        icon={<NotebookPen size={20} color={colors.destructive} />}
        title="Beleška nije učitana."
        description={message || 'Došlo je do greške pri učitavanju beleške.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: 16,
    paddingTop: 8,
    gap: 12,
  },
  head: { gap: 8 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    ...text.meta,
  },
  title: {
    ...text.title,
  },
  body: {
    ...text.body,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  flexBtn: {
    flex: 1,
  },
  row: {
    minHeight: 56,
    paddingHorizontal: 0,
    paddingVertical: 4,
    borderRadius: radius.control,
  },
  sectionHeader: {
    marginTop: 8,
  },
  emptyText: {
    ...text.body,
    paddingVertical: 4,
  },
});
