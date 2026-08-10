import { useMutation, usePaginatedQuery } from 'convex/react';
import { Check, MessageSquarePlus, Pencil, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonCard, SkeletonList } from '@/components/ui/skeletons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { noteHtmlToText } from '@/lib/note-content';
import { formatShortDate } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

/** Isti korak paginacije kao web (`compact: false`). */
const PAGE_SIZE = 20;

const MODERATION_LABEL = {
  approved: 'Odobreno',
  rejected: 'Odbijeno',
  pending: 'Na čekanju',
} as const;

/**
 * Nit doprinosa članova — pandan web `idea-discussion-dialog.tsx`
 * (`ContributionInlineThread`). Za sad je meta ideja; `collaboration` isti API nudi
 * i za checkpoint, pa je komponenta pisana oko `target`-a, ne oko ideje.
 *
 * Razlike u odnosu na web:
 * - Web sam doučitava sve strane u `useEffect`-u; ovde stoji dugme „Učitaj još" —
 *   na telefonu tiho povlačenje stotina poruka troši i bateriju i podatke.
 * - Web briše odmah pa nudi „Undo" u toast-u; ovde se pita PRE brisanja, jer
 *   toast koji se sam skloni na telefonu promakne (isti obrazac kao ostatak app-a).
 *
 * Tekst se čuva kao HTML (nastao na webu), pa se prikazuje kroz `noteHtmlToText` —
 * mobilni ne renderuje HTML izvan editora.
 */
