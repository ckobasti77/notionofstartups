import { IDEA_STAGE_LABELS, IDEA_STORED_STAGES, type IdeaStoredStage } from '@devotion/shared';
import { useMutation } from 'convex/react';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, StyleSheet, Text } from 'react-native';

import { stageChangedMessage, type IdeaRowModel } from '@/components/ideja/ideje-model';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { pushUndo } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius } from '@/theme/tokens';

/** Opis faze uz red — jedna kratka rečenica, bez marketinga. */
const STAGE_HINT: Record<IdeaStoredStage, string> = {
  predlog: 'Tek je predložena',
  razmatra_se: 'Tim je razmatra i glasa',
  odobreno: 'Može da postane zadatak ili beleška',
  odbijeno: 'Ne radi se dalje',
};

/**
 * Izbor faze ideje (PROSTOR P6, K07 §5.9, E12): jedini način da se faza menja na
 * telefonu — bez prevlačenja. Otvara se samo kome server dozvoljava
 * (`permissions.canSetStage`); roditelj ne crta dugme drugima. Posle izmene traka
 * „Poništi" vraća prethodnu SAČUVANU fazu.
 */
export function IdeaStageSheet({
  open,
  idea,
  startupId,
  onClose,
}: {
  open: boolean;
  idea: Pick<IdeaRowModel, '_id' | 'stage' | 'title' | 'text'> | null;
  startupId: Id<'startups'>;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const setStage = useMutation(api.ideas.setStage);
  const [busy, setBusy] = useState<IdeaStoredStage | null>(null);

  const choose = async (stage: IdeaStoredStage) => {
    if (idea === null || busy !== null) return;
    // Trenutna faza se samo potvrdi (zatvara sheet) — red nije prigušen da kvačica ostane čitljiva.
    if (idea.stage === stage) {
      onClose();
      return;
    }
    setBusy(stage);
    haptics.tap();
    try {
      const result = await setStage({ startupId, ideaId: idea._id as Id<'ideaNodes'>, stage });
      haptics.success();
      const message = stageChangedMessage(result.stage);
      if (result.previousStage !== result.stage) {
        pushUndo({
          label: message,
          action: {
            kind: 'ideaStage',
            startupId,
            ideaId: idea._id as Id<'ideaNodes'>,
            previousStage: result.previousStage,
          },
        });
      }
      AccessibilityInfo.announceForAccessibility(message);
      onClose();
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Faza nije promenjena.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet visible={open && idea !== null} onClose={onClose} style={styles.sheet}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
        Faza ideje
      </Text>
      {IDEA_STORED_STAGES.map((stage) => {
        // „Postalo zadatak" se ne bira rukom — izvodi se iz pretvaranja.
        const current = idea !== null && idea.stage === stage;
        return (
          <Row
            key={stage}
            title={IDEA_STAGE_LABELS[stage]}
            subtitle={STAGE_HINT[stage]}
            onPress={() => void choose(stage)}
            disabled={busy !== null}
            showChevron={false}
            accessibilityLabel={`${IDEA_STAGE_LABELS[stage]}${current ? ', trenutna faza' : ''}`}
            accessibilityState={{ selected: current, disabled: busy !== null }}
            style={styles.row}
            value={
              busy === stage ? (
                <ActivityIndicator color={colors.primary} />
              ) : current ? (
                <Check size={18} color={colors.primaryText} />
              ) : undefined
            }
          />
        );
      })}
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
  row: {
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
});
