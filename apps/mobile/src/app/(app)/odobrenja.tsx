import { useMutation, useQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import {
  Check,
  FolderHeart,
  FolderTree,
  History,
  Lightbulb,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { AccessibilityInfo, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SegmentedControl } from '@/components/chat/segmented-control';
import { EmptyState } from '@/components/empty-state';
import { Button, type ButtonVariant } from '@/components/ui/button';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { Pill } from '@/components/ui/pill';
import { Row } from '@/components/ui/row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonCard, SkeletonList } from '@/components/ui/skeletons';
import { StaggerGroup, StaggerItem } from '@/components/ui/stagger';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { formatActivityTime, formatDayHeading } from '@/lib/activity';
import { startOfLocalDay } from '@/lib/deadline';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, space, text, type ColorTokens } from '@/theme/tokens';

/** Kratak, čitljiv naziv za tip mete zahteva za brisanje. */
const TARGET_KIND_LABEL: Record<string, string> = {
  idea: 'Ideja',
  idea_edge: 'Veza ideja',
  page: 'Stranica',
  page_edge: 'Veza stranica',
  page_relation: 'Relacija stranica',
  task_checkpoint: 'Checkpoint',
  task_checkpoint_edge: 'Veza checkpointa',
  contribution: 'Doprinos',
  recovered: 'Vraćeni sadržaj',
};

/**
 * Segmenti ekrana — pandan četiri taba web `approvals-view`. „Čeka" je jedini
 * koji traži radnju, zato je podrazumevan; ostala tri su pregled.
 */
const SEGMENTS = [
  { id: 'pending', label: 'Čeka' },
  { id: 'mine', label: 'Moji' },
  { id: 'recovered', label: 'Oporavljeno' },
  { id: 'history', label: 'Istorija' },
] as const;

type SegmentId = (typeof SEGMENTS)[number]['id'];

const HISTORY_STATUS_LABEL: Record<string, string> = {
  approved: 'Odobreno',
  rejected: 'Odbijeno',
  withdrawn: 'Povučeno',
  cancelled: 'Otkazano',
};

/** Jedna stavka spremna za render — objedinjuje tri izvora u isti oblik kartice. */
type ApprovalItem = {
  key: string;
  icon: LucideIcon;
  tint: string;
  kicker: string;
  title: string;
  who: string;
  meta?: string;
  primary: { label: string; variant: ButtonVariant; run: () => Promise<unknown>; confirm?: string };
  secondary: { label: string; variant: ButtonVariant; run: () => Promise<unknown>; confirm?: string };
};

/** „Danas 14:22" / „7. avgust" — kratak trag vremena za pregledne sekcije. */
function formatSentAt(timestamp: number): string {
  const day = startOfLocalDay(timestamp);
  const now = Date.now();
  return day === startOfLocalDay(now)
    ? formatActivityTime(timestamp)
    : formatDayHeading(day, now);
}

/**
 * Doprinosi su HTML iz rich-text editora; ovde treba samo pregled u jednom
 * pasusu — isti `replace(/<[^>]+>/g, ' ')` koji web `approvals-view` radi.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function ideaLabel(node: { title: string | null; text: string } | null): string {
  if (node === null) return 'Ideja';
  const raw = (node.title ?? node.text ?? '').trim();
  return raw.length > 0 ? raw : 'Bez naslova';
}

/**
 * Ekran odobrenja (spec §M4.1) — objedinjuje sve što čeka odluku korisnika:
 * glasanje o brisanju (`deletionBallots`), ugnježdavanje ideja
 * (`nestingRequests`) i ugnježdavanje stranica (`pageNestingRequests`). Otvara se
 * iz taba „Više". Glasa se jednim tapom; nepovratne radnje (glas ZA brisanje)
 * traže potvrdu. Ovde je mobilni bolji od desktopa: odlučuje se u pokretu.
 */
export default function OdobrenjaScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStartupId } = useActiveStartup();

  const arg = activeStartupId ? { startupId: activeStartupId } : 'skip';
  const overview = useQuery(api.collaboration.overview, arg);
  const nestingInbox = useQuery(api.areasV2.listNestingInbox, arg);
  // `limit: 50` (maksimum) da ime podnosioca ne padne na „Član tima" u većim
  // timovima — podrazumevani `listMembers` vraća samo prvih 25 (rn-review).
  const members = useQuery(
    api.startups.listMembers,
    activeStartupId ? { startupId: activeStartupId, limit: 50 } : 'skip',
  );

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [segment, setSegment] = useState<SegmentId>('pending');

  const voteOnDeletion = useMutation(api.collaboration.voteOnDeletion);
  const resolveNesting = useMutation(api.collaboration.resolveNesting);
  const approvePageNesting = useMutation(api.areasV2.approveNesting);
  const rejectPageNesting = useMutation(api.areasV2.rejectNesting);
  const withdrawDeletion = useMutation(api.collaboration.withdrawDeletion);
  const withdrawPageNesting = useMutation(api.areasV2.withdrawNesting);
  const requestDeletion = useMutation(api.collaboration.requestDeletion);

  const memberName = useMemo(() => {
    const map = new Map<Id<'profiles'>, string>();
    members?.forEach((m) => map.set(m.profile._id, m.profile.displayName));
    return (id: Id<'profiles'>) => map.get(id) ?? 'Član tima';
  }, [members]);

  const items = useMemo<ApprovalItem[]>(() => {
    if (!overview || !nestingInbox || !activeStartupId) return [];
    const result: ApprovalItem[] = [];

    // 1) Zahtevi za brisanje koji čekaju moj glas. Brisanje traži jednoglasnost:
    // jedan „Protiv" odmah odbija, a „Za" briše tek kad svi odobre.
    for (const req of overview.requestsForVote) {
      const remaining = Math.max(req.eligibleCount - req.approveCount, 1);
      result.push({
        key: `del:${req._id}`,
        icon: Trash2,
        tint: colors.destructive,
        kicker: `Brisanje · ${TARGET_KIND_LABEL[req.targetKind] ?? 'Sadržaj'}`,
        title: req.targetTitle,
        who: `Traži: ${memberName(req.requesterProfileId)}`,
        meta: `fali još ${remaining} ZA`,
        primary: {
          label: 'Za brisanje',
          variant: 'destructive',
          confirm: 'Glas ZA može pokrenuti trajno brisanje sadržaja. Nastaviti?',
          run: () => voteOnDeletion({ requestId: req._id, vote: 'approve' }),
        },
        secondary: {
          label: 'Protiv',
          variant: 'secondary',
          confirm: 'Jedan glas PROTIV trajno odbija ovaj zahtev za brisanje. Nastaviti?',
          run: () => voteOnDeletion({ requestId: req._id, vote: 'reject' }),
        },
      });
    }

    // 2) Ugnježdavanje ideja — ja sam autor Parent kartice.
    for (const req of overview.nestingForMe) {
      result.push({
        key: `idea:${req._id}`,
        icon: Lightbulb,
        tint: colors.warning,
        kicker: 'Ugnježdavanje ideja',
        title: `„${ideaLabel(req.child)}" → „${ideaLabel(req.parent)}"`,
        who: `Traži: ${req.requester?.displayName ?? 'Član tima'}`,
        primary: {
          label: 'Odobri',
          variant: 'default',
          run: () => resolveNesting({ requestId: req._id, approve: true }),
        },
        secondary: {
          label: 'Odbij',
          variant: 'secondary',
          confirm: 'Ovim se zahtev za ugnježdavanje trajno odbija. Nastaviti?',
          run: () => resolveNesting({ requestId: req._id, approve: false }),
        },
      });
    }

    // 3) Ugnježdavanje stranica — ja sam autor ciljne roditeljske stranice.
    for (const req of nestingInbox.incoming) {
      result.push({
        key: `page:${req.requestId}`,
        icon: FolderTree,
        tint: colors.primaryText,
        kicker: 'Ugnježdavanje stranica',
        title: `„${req.child.title}" → „${req.targetParent.title}"`,
        who: `Traži: ${req.requester?.displayName ?? 'Član tima'}`,
        primary: {
          label: 'Odobri',
          variant: 'default',
          run: () => approvePageNesting({ startupId: activeStartupId, requestId: req.requestId }),
        },
        secondary: {
          label: 'Odbij',
          variant: 'secondary',
          confirm: 'Ovim se zahtev za ugnježdavanje trajno odbija. Nastaviti?',
          run: () => rejectPageNesting({ startupId: activeStartupId, requestId: req.requestId }),
        },
      });
    }

    return result;
  }, [
    overview,
    nestingInbox,
    activeStartupId,
    colors,
    memberName,
    voteOnDeletion,
    resolveNesting,
    approvePageNesting,
    rejectPageNesting,
  ]);

  const loading =
    activeStartupId !== null &&
    (overview === undefined || nestingInbox === undefined || members === undefined);

  const refreshControl = useListRefresh();

  const act = (key: string, action: { run: () => Promise<unknown>; confirm?: string }) => {
    const go = async () => {
      setBusyKey(key);
      try {
        await action.run();
        haptics.success();
        // Haptika je jedini signal uspeha bila — korisnik čitača ekrana nije
        // saznao da je glas prošao. Greške ionako idu kroz `Alert`, koji OS sam
        // najavljuje, pa se najavljuje samo uspeh.
        AccessibilityInfo.announceForAccessibility('Radnja je zabeležena.');
      } catch (error) {
        haptics.error();
        Alert.alert('Greška', accessErrorMessage(error, 'Radnja nije uspela.'));
      } finally {
        setBusyKey(null);
      }
    };
    if (action.confirm) {
      // Radnja koja traži potvrdu je nepovratna — upozorenje pre dijaloga.
      haptics.warning();
      Alert.alert('Potvrda', action.confirm, [
        { text: 'Otkaži', style: 'cancel' },
        { text: 'Nastavi', style: 'destructive', onPress: () => void go() },
      ]);
    } else {
      haptics.tap();
      void go();
    }
  };

  const myDeletion = overview?.myRequests.deletion ?? [];
  const myNestingOut = nestingInbox?.outgoing ?? [];
  const myIdeaNesting = overview?.myRequests.nesting ?? [];
  const mineCount = myDeletion.length + myNestingOut.length + myIdeaNesting.length;
  const recovered = overview?.recovered ?? [];
  const history = overview?.history ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Odobrenja"
        onBack={() => router.back()}
        eyebrow={items.length > 0 ? 'čeka tvoju odluku' : undefined}
        actions={
          items.length > 0 ? (
            <Pill
              label={String(items.length)}
              tone="danger"
              accessibilityLabel={`${items.length} zahteva čeka`}
              style={styles.headerPill}
            />
          ) : undefined
        }
      />
      {activeStartupId === null ? (
        <EmptyState
          icon={<ShieldCheck size={40} color={colors.mutedForeground} />}
          title="Izaberi startup"
          description="Odobrenja se prikazuju po startupu. Izaberi ga iz zaglavlja."
        />
      ) : (
        <LoadingSwap loading={loading} skeleton={<ApprovalsSkeleton />}>
          {loading ? null : (
            <>
              <View style={styles.segments}>
                <SegmentedControl options={SEGMENTS} value={segment} onChange={setSegment} />
              </View>
              <ScrollView
                contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
                showsVerticalScrollIndicator={false}
                refreshControl={refreshControl}>
                {segment === 'pending' ? (
                  items.length === 0 ? (
                    <EmptyState
                      icon={<ShieldCheck size={40} color={colors.success} />}
                      title="Sve je čisto"
                      description="Nema zahteva koji čekaju tvoju odluku."
                    />
                  ) : (
                    <StaggerGroup>
                      {items.map((item, index) => (
                        <StaggerItem key={item.key} index={index}>
                          <ApprovalCard
                            item={item}
                            busy={busyKey === item.key}
                            onPrimary={() => act(item.key, item.primary)}
                            onSecondary={() => act(item.key, item.secondary)}
                            colors={colors}
                          />
                        </StaggerItem>
                      ))}
                    </StaggerGroup>
                  )
                ) : null}

                {segment === 'mine' ? (
                  mineCount === 0 ? (
                    <EmptyState
                      icon={<Check size={40} color={colors.mutedForeground} />}
                      title="Nemaš otvorenih zahteva"
                      description="Zahtev koji pošalješ stoji ovde dok ga tim ne reši — možeš ga povući u svakom trenutku."
                    />
                  ) : (
                    <>
                      <SectionHeader title="Moji otvoreni zahtevi" />
                      {myDeletion.map((request) => (
                        <Row
                          key={request._id}
                          icon={<Trash2 size={20} color={colors.destructive} />}
                          title={request.targetTitle}
                          titleNumberOfLines={2}
                          subtitle={`Brisanje · ${request.approveCount}/${request.eligibleCount} ZA`}
                          value={
                            <Button
                              label="Povuci"
                              variant="ghost"
                              size="sm"
                              disabled={busyKey === `wd:${request._id}`}
                              onPress={() =>
                                act(`wd:${request._id}`, {
                                  run: () => withdrawDeletion({ requestId: request._id }),
                                })
                              }
                            />
                          }
                          showChevron={false}
                          accessibilityLabel={`Zahtev za brisanje: ${request.targetTitle}, ${request.approveCount} od ${request.eligibleCount} glasova za`}
                        />
                      ))}
                      {myNestingOut.map((request) => (
                        <Row
                          key={request.requestId}
                          icon={<FolderTree size={20} color={colors.primaryText} />}
                          title={`„${request.child.title || 'Bez naslova'}" → „${
                            request.targetParent.title || 'Bez naslova'
                          }"`}
                          titleNumberOfLines={2}
                          subtitle={`Ugnježdavanje stranice · ${formatSentAt(request.createdAt)}`}
                          value={
                            request.canWithdraw ? (
                              <Button
                                label="Povuci"
                                variant="ghost"
                                size="sm"
                                disabled={busyKey === `wn:${request.requestId}`}
                                onPress={() =>
                                  act(`wn:${request.requestId}`, {
                                    run: () =>
                                      withdrawPageNesting({
                                        startupId: activeStartupId,
                                        requestId: request.requestId,
                                      }),
                                  })
                                }
                              />
                            ) : undefined
                          }
                          showChevron={false}
                        />
                      ))}
                      {myIdeaNesting.map((request) => (
                        <Row
                          key={request._id}
                          icon={<Lightbulb size={20} color={colors.warning} />}
                          title="Zahtev za ugnježdavanje ideje"
                          subtitle={`Poslat ${formatSentAt(request.createdAt)}`}
                          showChevron={false}
                        />
                      ))}
                      <Text style={[styles.note, { color: colors.mutedForeground }]}>
                        Zahtev nema rok i možeš ga povući sve dok je otvoren.
                      </Text>
                    </>
                  )
                ) : null}

                {segment === 'recovered' ? (
                  recovered.length === 0 ? (
                    <EmptyState
                      icon={<FolderHeart size={40} color={colors.mutedForeground} />}
                      title="Nema oporavljenog sadržaja"
                      description="Kad se obriše kontejner, tuđe izmene iz njega ostaju sačuvane i pojave se ovde."
                    />
                  ) : (
                    <>
                      <SectionHeader title="Oporavljene izmene članova" />
                      {recovered.map((item) => (
                        <View
                          key={item._id}
                          style={[
                            styles.card,
                            { backgroundColor: colors.card, borderColor: colors.border },
                          ]}>
                          <View style={styles.cardHead}>
                            <View
                              style={[
                                styles.iconChip,
                                { backgroundColor: `${colors.success}22` },
                              ]}>
                              <FolderHeart size={18} color={colors.success} />
                            </View>
                            <View style={styles.cardHeadText}>
                              <Text
                                numberOfLines={2}
                                style={[styles.title, { color: colors.foreground }]}>
                                {item.title}
                              </Text>
                              <Text style={[styles.who, { color: colors.mutedForeground }]}>
                                {item.contributions.length} sačuvanih izmena
                              </Text>
                            </View>
                          </View>
                          {item.contributions.slice(0, 3).map((contribution) => (
                            <View
                              key={contribution._id}
                              style={[styles.quote, { backgroundColor: colors.muted }]}>
                              <Text
                                style={[styles.quoteAuthor, { color: colors.foreground }]}>
                                {contribution.author?.displayName ?? 'Raniji zajednički sadržaj'}
                              </Text>
                              <Text
                                numberOfLines={4}
                                style={[styles.quoteBody, { color: colors.mutedForeground }]}>
                                {stripHtml(contribution.content)}
                              </Text>
                            </View>
                          ))}
                          <Button
                            label="Zatraži brisanje"
                            variant="secondary"
                            disabled={busyKey === `rec:${item._id}`}
                            onPress={() =>
                              act(`rec:${item._id}`, {
                                confirm:
                                  'Pokreće se glasanje tima o trajnom brisanju ovog sadržaja. Nastaviti?',
                                run: () =>
                                  requestDeletion({
                                    target: { kind: 'recovered', id: item._id },
                                  }),
                              })
                            }
                          />
                        </View>
                      ))}
                    </>
                  )
                ) : null}

                {segment === 'history' ? (
                  history.length === 0 ? (
                    <EmptyState
                      icon={<History size={40} color={colors.mutedForeground} />}
                      title="Istorija je još prazna"
                      description="Završene, odbijene, povučene i otkazane odluke beleže se ovde."
                    />
                  ) : (
                    <>
                      <SectionHeader title="Istorija odluka" />
                      {history.map((request) => (
                        <Row
                          key={request._id}
                          icon={
                            <History
                              size={20}
                              color={
                                request.status === 'approved'
                                  ? colors.success
                                  : request.status === 'rejected'
                                    ? colors.destructive
                                    : colors.mutedForeground
                              }
                            />
                          }
                          title={request.targetTitle}
                          titleNumberOfLines={2}
                          subtitle={formatSentAt(request.updatedAt)}
                          value={
                            <Pill
                              label={HISTORY_STATUS_LABEL[request.status] ?? request.status}
                              tone={
                                request.status === 'approved'
                                  ? 'success'
                                  : request.status === 'rejected'
                                    ? 'danger'
                                    : 'neutral'
                              }
                            />
                          }
                          showChevron={false}
                          accessibilityLabel={`${request.targetTitle}, ${
                            HISTORY_STATUS_LABEL[request.status] ?? request.status
                          }`}
                        />
                      ))}
                    </>
                  )
                ) : null}
              </ScrollView>
            </>
          )}
        </LoadingSwap>
      )}
    </View>
  );
}

