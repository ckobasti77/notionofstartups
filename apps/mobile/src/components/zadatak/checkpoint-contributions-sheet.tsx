import { ScrollView, StyleSheet, Text } from 'react-native';

import { ContributionThread } from '@/components/ideja/contribution-thread';
import { Sheet } from '@/components/ui/sheet';
import type { TaskCheckpoint } from '@/lib/tasks';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, text } from '@/theme/tokens';

/**
 * Nit doprinosa nad jednim korakom zadatka (C13) — pandan web
 * `CheckpointContributionDialog` iz `task-checkpoint-list.tsx`. Union član
 * `task_checkpoint` u `ContributionThread` je postojao od početka, ali ga nijedan
 * ekran nije montirao; ovo je taj ekran.
 *
 * `canAdd` je uvek `true` — `collaboration.addContribution` traži samo članstvo u
 * startupu, ne vlasništvo nad korakom (isto kao web).
 *
 * `onDeleted` zatvara sheet: traka „Poništi" se crta na ekranu zadatka, ISPOD
 * modala, pa bi bez zatvaranja postojala a bila nedodirljiva (pravilo iz K3,
 * zapisano i u `canvas/checkpoint-node-sheet.tsx`).
 */
export function CheckpointContributionsSheet({
  checkpoint,
  onClose,
}: {
  /** `null` = zatvoren; vrednost je korak čija se nit prikazuje. */
  checkpoint: TaskCheckpoint | null;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Sheet visible={checkpoint !== null} onClose={onClose} avoidKeyboard style={styles.sheet}>
      <Text
        accessibilityRole="header"
        numberOfLines={2}
        style={[styles.heading, { color: colors.foreground }]}>
        {checkpoint?.text ?? 'Korak'}
      </Text>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
        Potpisan tekst članova tima uz ovaj korak.
      </Text>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled">
        {checkpoint === null ? null : (
          <ContributionThread
            // Nov korak = nova nit: bez ključa bi kompozer nosio nacrt iz prošlog.
            key={checkpoint._id}
            target={{ kind: 'task_checkpoint', id: checkpoint._id }}
            canAdd
            onDeleted={onClose}
          />
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 16,
  },
  heading: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
  },
  meta: {
    ...text.meta,
    marginTop: 2,
    marginBottom: 8,
  },
  scroll: {
    flexGrow: 0,
  },
  list: {
    paddingBottom: 4,
  },
});
