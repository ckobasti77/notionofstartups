import { Crosshair, ZoomIn, ZoomOut } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, type ColorTokens } from '@/theme/tokens';

/**
 * Kontekstualna primarna akcija rail-a: bez selekcije je „Nova ideja", a kad je na
 * kanvasu izabran jedan čvor postaje „Otvori ideju" (§5.2). Ekran odlučuje koja je
 * — rail samo crta. Ikonu daje ekran (ima boje), pa je ovde `ReactNode`.
 */
export type RailAction = {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
};

/**
 * Native akcioni rail ispod WebView-a (M4.3, §9.3). Zoom i centriranje idu kao
 * `postMessage` u WebView (koji drži pan/zoom); primarna akcija je native.
 * Gore desno na dnu radi ergonomije palca.
 */
export function CanvasRail({
  onZoomIn,
  onZoomOut,
  onFit,
  primaryAction,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  /** Bez ove akcije se primarno dugme ne prikazuje (vrste bez native akcije). */
  primaryAction?: RailAction;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.rail,
        {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom + 8,
          // Bočni insetovi za landscape (canvas ekran može da rotira): u položenom
          // prikazu bezbedna zona ide levo/desno pa ikonice ne smeju pod zarez.
          paddingLeft: insets.left + 12,
          paddingRight: insets.right + 12,
        },
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

      {primaryAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={primaryAction.label}
          onPress={primaryAction.onPress}
          style={({ pressed }) => [
            styles.createBtn,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.85 },
          ]}>
          {primaryAction.icon}
          <Text
            numberOfLines={1}
            style={[styles.createLabel, { color: colors.primaryForeground }]}>
            {primaryAction.label}
          </Text>
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
    // Bočni padding dolazi inline sa safe-area insetovima (landscape) — vidi rail.
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  group: {
    flexDirection: 'row',
    gap: 8,
    // Ikonice su fiksne 44pt dodirne mete — nikad se ne skupljaju.
    flexShrink: 0,
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
    // U RN je podrazumevani `flexShrink` 0, pa bi se dugme na uskom ekranu (360dp) ili
    // uz uvećan sistemski font prelilo VAN ekrana umesto da se skrati — deo dodirne
    // mete bi tada bio nedodirljiv. `minWidth: 0` je uslov da `numberOfLines={1}`
    // na labeli uopšte pređe u eliptiranje.
    flexShrink: 1,
    minWidth: 0,
  },
  createLabel: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
    flexShrink: 1,
  },
});
