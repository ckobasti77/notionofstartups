import {
  IDEA_CONVERTED_REASON,
  IDEA_STAGE_CHANGE_REASON,
  IDEA_STAGE_LABELS,
} from '@devotion/shared';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Ellipsis, FileOutput, Flag, History, Lightbulb, Pencil, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IdeaCreateSheet } from '@/components/canvas/idea-create-sheet';
import { DiscussionLink } from '@/components/chat/discussion-link';
import {
  CommentsEntryRow,
  CommentsSheet,
  useCommentsSummary,
} from '@/components/collab/comments-sheet';
import { RevisionHistorySheet } from '@/components/collab/revision-history-sheet';
import { EmptyState } from '@/components/empty-state';
import { IdeaActionsSheet } from '@/components/ideja/idea-actions-sheet';
import { IdeaConvertSheet } from '@/components/ideja/idea-convert-sheet';
import { IdeaEdgeSheet, type IdeaEdgeDetail } from '@/components/ideja/idea-edge-sheet';
import { IdeaEdgesSection } from '@/components/ideja/idea-edges-section';
import { IdeaStageSheet } from '@/components/ideja/idea-stage-sheet';
import {
  convertHint,
  ideaAuthorLine,
  ideaDraftError,
  ideaTitle,
  stageLockedReason,
} from '@/components/ideja/ideje-model';
import { useIdeaVote } from '@/components/ideja/use-idea-vote';
import { VoteButtons } from '@/components/ideja/vote-buttons';
import { useLiveNow } from '@/components/collab/use-live-now';
import { UndoBar } from '@/components/undo-bar';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Row } from '@/components/ui/row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { absoluteNodePosition } from '@/lib/canvas-position';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, space, text } from '@/theme/tokens';

/**
 * Pauza između zatvaranja jednog i otvaranja drugog sheet-a (akcije → izmena /
 * konverzija). Dva istovremena RN `Modal`-a na Androidu umeju da progutaju
 * `onRequestClose` (vidi `misli.tsx`).
 */
const SHEET_HANDOFF_MS = 320;

/**
 * Ekran ideje (PROSTOR P6, P16; plan K07 §5.9) — par web fioke ideje:
 * tekst sa „Izmeni" i Istorijom izmena, Za/Protiv za svakog člana, Faza (sheet,
 * samo kome server dozvoljava), Veze, Komentari (sheet) i „Pretvori u zadatak ili
 * belešku" (samo u fazi „Odobreno" i samo kome server dozvoljava).
 *
 * Podaci: `ideas.list` (R7 — `ideas.get` ne postoji; ista pretplata koju lista i
 * Mapa već drže). Ekran ne računa „autor": čita `permissions` sa servera (R17).
 * Nema kartice u kartici — sekcije su naslov + sadržaj (SMIRENJE §1.5).
 */
