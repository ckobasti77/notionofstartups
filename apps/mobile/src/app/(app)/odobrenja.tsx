import { useMutation, useQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { FolderTree, Lightbulb, ShieldCheck, Trash2, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { Button, type ButtonVariant } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, text, type ColorTokens } from '@/theme/tokens';

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

  const voteOnDeletion = useMutation(api.collaboration.voteOnDeletion);
  const resolveNesting = useMutation(api.collaboration.resolveNesting);
  const approvePageNesting = useMutation(api.areasV2.approveNesting);
  const rejectPageNesting = useMutation(api.areasV2.rejectNesting);

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
        tint: colors.primary,
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

  const act = (key: string, action: { run: () => Promise<unknown>; confirm?: string }) => {
    const go = async () => {
      setBusyKey(key);
      try {
        await action.run();
      } catch (error) {
        Alert.alert('Greška', accessErrorMessage(error, 'Radnja nije uspela.'));
      } finally {
        setBusyKey(null);
      }
    };
    if (action.confirm) {
      Alert.alert('Potvrda', action.confirm, [
        { text: 'Otkaži', style: 'cancel' },
        { text: 'Nastavi', style: 'destructive', onPress: () => void go() },
      ]);
    } else {
      void go();
    }
  };

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
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} accessibilityLabel="Učitavanje odobrenja" />
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={40} color={colors.success} />}
          title="Sve je čisto"
          description="Nema zahteva koji čekaju tvoju odluku."
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}>
          {items.map((item) => (
            <ApprovalCard
              key={item.key}
              item={item}
              busy={busyKey === item.key}
              onPrimary={() => act(item.key, item.primary)}
              onSecondary={() => act(item.key, item.secondary)}
              colors={colors}
            />
          ))}
        </ScrollView>
      )}
    </View>
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
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
