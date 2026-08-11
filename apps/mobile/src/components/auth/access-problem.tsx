import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, spacing, text } from '@/theme/tokens';

/**
 * Prikazuje se kad je korisnik prijavljen ali onboarding ne može da se završi
 * (npr. `INVITE_REQUIRED`, `INVITE_EMAIL_MISMATCH`). Preslikava `AccessProblem`
 * iz web [app-root.tsx].
 */
export function AccessProblem({
  message,
  onSignOut,
}: {
  message: string;
  onSignOut: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, text.title, { color: colors.foreground }]}>
            Pristup nije završen
          </Text>
          <Text style={[styles.message, text.body, { color: colors.mutedForeground }]}>
            {message}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onSignOut}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.primary },
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.buttonLabel, { color: colors.primaryForeground }]}>
              Odjavi se
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  // 16px minimum: ovo je jedina akcija na ekranu greške pristupa.
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: spacing.lg,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
  },
  button: {
    marginTop: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  pressed: {
    opacity: 0.7,
  },
});
