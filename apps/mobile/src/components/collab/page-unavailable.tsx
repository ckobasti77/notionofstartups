import { useRouter } from 'expo-router';
import { FileX2 } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { isGoneError } from '@/hooks/use-query-state';
import { accessErrorMessage } from '@/lib/errors';
import { backOrProstor } from '@/lib/navigation/back-to-prostor';
import { useThemeColors } from '@/theme/theme-provider';
import { text } from '@/theme/tokens';

/**
 * Stranica ili zadatak se ne mogu otvoriti (K07 §5.6, tabela stanja): obrisan ili
 * nepostojeći sadržaj (npr. duboki link iz obaveštenja) i greška učitavanja. Oba
 * nude „Otvori Korpu" — obrisano je tamo — i „Pokušaj ponovo". U produkciji Convex
 * skriva poruku obične greške, pa se „obrisano" i prekid veze ne razlikuju uvek;
 * zato i opšta greška vodi u Korpu.
 */
export function PageUnavailable({
  subject,
  error,
  onRetry,
}: {
  subject: 'page' | 'task';
  error: Error;
  onRetry: () => void;
}) {
  const colors = useThemeColors();
  const router = useRouter();
  const gone = isGoneError(error);
  const noun = subject === 'task' ? 'zadatak' : 'stranica';
  const title = gone
    ? subject === 'task'
      ? 'Ovaj zadatak je obrisan ili ne postoji.'
      : 'Ova stranica je obrisana ili ne postoji.'
    : subject === 'task'
      ? 'Zadatak nije učitan.'
      : 'Stranica nije učitana.';
  const detail = gone
    ? 'Obrisano se vraća iz Korpe.'
    : accessErrorMessage(error, `Proveri vezu i pokušaj ponovo. Obrisana ${noun} je u Korpi.`);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title={subject === 'task' ? 'Zadatak' : 'Stranica'} onBack={() => backOrProstor(router)} />
      <View accessibilityRole="alert" style={styles.body}>
        <FileX2 size={20} color={colors.mutedForeground} />
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.detail, { color: colors.mutedForeground }]}>{detail}</Text>
        <View style={styles.actions}>
          <Button
            label="Otvori Korpu"
            variant={gone ? 'default' : 'secondary'}
            onPress={() => router.push('/korpa')}
          />
          <Button label="Pokušaj ponovo" variant="ghost" onPress={onRetry} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  title: {
    ...text.title,
    textAlign: 'center',
  },
  detail: {
    ...text.body,
    textAlign: 'center',
  },
  actions: {
    marginTop: 8,
    gap: 8,
    alignSelf: 'stretch',
  },
});
