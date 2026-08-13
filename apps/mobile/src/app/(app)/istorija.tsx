import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Eraser, History, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { AccessibilityInfo, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { Row } from '@/components/ui/row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useUndoRunner } from '@/hooks/use-undo-runner';
import { accessErrorMessage } from '@/lib/errors';
import { formatActivityTime } from '@/lib/activity';
import { haptics } from '@/lib/haptics';
import { clearUndo, popUndo, useUndoStack, type UndoEntry } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, space, type ColorTokens } from '@/theme/tokens';

/**
 * Ekran „Istorija radnji" (PARITET-REVIZIJA C12) — poništavanje ide VIŠE koraka
 * unazad, ne samo poslednju stavku koju traka nudi 8s. Stek je isključivo u
 * memoriji procesa (`lib/undo.ts`) — backend nema upit za arhivirane redove,
 * isti razlog zbog kog traka na dnu radi in-memory (`ZA-POPRAVKU` §13). Zato
 * OVAJ ekran nema stanje „učitavanje" — nema upita koji bi ga izazvao, a to je
 * namerno, ne propust.
 *
 * Poništava se STRIKTNO redom, od najnovije (LIFO) — isto što web stek radi
 * (`workspace-history.tsx`). Redo NIJE urađen — odluka i razlog:
 * `docs/mobile/ZA-POPRAVKU.md` §12.
 */
export default function IstorijaScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const runUndo = useUndoRunner();
  const stack = useUndoStack(); // najnovija prva
  const [busyKey, setBusyKey] = useState<number | null>(null);

  async function onUndo(entry: UndoEntry) {
    if (busyKey !== null) return;
    setBusyKey(entry.key);
    haptics.tap();
    try {
      await runUndo(entry.action);
      // Bez `advertiseNext` — traka na dnu ne sme da iskoči kad se korisnik
      // vrati sa ovog ekrana na nešto što ovde nije ni video.
      popUndo(entry.key);
      haptics.success();
      AccessibilityInfo.announceForAccessibility('Vraćeno.');
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Vraćanje nije uspelo.'));
    } finally {
      setBusyKey(null);
    }
  }

  function onClearAll() {
    haptics.warning();
    Alert.alert(
      'Očisti spisak?',
      'Radnje se NE poništavaju, samo se sklanjaju sa spiska.',
      [
        { text: 'Odustani', style: 'cancel' },
        {
          text: 'Očisti',
          style: 'destructive',
          onPress: () => {
            clearUndo();
          },
        },
      ],
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Istorija radnji"
        onBack={() => router.back()}
        actions={
          stack.length > 0 ? (
            <IconButton accessibilityLabel="Očisti spisak" onPress={onClearAll}>
              <Eraser size={20} color={colors.foreground} />
            </IconButton>
          ) : undefined
        }
      />

      {stack.length === 0 ? (
        <EmptyState
          icon={<History size={40} color={colors.mutedForeground} />}
          title="Nema radnji za poništavanje."
          description="Ovde stoje poslednje izmene napravljene na telefonu, dok mogu da se ponište."
        />
      ) : (
        <FlatList
          data={stack}
          keyExtractor={(item) => String(item.key)}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space[6] }]}
          renderItem={({ item, index }) => (
            <HistoryRow
              entry={item}
              isTop={index === 0}
              busy={busyKey === item.key}
              disabledByOtherBusy={busyKey !== null && busyKey !== item.key}
              colors={colors}
              onUndo={() => void onUndo(item)}
            />
          )}
          ListFooterComponent={
            stack.length > 1 ? (
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                Poništava se redom, od najnovije.
              </Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

function HistoryRow({
  entry,
  isTop,
  busy,
  disabledByOtherBusy,
  colors,
  onUndo,
}: {
  entry: UndoEntry;
  isTop: boolean;
  busy: boolean;
  disabledByOtherBusy: boolean;
  colors: ColorTokens;
  onUndo: () => void;
}) {
  const subtitle =
    formatActivityTime(entry.createdAt) + (entry.undoUntil !== undefined ? ' · ističe uskoro' : '');
  const interactive = isTop && !busy && !disabledByOtherBusy;

  return (
    <Card style={styles.row}>
      <Row
        title={entry.label}
        subtitle={subtitle}
        disabled={!interactive}
        showChevron={false}
        value={isTop ? (busy ? 'Vraćanje…' : 'Poništi') : undefined}
        onPress={interactive ? onUndo : undefined}
        accessibilityLabel={
          isTop
            ? `Poništi — ${entry.label}, ${subtitle}`
            : `${entry.label}, ${subtitle}. Poništava se redom, od najnovije.`
        }
      />
    </Card>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <IstorijaErrorState message={error.message} onRetry={retry} />;
}

function IstorijaErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Istorija radnji" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Istorija se ne može učitati"
        description={message || 'Došlo je do greške.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: space[4],
    gap: space[3],
  },
  row: {
    padding: 0,
    gap: 0,
    overflow: 'hidden',
  },
  hint: {
    fontSize: 13,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
    paddingTop: space[2],
  },
});
