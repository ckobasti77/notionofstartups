import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { TriangleAlert } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { MyTasksScreen } from '@/components/me/tasks/my-tasks-screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { accessErrorMessage } from '@/lib/errors';
import { useThemeColors } from '@/theme/theme-provider';

/**
 * Moji zadaci (K13) — zadaci iz svih startupa i lični na jednom mestu. Stack
 * ekran van tabova (ulaz iz zaglavlja Danas i iz Više); telo je u
 * `components/me/tasks/my-tasks-screen.tsx`. Greške upita zadataka su stanje
 * ekrana sa „Pokušaj ponovo" (filteri i pretraga ostaju); ovaj `ErrorBoundary`
 * hvata ostalo (profil, lista startupa).
 */
export default function MojiZadaciScreen() {
  return <MyTasksScreen />;
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Moji zadaci" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Zadaci nisu učitani."
        description={accessErrorMessage(error, 'Proveri vezu i pokušaj ponovo.')}
        actionLabel="Pokušaj ponovo"
        onAction={retry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