export default function IdejaScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ideaId = id as Id<'ideaNodes'>;
  const { activeStartupId, restoring } = useActiveStartup();
  const now = useLiveNow(60_000);

  const data = useQuery(
    api.ideas.list,
    activeStartupId ? { startupId: activeStartupId } : 'skip',
  );
  const updateIdea = useMutation(api.ideas.update);
  const { cast, busyId } = useIdeaVote(activeStartupId);
  const commentsSummary = useCommentsSummary({ kind: 'idea', id: ideaId });

  const [actionsOpen, setActionsOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [branchParent, setBranchParent] = useState<{
    id: Id<'ideaNodes'>;
    title: string;
    x?: number;
    y?: number;
  } | null>(null);
  const [edgeDetail, setEdgeDetail] = useState<IdeaEdgeDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftText, setDraftText] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const idea = data?.nodes.find((node) => node._id === ideaId) ?? null;

  const openEdit = () => {
    if (idea === null) return;
    haptics.tap();
    setDraftTitle(idea.title ?? '');
    setDraftText(idea.text);
    setEditError(null);
    setEditing(true);
  };

  /** Izmena ideje — `ideas.update`; svaki član sme, prethodni tekst ostaje u Istoriji izmena. */
  async function saveEdit() {
    if (!activeStartupId || idea === null || saving) return;
    const problem = ideaDraftError({ title: draftTitle, text: draftText });
    if (problem !== null) {
      setEditError(problem);
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      await updateIdea({
        startupId: activeStartupId,
        ideaId,
        title: draftTitle.trim(),
        text: draftText.trim(),
        // Boja je samo oznaka na Mapi (K16-4): izmena teksta je ne menja.
        color: idea.color ?? 'violet',
      });
      haptics.success();
      setEditing(false);
    } catch (error) {
      haptics.error();
      setEditError(accessErrorMessage(error, 'Ideja nije sačuvana.'));
    } finally {
      setSaving(false);
    }
  }

  if (activeStartupId === null && restoring) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Ideja" onBack={() => router.back()} />
        <IdeaSkeleton />
      </View>
    );
  }

  if (activeStartupId === null) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Ideja" onBack={() => router.back()} />
        <EmptyState
          icon={<Lightbulb size={40} color={colors.mutedForeground} />}
          title="Izaberi startup"
          description="Ideje se prikazuju po startupu. Izaberi ga iz zaglavlja."
        />
      </View>
    );
  }

  if (data === undefined) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Ideja" onBack={() => router.back()} />
        <IdeaSkeleton />
      </View>
    );
  }

  if (idea === null) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Ideja" onBack={() => router.back()} />
        <EmptyState
          icon={<Lightbulb size={40} color={colors.mutedForeground} />}
          title="Ideja nije pronađena."
          description="Možda je u Korpi ili pripada drugom startupu."
          actionLabel="Otvori Korpu"
          onAction={() => router.replace('/korpa')}
        />
      </View>
    );
  }

  const title = ideaTitle(idea);
  const convert = convertHint(idea);
  const lockedReason = stageLockedReason(idea, {
    changeStage: IDEA_STAGE_CHANGE_REASON,
    converted: IDEA_CONVERTED_REASON,
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={title}
        titleNumberOfLines={2}
        subtitle={ideaAuthorLine(idea, now)}
        onBack={() => router.back()}
        actions={
          <IconButton
            accessibilityLabel="Akcije ideje"
            onPress={() => {
              haptics.tap();
              setActionsOpen(true);
            }}>
            <Ellipsis size={20} color={colors.foreground} />
          </IconButton>
        }
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}>
        {idea.text.trim() ? (
          <Text selectable style={[styles.body, { color: colors.foreground }]}>
            {idea.text.trim()}
          </Text>
        ) : null}
        <View style={styles.textActions}>
          {idea.permissions.canEdit ? (
            <Button
              label="Izmeni"
              variant="secondary"
              size="sm"
              icon={<Pencil size={16} color={colors.secondaryForeground} />}
              onPress={openEdit}
              style={styles.textAction}
            />
          ) : null}
          <Button
            label="Istorija izmena"
            variant="secondary"
            size="sm"
            icon={<History size={16} color={colors.secondaryForeground} />}
            onPress={() => {
              haptics.tap();
              setHistoryOpen(true);
            }}
            style={styles.textAction}
          />
        </View>

        <VoteButtons
          upvotes={idea.upvotes}
          downvotes={idea.downvotes}
          userVote={idea.userVote}
          disabled={busyId === ideaId || !idea.permissions.canVote}
          onVote={(next) => void cast(ideaId, idea.userVote, next)}
        />

        <View>
          <Row
            icon={<Flag size={20} color={colors.mutedForeground} />}
            title="Faza"
            value={IDEA_STAGE_LABELS[idea.stage]}
            subtitle={lockedReason ?? undefined}
            titleNumberOfLines={1}
            // Bez prava: red bez strelice i bez dodira, razlog stoji u podnaslovu.
            onPress={
              idea.permissions.canSetStage
                ? () => {
                    haptics.tap();
                    setStageOpen(true);
                  }
                : undefined
            }
            showChevron={idea.permissions.canSetStage}
            accessibilityHint={idea.permissions.canSetStage ? 'Otvara izbor faze' : lockedReason ?? undefined}
          />
          {convert.kind === 'button' ? (
            <Button
              label="Pretvori u zadatak ili belešku"
              variant="secondary"
              icon={<FileOutput size={18} color={colors.secondaryForeground} />}
              onPress={() => {
                haptics.tap();
                setConvertOpen(true);
              }}
              style={styles.convert}
            />
          ) : convert.kind === 'hint' ? (
            <Text style={[styles.meta, { color: colors.mutedForeground }]}>{convert.text}</Text>
          ) : null}
          {idea.convertedPageId ? (
            // `/stranica/[id]` sama preusmerava zadatak na `/zadatak/[id]`,
            // pa ne moramo znati vrstu rezultata.
            <Row
              icon={<FileOutput size={20} color={colors.mutedForeground} />}
              title="Postalo zadatak"
              subtitle="Otvori rezultat"
              onPress={() => {
                haptics.tap();
                router.push({
                  pathname: '/stranica/[id]',
                  params: { id: idea.convertedPageId as string },
                });
              }}
            />
          ) : null}
        </View>

        <IdeaEdgesSection
          ideaId={ideaId}
          nodes={data.nodes}
          edges={data.edges}
          onOpenEdge={setEdgeDetail}
        />

        <View>
          <CommentsEntryRow summary={commentsSummary} onPress={() => setCommentsOpen(true)} />
          {/* Razgovor tima o ideji u Porukama (PARITET B4) — isti `anchorType: 'idea'` kanal. */}
          <DiscussionLink anchor={{ type: 'idea', id: ideaId }} startupId={activeStartupId} />
        </View>
      </ScrollView>

      <IdeaActionsSheet
        open={actionsOpen}
        idea={actionsOpen ? idea : null}
        nodes={data.nodes}
        edges={data.edges}
        startupId={activeStartupId}
        onClose={() => setActionsOpen(false)}
        onEdit={() => {
          setActionsOpen(false);
          setTimeout(openEdit, SHEET_HANDOFF_MS);
        }}
        onConvert={() => {
          setActionsOpen(false);
          setTimeout(() => setConvertOpen(true), SHEET_HANDOFF_MS);
        }}
        onStage={() => {
          setActionsOpen(false);
          setTimeout(() => setStageOpen(true), SHEET_HANDOFF_MS);
        }}
        onBranch={() => {
          const at = absoluteNodePosition(data.nodes, idea._id, (n) => n.parentIdeaId);
          const parent = {
            id: idea._id,
            title: ideaTitle(idea),
            ...(at.complete ? { x: at.x, y: at.y } : {}),
          };
          setActionsOpen(false);
          setTimeout(() => setBranchParent(parent), SHEET_HANDOFF_MS);
        }}
        onArchived={() => router.back()}
      />

      <IdeaConvertSheet
        open={convertOpen}
        idea={convertOpen ? idea : null}
        startupId={activeStartupId}
        onClose={() => setConvertOpen(false)}
      />

      <IdeaStageSheet
        open={stageOpen}
        idea={stageOpen ? idea : null}
        startupId={activeStartupId}
        onClose={() => setStageOpen(false)}
      />

      <IdeaCreateSheet
        open={branchParent !== null}
        startupId={activeStartupId}
        parent={branchParent}
        onClose={() => setBranchParent(null)}
      />

      <IdeaEdgeSheet
        detail={edgeDetail}
        startupId={activeStartupId}
        onClose={() => setEdgeDetail(null)}
        onOpenOther={(otherId) => {
          setEdgeDetail(null);
          haptics.tap();
          router.push({ pathname: '/ideja/[id]', params: { id: otherId } });
        }}
      />

      <CommentsSheet
        target={{ kind: 'idea', id: ideaId }}
        startupId={activeStartupId}
        title={`Komentari · ${title}`}
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
      />

      <RevisionHistorySheet
        target={{ kind: 'idea', id: ideaId }}
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Istorija izmena · Ideja"
        format="text"
        subject="page"
        // Ideja nema broj revizije (vraćanje ne proverava konflikt).
        currentRevision={undefined}
        lockedReason={idea.permissions.canEdit ? null : IDEA_CONVERTED_REASON}
      />

      {/* Obrisana ideja/veza se vraća odavde (PARITET A6); traka preživi i
          `router.back()` sa ovog ekrana (modul-store). */}
      <UndoBar />

      <Sheet visible={editing} onClose={() => setEditing(false)} avoidKeyboard style={styles.editSheet}>
        <Text accessibilityRole="header" style={[styles.editHeading, { color: colors.foreground }]}>
          Izmeni ideju
        </Text>
        {editError === null ? null : (
          <Text accessibilityLiveRegion="polite" style={[styles.meta, { color: colors.destructive }]}>
            {editError}
          </Text>
        )}
        <ScrollView style={styles.editScroll} keyboardShouldPersistTaps="handled">
        <Input
          value={draftTitle}
          onChangeText={(next) => {
            setDraftTitle(next);
            if (editError !== null) setEditError(null);
          }}
          autoFocus
          editable={!saving}
          accessibilityLabel="Naslov ideje"
          placeholder="Naslov"
        />
        <Input
          value={draftText}
          onChangeText={(next) => {
            setDraftText(next);
            if (editError !== null) setEditError(null);
          }}
          editable={!saving}
          multiline
          accessibilityLabel="Tekst ideje"
          placeholder="O čemu se radi?"
          style={styles.editBody}
        />
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          Prethodni tekst ostaje u Istoriji izmena.
        </Text>
        </ScrollView>
        <View style={styles.editActions}>
          <Button
            label="Otkaži"
            variant="ghost"
            disabled={saving}
            onPress={() => setEditing(false)}
            style={styles.editBtn}
          />
          <Button
            label="Sačuvaj"
            loading={saving}
            onPress={() => void saveEdit()}
            style={styles.editBtn}
          />
        </View>
      </Sheet>
    </View>
  );
}

/** Oblik ekrana ideje: tekst, glasovi, redovi. */
function IdeaSkeleton() {
  return (
    <View style={styles.content} accessible accessibilityLiveRegion="polite" accessibilityLabel="Učitavanje ideje">
      <Skeleton width="100%" height={14} />
      <Skeleton width="78%" height={14} />
      <Skeleton width="100%" height={48} />
      <SkeletonList count={3} item={(index) => <SkeletonRow index={index} />} />
    </View>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <IdejaError message={accessErrorMessage(error, 'Proveri vezu i pokušaj ponovo.')} onRetry={retry} />;
}

function IdejaError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Ideja" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Ideja nije učitana."
        description={message || 'Došlo je do greške pri učitavanju ideje.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  editSheet: {
    paddingHorizontal: space[5],
    gap: space[2],
  },
  editHeading: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
  },
  // Dugmad ostaju ispod; polja se skroluju kad ih tastatura stisne.
  editScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  editBody: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    gap: space[2],
    paddingTop: space[1],
  },
  editBtn: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 16,
  },
  body: {
    ...text.body,
  },
  textActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  textAction: {
    flexGrow: 0,
  },
  convert: {
    marginTop: 8,
  },
  meta: {
    ...text.meta,
  },
});