/** Oblik `ApprovalCard`: ikonica-čip, kicker + naslov + meta, pa dva dugmeta. */
function ApprovalsSkeleton() {
  return (
    <SkeletonList
      count={3}
      gap={8}
      style={styles.list}
      item={(index) => (
        <SkeletonCard style={styles.card}>
          <View style={styles.cardHead}>
            <Skeleton width={32} height={32} borderRadius={radius.control} />
            <View style={styles.cardHeadText}>
              <Skeleton width="42%" height={12} />
              <Skeleton width={index % 2 === 0 ? '78%' : '64%'} height={16} />
              <Skeleton width="50%" height={12} />
            </View>
          </View>
          <View style={styles.actions}>
            <Skeleton style={styles.flexBtn} height={48} borderRadius={radius.control} />
            <Skeleton style={styles.flexBtn} height={48} borderRadius={radius.control} />
          </View>
        </SkeletonCard>
      )}
    />
  );
}

function ApprovalCard({
  item,
  busy,
  onPrimary,
  onSecondary,
  colors,
}: {
  item: ApprovalItem;
  busy: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
  colors: ColorTokens;
}) {
  const Icon = item.icon;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHead}>
        <View style={[styles.iconChip, { backgroundColor: `${item.tint}22` }]}>
          <Icon size={18} color={item.tint} />
        </View>
        <View style={styles.cardHeadText}>
          <Text style={[styles.kicker, { color: item.tint }]}>{item.kicker}</Text>
          <Text numberOfLines={2} style={[styles.title, { color: colors.foreground }]}>
            {item.title}
          </Text>
          {/* Podnosilac i „koliko još glasova fali" su meta — stoje u istom redu
              ispod naslova umesto kao dve pune linije teksta. */}
          <View style={styles.metaRow}>
            <Text numberOfLines={1} style={[styles.who, { color: colors.mutedForeground }]}>
              {item.who}
            </Text>
            {item.meta ? <Pill label={item.meta} tone="warning" /> : null}
          </View>
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          label={item.secondary.label}
          variant={item.secondary.variant}
          onPress={onSecondary}
          disabled={busy}
          style={styles.flexBtn}
        />
        <Button
          label={item.primary.label}
          variant={item.primary.variant}
          onPress={onPrimary}
          loading={busy}
          style={styles.flexBtn}
        />
      </View>
    </View>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <OdobrenjaError message={error.message} onRetry={retry} />;
}

function OdobrenjaError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Odobrenja" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Odobrenja se ne mogu učitati"
        description={message || 'Došlo je do greške pri učitavanju zahteva.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  segments: {
    paddingHorizontal: space[4],
    paddingBottom: space[2],
  },
  note: {
    ...text.meta,
    paddingHorizontal: space[4],
    paddingTop: space[2],
  },
  quote: {
    borderRadius: radius.control,
    padding: space[3],
    gap: space[1],
  },
  quoteAuthor: {
    ...text.meta,
    fontWeight: fontWeight.semibold,
  },
  quoteBody: {
    ...text.body,
  },
  container: { flex: 1 },
  headerPill: {
    marginRight: 6,
  },
  list: {
    padding: 16,
    paddingTop: 8,
    gap: 8,
  },
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 10,
  },
  cardHead: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeadText: {
    flex: 1,
    gap: 2,
  },
  kicker: {
    ...text.meta,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  who: {
    ...text.meta,
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  flexBtn: {
    flex: 1,
  },
});
