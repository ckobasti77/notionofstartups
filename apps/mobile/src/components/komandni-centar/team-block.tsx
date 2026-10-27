import { rescheduleCandidates } from '@devotion/shared';
import { Check, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import type { Id } from '@/convex/_generated/dataModel';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { text } from '@/theme/tokens';

import { blockRowStyle } from './command-block-parts';
import { teamEntryLabel, teamRowLabel, teamWorkload, type TeamEntry } from './command-blocks-model';
import { useTriageData } from './use-triage-data';

/**
 * Red „Tim · N članova" (PROSTOR P10, K19): dodir otvara sheet sa opterećenjem po
 * članu. Kad je filter Trijaže uključen, red kaže koga (vrednost desno).
 * Prezentaciona: `memberCount === undefined` je učitavanje.
 */
export function TeamRowView({
  memberCount,
  filterName,
  onOpen,
}: {
  memberCount: number | undefined;
  filterName: string | null;
  onOpen: () => void;
}) {
  const colors = useThemeColors();
  if (memberCount === undefined) {
    return (
      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel="Učitavanje tima"
        style={styles.skeletonRow}>
        <Skeleton width={20} height={20} borderRadius={6} />
        <Skeleton width="40%" height={16} />
      </View>
    );
  }
  const title = teamRowLabel(memberCount);
  return (
    <Row
      icon={<Users size={20} color={colors.mutedForeground} />}
      title={title}
      value={filterName ?? undefined}
      accessibilityLabel={filterName === null ? title : `${title}, filter: ${filterName}`}
      accessibilityHint="Otvara opterećenje članova i filter Trijaže"
      onPress={() => {
        haptics.tap();
        onOpen();
      }}
      style={styles.row}
    />
  );
}

/**
 * Sheet Tima: „Svi" (skida filter), svaki član sa opterećenjem („6 otvoreno · 2 kasni")
 * i, ako ima zadataka bez izvršioca, „Nedodeljeno". Dodir bira filter Trijaže i
 * zatvara sheet. `entries === undefined` je učitavanje.
 */
export function TeamSheetView({
  visible,
  onClose,
  entries,
  totalLabel,
  activeKey,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  entries: ReadonlyArray<TeamEntry> | undefined;
  /** Opterećenje celog tima, uz red „Svi". */
  totalLabel: string;
  /** `null` = svi. */
  activeKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  const colors = useThemeColors();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text accessibilityRole="header" style={[styles.sheetTitle, { color: colors.foreground }]}>
        Tim
      </Text>
      {entries === undefined ? (
        <View accessible accessibilityLiveRegion="polite" accessibilityLabel="Učitavanje opterećenja tima">
          <SkeletonList count={3} item={(index) => <SkeletonRow index={index} leading="circle" trailing="value" />} />
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent} nestedScrollEnabled>
          <TeamOption
            title="Svi"
            label={totalLabel}
            icon={<Users size={20} color={colors.mutedForeground} />}
            selected={activeKey === null}
            onPress={() => onSelect(null)}
          />
          {entries.map((entry) => (
            <TeamOption
              key={entry.key}
              title={entry.name}
              label={teamEntryLabel(entry)}
              icon={
                entry.avatar === null ? (
                  <Avatar empty size={32} />
                ) : (
                  <Avatar name={entry.avatar.displayName} uri={entry.avatar.avatarUrl} size={32} />
                )
              }
              selected={activeKey === entry.key}
              onPress={() => onSelect(entry.key)}
            />
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}

function TeamOption({
  title,
  label,
  icon,
  selected,
  onPress,
}: {
  title: string;
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Row
      icon={icon}
      title={title}
      subtitle={label}
      value={
        // Rezervisano mesto za kvačicu: red ne skače kad se izbor menja.
        <View style={styles.check}>{selected ? <Check size={20} color={colors.primaryText} /> : null}</View>
      }
      showChevron={false}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${label}`}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={styles.option}
    />
  );
}

/**
 * Kontejner: opterećenje iz istih podataka kao Trijaža (`useTriageData`), računa se iz
 * SVIH otvorenih zadataka — brojevi po članu su stabilni dok se filter menja.
 */
export function TeamBlock({
  startupId,
  now,
  memberFilter,
  onSelectFilter,
}: {
  startupId: Id<'startups'>;
  now: number;
  memberFilter: string | null;
  onSelectFilter: (key: string | null) => void;
}) {
  const data = useTriageData(startupId);
  const [open, setOpen] = useState(false);

  const entries = useMemo(
    () =>
      data.members && data.tasks ? teamWorkload(data.members, data.tasks, data.assigneesByTask, now) : undefined,
    [data.members, data.tasks, data.assigneesByTask, now],
  );
  const totalLabel = useMemo(
    () =>
      teamEntryLabel({
        open: data.tasks?.length ?? 0,
        overdue: data.tasks ? rescheduleCandidates(data.tasks, now).length : 0,
      }),
    [data.tasks, now],
  );
  const filterName =
    memberFilter === null ? null : (entries?.find((entry) => entry.key === memberFilter)?.name ?? null);

  return (
    <View>
      <TeamRowView memberCount={data.members?.length} filterName={filterName} onOpen={() => setOpen(true)} />
      <TeamSheetView
        visible={open}
        onClose={() => setOpen(false)}
        entries={entries}
        totalLabel={totalLabel}
        activeKey={memberFilter}
        onSelect={(key) => {
          onSelectFilter(key);
          setOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    ...blockRowStyle,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 4,
  },
  sheetTitle: {
    ...text.title,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  list: {
    flexGrow: 0,
    flexShrink: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  option: {
    paddingHorizontal: 8,
  },
  check: {
    width: 20,
    height: 20,
  },
});