export function ContributionThread({
  target,
  canAdd,
}: {
  target:
    | { kind: 'idea'; id: Id<'ideaNodes'> }
    | { kind: 'task_checkpoint'; id: Id<'taskCheckpoints'> };
  /** Kad je `false`, nit se samo čita (nema kompozera). */
  canAdd: boolean;
}) {
  const colors = useThemeColors();
  const { results, status, loadMore } = usePaginatedQuery(
    api.collaboration.listContributionsPaginated,
    { target },
    { initialNumItems: PAGE_SIZE },
  );

  const addContribution = useMutation(api.collaboration.addContribution);
  const updateContribution = useMutation(api.collaboration.updateContribution);
  const deleteOwn = useMutation(api.collaboration.deleteOwnContribution);
  const requestDeletion = useMutation(api.collaboration.requestDeletion);
  const moderate = useMutation(api.collaboration.moderateContribution);

  const [draft, setDraft] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<'contentContributions'> | null>(null);
  const [editingText, setEditingText] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const fail = (error: unknown, fallback: string) => {
    haptics.error();
    Alert.alert('Greška', accessErrorMessage(error, fallback));
  };

  const submit = async () => {
    const content = draft.trim();
    if (!content || busyId !== null) return;
    setBusyId('new');
    haptics.tap();
    try {
      await addContribution({ target, content });
      haptics.success();
      setDraft('');
      setComposerOpen(false);
    } catch (error) {
      fail(error, 'Tekst nije objavljen.');
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = async (contributionId: Id<'contentContributions'>) => {
    const content = editingText.trim();
    if (!content || busyId !== null) return;
    setBusyId(contributionId);
    haptics.tap();
    try {
      await updateContribution({ contributionId, content });
      haptics.success();
      setEditingId(null);
    } catch (error) {
      fail(error, 'Tekst nije sačuvan.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = (
    contributionId: Id<'contentContributions'>,
    direct: boolean,
    author: string,
  ) => {
    if (busyId !== null) return;
    haptics.warning();
    Alert.alert(
      direct ? 'Obrisati svoj tekst?' : 'Zatražiti brisanje?',
      direct
        ? 'Tekst se uklanja iz diskusije.'
        : `Tekst je napisao ${author}, pa brisanje ide na glasanje tima.`,
      [
        { text: 'Otkaži', style: 'cancel' },
        {
          text: direct ? 'Obriši' : 'Zatraži',
          style: direct ? 'destructive' : 'default',
          onPress: () => {
            setBusyId(contributionId);
            const action = direct
              ? deleteOwn({ contributionId })
              : requestDeletion({ target: { kind: 'contribution', id: contributionId } });
            void action
              .then(() => {
                haptics.success();
                if (!direct) {
                  Alert.alert('Poslato', 'Zahtev za brisanje čeka glasanje tima.');
                }
              })
              .catch((error: unknown) => fail(error, 'Radnja nije izvršena.'))
              .finally(() => setBusyId(null));
          },
        },
      ],
    );
  };

  const decide = (
    contributionId: Id<'contentContributions'>,
    decision: 'approve' | 'reject',
  ) => {
    if (busyId !== null) return;
    setBusyId(contributionId);
    // Odbijanje tuđeg teksta je destruktivna odluka; odobravanje je obična akcija.
    if (decision === 'reject') haptics.warning();
    else haptics.tap();
    void moderate({ contributionId, decision })
      .then(() => haptics.success())
      .catch((error: unknown) =>
        fail(error, decision === 'approve' ? 'Tekst nije odobren.' : 'Tekst nije odbijen.'),
      )
      .finally(() => setBusyId(null));
  };

  if (status === 'LoadingFirstPage') {
    // Oblik kartice doprinosa: avatar 32 + ime/meta, pa dve linije teksta.
    return (
      <View style={styles.wrap} accessible accessibilityLiveRegion="polite" accessibilityLabel="Učitavanje diskusije">
        <SkeletonList
          count={2}
          gap={10}
          item={(index) => (
            <SkeletonCard style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={styles.cardHead}>
                <Skeleton width={32} height={32} borderRadius={radius.pill} />
                <View style={styles.cardHeadText}>
                  <Skeleton width="42%" height={14} />
                  <Skeleton width="28%" height={12} />
                </View>
              </View>
              <Skeleton width="100%" height={14} />
              <Skeleton width={index === 0 ? '72%' : '54%'} height={14} />
            </SkeletonCard>
          )}
        />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {results.length === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>
          Još niko nije pisao. Budi prvi.
        </Text>
      ) : (
        results.map((item) => {
          const authorName = item.author?.displayName ?? 'Raniji zajednički sadržaj';
          const body = noteHtmlToText(item.content).trim();
          const editing = editingId === item._id;
          const busy = busyId === item._id;
          const toneFor =
            item.moderationStatus === 'approved'
              ? colors.success
              : item.moderationStatus === 'rejected'
                ? colors.danger
                : colors.warning;

          return (
            <View
              key={item._id}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.cardHead}>
                <Avatar name={authorName} uri={item.author?.avatarUrl ?? null} size={32} />
                <View style={styles.cardHeadText}>
                  <Text numberOfLines={1} style={[styles.author, { color: colors.foreground }]}>
                    {authorName}
                  </Text>
                  <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                    {formatShortDate(item.createdAt)}
                  </Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: `${toneFor}22` }]}>
                  <Text style={[styles.statusText, { color: toneFor }]}>
                    {MODERATION_LABEL[item.moderationStatus]}
                  </Text>
                </View>
              </View>

              {editing ? (
                <View style={styles.editor}>
                  <Input
                    value={editingText}
                    multiline
                    autoFocus
                    accessibilityLabel="Izmena teksta"
                    onChangeText={setEditingText}
                    style={styles.multiline}
                  />
                  <View style={styles.editorActions}>
                    <Button
                      label="Otkaži"
                      variant="ghost"
                      size="sm"
                      onPress={() => setEditingId(null)}
                    />
                    <Button
                      label="Sačuvaj"
                      size="sm"
                      loading={busy}
                      disabled={!editingText.trim() || busy}
                      onPress={() => void saveEdit(item._id)}
                    />
                  </View>
                </View>
              ) : (
                <Text style={[styles.body, { color: colors.foreground }]}>
                  {body || '(prazan tekst)'}
                </Text>
              )}

              {!editing ? (
                <View style={styles.actions}>
                  {busy ? <ActivityIndicator size="small" color={colors.mutedForeground} /> : null}
                  {target.kind === 'idea' && item.canModerate ? (
                    <>
                      <IconAction
                        label={`Odobri tekst — ${authorName}`}
                        tint={colors.success}
                        disabled={busyId !== null}
                        onPress={() => decide(item._id, 'approve')}>
                        <Check size={18} color={colors.success} />
                      </IconAction>
                      <IconAction
                        label={`Odbij tekst — ${authorName}`}
                        tint={colors.danger}
                        disabled={busyId !== null}
                        onPress={() => decide(item._id, 'reject')}>
                        <X size={18} color={colors.danger} />
                      </IconAction>
                    </>
                  ) : null}
                  {item.canEdit ? (
                    <IconAction
                      label="Uredi moj tekst"
                      tint={colors.mutedForeground}
                      disabled={busyId !== null}
                      onPress={() => {
                        setEditingId(item._id);
                        // Uređuje se čist tekst; server prima i običan tekst (isti
                        // `cleanContribution` put kao web kompozer).
                        setEditingText(noteHtmlToText(item.content).trim());
                      }}>
                      <Pencil size={18} color={colors.mutedForeground} />
                    </IconAction>
                  ) : null}
                  {item.canDeleteDirectly || item.canRequestDeletion ? (
                    <IconAction
                      label={
                        item.canDeleteDirectly
                          ? 'Obriši moj tekst'
                          : `Zatraži brisanje teksta — ${authorName}`
                      }
                      tint={colors.danger}
                      disabled={busyId !== null}
                      onPress={() => remove(item._id, item.canDeleteDirectly, authorName)}>
                      <Trash2 size={18} color={colors.danger} />
                    </IconAction>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })
      )}

      {status === 'LoadingMore' ? (
        <ActivityIndicator color={colors.mutedForeground} accessibilityLabel="Učitavanje" />
      ) : status === 'CanLoadMore' ? (
        <Button label="Učitaj još" variant="ghost" size="sm" onPress={() => loadMore(PAGE_SIZE)} />
      ) : null}

      {canAdd ? (
        composerOpen ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Input
              value={draft}
              multiline
              autoFocus
              placeholder="Napiši…"
              accessibilityLabel="Nov tekst u diskusiji"
              onChangeText={setDraft}
              style={styles.multiline}
            />
            <View style={styles.editorActions}>
              <Button
                label="Otkaži"
                variant="ghost"
                size="sm"
                onPress={() => {
                  setComposerOpen(false);
                  setDraft('');
                }}
              />
              <Button
                label="Objavi"
                size="sm"
                loading={busyId === 'new'}
                disabled={!draft.trim() || busyId !== null}
                onPress={() => void submit()}
              />
            </View>
          </View>
        ) : (
          <Button
            label="Dodaj tekst"
            variant="secondary"
            icon={<MessageSquarePlus size={18} color={colors.foreground} />}
            onPress={() => setComposerOpen(true)}
          />
        )
      ) : null}
    </View>
  );
}

function IconAction({
  label,
  tint,
  disabled,
  onPress,
  children,
}: {
  label: string;
  tint: string;
  disabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconAction,
        { borderColor: `${tint}44` },
        pressed && { backgroundColor: colors.muted },
        disabled && styles.dimmed,
      ]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  empty: {
    ...text.body,
  },
  card: {
    gap: 8,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardHeadText: {
    flex: 1,
    gap: 2,
  },
  author: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  meta: {
    ...text.meta,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusText: {
    ...text.meta,
    fontWeight: fontWeight.semibold,
  },
  body: {
    ...text.body,
  },
  editor: {
    gap: 8,
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  editorActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
  },
  iconAction: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dimmed: {
    opacity: 0.4,
  },
});
