import { hubChannelName, type HubChannel } from '@devotion/shared';
import { CheckCheck, LogOut, MessageCircle, Settings } from 'lucide-react-native';
import { StyleSheet, Text } from 'react-native';

import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { useRetained } from '@/hooks/use-retained';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, spacing, text } from '@/theme/tokens';

import { hubRowActions, type HubRowAction } from './hub-model';

/**
 * Sheet dugog pritiska na red huba (plan K07 §1.6): „Otvori razgovor",
 * „Označi kao pročitano" (kad ima nepročitanog), a za ličnu grupu i
 * „Podešavanja grupe" / „Napusti grupu". Koje radnje postoje odlučuje
 * `hubRowActions` (testirano); sheet samo prosleđuje izbor.
 */
export function HubActionsSheet({
  channel,
  onClose,
  onAction,
}: {
  channel: HubChannel | null;
  onClose: () => void;
  onAction: (action: HubRowAction, channel: HubChannel) => void;
}) {
  const colors = useThemeColors();
  // Sadržaj ostaje dok sheet izlazi (inače bi se prazan panel spuštao).
  const shown = useRetained(channel);
  const actions = shown ? hubRowActions(shown) : [];

  return (
    <Sheet visible={channel !== null} onClose={onClose} dragAnywhere>
      {shown ? (
        <>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={[styles.title, { color: colors.mutedForeground }]}>
            {hubChannelName(shown)}
          </Text>
          {actions.map((action) => {
            const meta = ACTIONS[action];
            const Icon = meta.icon;
            const tint = meta.destructive ? colors.destructive : colors.foreground;
            return (
              <Row
                key={action}
                icon={<Icon size={20} color={tint} />}
                title={meta.label}
                showChevron={false}
                onPress={() => {
                  // Dodir tokom izlazne animacije ne radi ništa.
                  if (channel !== null) onAction(action, channel);
                }}
              />
            );
          })}
        </>
      ) : null}
    </Sheet>
  );
}

const ACTIONS: Record<
  HubRowAction,
  { label: string; icon: typeof MessageCircle; destructive?: boolean }
> = {
  open: { label: 'Otvori razgovor', icon: MessageCircle },
  markRead: { label: 'Označi kao pročitano', icon: CheckCheck },
  groupSettings: { label: 'Podešavanja grupe', icon: Settings },
  leaveGroup: { label: 'Napusti grupu', icon: LogOut, destructive: true },
};

const styles = StyleSheet.create({
  title: {
    ...text.meta,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
});
