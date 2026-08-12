import { Check, Crosshair, Move, ZoomIn, ZoomOut } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text, type ColorTokens } from '@/theme/tokens';

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
 *
 * Režim „Uredi raspored" (lanac 4, `docs/mobile/lanac4/REZIM.md`): u gledanju je
 * prekidač četvrta ikonica, a u režimu se ona sklanja i primarno dugme postaje
 * „Gotovo" — u režimu se raspoređuje postojeće, ne pravi novo, pa „Nova stranica"
 * tu nema šta da traži. Time i na najužem ekranu (360 dp) ostaje mesta za pun tekst
 * dugmeta, a nijedna dodirna meta se ne smanjuje ispod 44pt.
 */
export function CanvasRail({
  onZoomIn,
  onZoomOut,
  onFit,
  primaryAction,
  nodeAction,
  editMode = false,
  onToggleEdit,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  /** Bez ove akcije se primarno dugme ne prikazuje (vrste bez native akcije). */
  primaryAction?: RailAction;
  /**
   * Akcija nad IZABRANIM čvorom („Veličina kartice", K2) — četvrta ikonica u grupi.
   * Slot je slobodan baš u režimu, jer se prekidač tada sklanja (vidi ispod), pa se
   * dodirne mete ne smanjuju: 4 × 44 + 3 × 8 razmaka staje i na 360 dp.
   */
  nodeAction?: RailAction;
  /** Da li je režim „Uredi raspored" upaljen (vlasnik stanja je ekran). */
  editMode?: boolean;
  /** Bez ovoga vrsta kanvasa nema uređivanje i prekidač se ne prikazuje. */
  onToggleEdit?: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  // Ikonu primarnog dugmeta inače daje ekran (on ima kontekst), ali „Gotovo" pripada
  // samom prekidaču režima — da ekran ne mora da duplira istu odluku.
  const action: RailAction | undefined =
    editMode && onToggleEdit
      ? {
          label: 'Gotovo',
          icon: <Check size={18} color={colors.primaryForeground} />,
          onPress: onToggleEdit,
        }
      : primaryAction;
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
        {onToggleEdit && !editMode ? (
          <RailIcon label="Uredi raspored" onPress={onToggleEdit} colors={colors}>
            <Move size={20} color={colors.foreground} />
          </RailIcon>
        ) : null}
        {nodeAction ? (
          <RailIcon label={nodeAction.label} onPress={nodeAction.onPress} colors={colors}>
            {nodeAction.icon}
          </RailIcon>
        ) : null}
      </View>

      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            editMode && onToggleEdit ? 'Gotovo — završi uređivanje rasporeda' : action.label
          }
          onPress={() => {
            haptics.tap();
            action.onPress();
          }}
          style={({ pressed }) => [
            styles.createBtn,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.85 },
          ]}>
          {action.icon}
          <Text
            numberOfLines={1}
            style={[styles.createLabel, { color: colors.primaryForeground }]}>
            {action.label}
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
      // Zoom/centriranje su podešavanje pogleda, ne akcija — najtiši signal.
      onPress={() => {
        haptics.select();
        onPress();
      }}
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
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 16,
    borderRadius: radius.control,
    // U RN je podrazumevani `flexShrink` 0, pa bi se dugme na uskom ekranu (360dp) ili
    // uz uvećan sistemski font prelilo VAN ekrana umesto da se skrati — deo dodirne
    // mete bi tada bio nedodirljiv. `minWidth: 0` je uslov da `numberOfLines={1}`
    // na labeli uopšte pređe u eliptiranje.
    flexShrink: 1,
    minWidth: 0,
  },
  createLabel: {
    ...text.body,
    fontWeight: fontWeight.semibold,
    flexShrink: 1,
  },
});
