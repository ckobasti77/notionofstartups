import { startupInitials, startupTone } from '@devotion/shared';
import { Image } from 'expo-image';
import { UserRound } from 'lucide-react-native';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/theme/theme-provider';
import { fontWeight, startupTones, text } from '@/theme/tokens';

/** Pločica: veličina (pt), inicijali i ikonica „Lično". */
const SIZE = {
  sm: { tile: 20, font: 9, icon: 12 },
  md: { tile: 28, font: 12, icon: 16 },
  lg: { tile: 40, font: 15, icon: 22 },
} as const;

export type StartupChipSize = keyof typeof SIZE;

export type StartupChipProps = {
  /** `null` = „Lično". */
  startup: { name: string; logoUrl?: string | null } | null;
  size?: StartupChipSize;
  /** `tint` u redovima (podrazumevano), `solid` za veću pločicu bez loga. */
  variant?: 'tint' | 'solid';
  /** Ime pored pločice. Bez imena pločica je dekorativna — okolina nosi ime. */
  showName?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Ton kao tekst na 16 % tintu istog tona (DNK §2.2: ≥ 4,88:1 svetla / ≥ 6,57:1 tamna). */
const TINT_ALPHA = '29';

/**
 * Čip startupa — potpisni detalj ličnog nivoa (PLAN §7, DNK §1), par web
 * `components/me/startup-chip.tsx`: squircle pločica (zaobljenje 30 %) sa logom
 * ili inicijalima i tonom izvedenim iz imena (`startupTone`), pa isti startup
 * ima istu boju na webu i telefonu. Ton nikad ne nosi status.
 *
 * Inicijali su znak pločice (kao logo), ne tekst za čitanje: sakriveni su od
 * čitača ekrana, a ime stoji pored ili u labeli okoline.
 */
export function StartupChip({
  startup,
  size = 'sm',
  variant = 'tint',
  showName = false,
  style,
}: StartupChipProps) {
  const { colors, scheme } = useAppTheme();
  const dims = SIZE[size];
  const tileShape = { width: dims.tile, height: dims.tile, borderRadius: dims.tile * 0.3 };

  let tile;
  if (startup === null) {
    tile = (
      <View style={[styles.tile, tileShape, { backgroundColor: colors.muted }]}>
        <UserRound size={dims.icon} color={colors.mutedForeground} />
      </View>
    );
  } else if (startup.logoUrl) {
    tile = (
      <View style={[styles.tile, tileShape, { backgroundColor: colors.muted }]}>
        <Image source={{ uri: startup.logoUrl }} style={styles.logo} contentFit="cover" />
      </View>
    );
  } else {
    const tone = startupTones[scheme][startupTone(startup.name)] ?? colors.mutedForeground;
    const solid = variant === 'solid';
    tile = (
      <View
        style={[
          styles.tile,
          tileShape,
          { backgroundColor: solid ? tone : `${tone}${TINT_ALPHA}` },
        ]}>
        <Text
          allowFontScaling={false}
          style={[
            styles.initials,
            { fontSize: dims.font, lineHeight: dims.font + 2, color: solid ? colors.background : tone },
          ]}>
          {startupInitials(startup.name)}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.row, style]}
      accessibilityElementsHidden={!showName}
      importantForAccessibility={showName ? 'auto' : 'no-hide-descendants'}>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {tile}
      </View>
      {showName ? (
        <Text numberOfLines={1} style={[styles.name, { color: colors.mutedForeground }]}>
          {startup === null ? 'Lično' : startup.name}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    flexShrink: 1,
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  initials: {
    fontWeight: fontWeight.bold,
    letterSpacing: -0.2,
  },
  name: {
    ...text.meta,
    flexShrink: 1,
  },
});
