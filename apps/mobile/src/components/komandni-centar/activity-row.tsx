import type { ActivityIcon, ActivityTarget } from '@devotion/shared';
import type { useRouter } from 'expo-router';
import {
  ArrowRightLeft,
  CalendarClock,
  Circle,
  History,
  Lightbulb,
  Lock,
  LockOpen,
  Mail,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Row } from '@/components/ui/row';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius } from '@/theme/tokens';

import type { ActivityRowModel } from './command-blocks-model';

/** Ikonica po vrsti izmene (shared `formatActivity`); sve u prigušenoj boji — ton ne ukrašava. */
const ACTIVITY_ICON: Record<ActivityIcon, LucideIcon> = {
  edit: Pencil,
  create: Plus,
  move: ArrowRightLeft,
  trash: Trash2,
  restore: RotateCcw,
  lock: Lock,
  unlock: LockOpen,
  comment: MessageSquare,
  idea: Lightbulb,
  member: Users,
  invite: Mail,
  history: History,
  calendar: CalendarClock,
  other: Circle,
};

/**
 * Red jedne izmene (Nedavne izmene u Komandnom centru i ekran Aktivnost): rečenica
 * iz shared `formatActivity` („Ana je zaključao/la „X"") i vreme ispod nje. Dodir vodi
 * kroz `activityTarget`; izmena bez cilja (startup, profil, poziv) nije dodirljiva.
 */
export function ActivityRow({
  model,
  onOpen,
  style,
}: {
  model: ActivityRowModel;
  onOpen: (target: ActivityTarget) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useThemeColors();
  const Icon = ACTIVITY_ICON[model.icon];
  const interactive = model.target.kind !== 'none';
  return (
    <Row
      icon={<Icon size={20} color={colors.mutedForeground} />}
      title={model.sentence}
      titleNumberOfLines={2}
      subtitle={model.time}
      showChevron={false}
      accessibilityLabel={`${model.sentence}, ${model.time}`}
      accessibilityHint={interactive ? 'Otvara izmenjeno' : undefined}
      onPress={
        interactive
          ? () => {
              haptics.tap();
              onOpen(model.target);
            }
          : undefined
      }
      style={[styles.row, style]}
    />
  );
}

/**
 * Kuda vodi izmena: stranica (zadatak se sam preusmeri na svoj ekran), ideja ili
 * oblast. Sve ostalo ne vodi nigde. Ekrani entiteta čitaju aktivan startup, a
 * aktivnost je uvek njegova.
 */
export function openActivityTarget(router: ReturnType<typeof useRouter>, target: ActivityTarget): void {
  switch (target.kind) {
    case 'page':
      router.push({ pathname: '/stranica/[id]', params: { id: target.pageId } });
      return;
    case 'idea':
      router.push({ pathname: '/ideja/[id]', params: { id: target.ideaId } });
      return;
    case 'area':
      router.push({ pathname: '/oblast/[id]', params: { id: target.areaId } });
      return;
    case 'none':
      return;
  }
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH_TARGET + 12,
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
});
