import { Crosshair, Plus, ZoomIn, ZoomOut } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, type ColorTokens } from '@/theme/tokens';

/**
 * Native akcioni rail ispod WebView-a (M4.3, §9.3). Zoom i centriranje idu kao
 * `postMessage` u WebView (koji drži pan/zoom); „Nova ideja" je native akcija.
 * Gore desno na dnu radi ergonomije palca.
 */
export function CanvasRail({
  onZoomIn,
  onZoomOut,
  onFit,
  onCreate,
  createLabel,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  /** Bez ove akcije se dugme za kreiranje ne prikazuje (vrste bez native create-a). */
  onCreate?: () => void;
  createLabel: string;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.rail,
        { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 8 },
      ]}>
      <View style={styles.group}>
        <RailIcon label="Umanji" onPress={onZoomOut} colors={colors}>
          <ZoomOut size={20} color={colors.foreground} />
        </RailIcon>
        <RailIcon label="Uvećaj" onPress={onZoomIn} colors={colors}>
          <ZoomIn size={20} color={colors.foreground} />
        </RailIcon>
        <RailIcon label="Centriraj" onPress={onFit} colors={colors}>
          <Crosshair size={20} color={colors.foreground} />
        </RailIcon>
      </View>

      {onCreate ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={createLabel}
          onPress={onCreate}
          style={({ pressed }) => [
            styles.createBtn,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.85 },
          ]}>
          <Plus size={18} color={colors.primaryForeground} />
          <Text style={[styles.createLabel, { color: colors.primaryForeground }]}>{createLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function RailIcon({
  label,
  onPress,
  colors,
  children,
}: {
  label: string;
  onPress: () => void;
  colors: ColorTokens;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.railIcon,
        { borderColor: colors.border },
        pressed && { backgroundColor: colors.muted },
      ]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  group: {
    flexDirection: 'row',
    gap: 8,
  },
  railIcon: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 16,
    borderRadius: radius.md,
  },
  createLabel: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
  },
});
