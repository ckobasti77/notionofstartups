import { Component, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { accessErrorMessage } from '@/lib/errors';
import { useThemeColors } from '@/theme/theme-provider';
import { text } from '@/theme/tokens';

/**
 * Granica greške jednog bloka (plan K07 §1.5 „Greška"): blok koji padne ne obara
 * ekran oko sebe. Convex upiti bacaju u render kad server prijavi grešku, pa se
 * ovde hvataju i pretvaraju u „<Šta> nije učitano." + „Pokušaj ponovo" (ponovo
 * montira blok). Poruka servera ide kroz `accessErrorMessage`, nikad sirov `message`.
 */
export class BlockBoundary extends Component<
  { children: ReactNode; title: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return (
      <BlockError
        title={this.props.title}
        error={this.state.error}
        onRetry={() => this.setState({ error: null })}
      />
    );
  }
}

function BlockError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: Error;
  onRetry: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View accessibilityRole="alert" style={styles.wrap}>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.detail, { color: colors.mutedForeground }]}>
        {accessErrorMessage(error, 'Proveri vezu i pokušaj ponovo.')}
      </Text>
      <Button label="Pokušaj ponovo" variant="secondary" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'flex-start',
  },
  title: {
    ...text.body,
    fontWeight: '600',
  },
  detail: {
    ...text.body,
  },
});
