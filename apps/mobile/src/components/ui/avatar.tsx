import { useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, type ColorTokens } from '@/theme/tokens';

export type AvatarProps = {
  /** Ime iz kojeg se izvlače inicijali kad nema slike. */
  name?: string | null;
  /** URL slike; ako fali ili ne učita, prikazuju se inicijali. */
  uri?: string | null;
  size?: number;
  /**
   * Prazno mesto — NEMA osobe (nedodeljen zadatak, „bez zaduženog"). Isečkani
   * krug bez glifa; namerno NIJE siva ikonica čoveka, jer tu čovek ne postoji.
   */
  empty?: boolean;
  /** Opis za čitač ekrana (podrazumevano `name`, odn. „Nedodeljeno" za `empty`). */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** Prva slova prve dve reči imena (npr. „Marko Jovanović" → „MJ"). */
function initialsFrom(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + second).toUpperCase() || '?';
}

/** Deterministički par boja (pozadina/tekst) iz imena — stabilan po korisniku. */
function paletteFor(colors: ColorTokens, name?: string | null) {
  const pairs = [
    { bg: colors.primary, fg: colors.primaryForeground },
    { bg: colors.info, fg: colors.infoForeground },
    { bg: colors.success, fg: colors.successForeground },
    { bg: colors.warning, fg: colors.warningForeground },
    { bg: colors.danger, fg: colors.destructiveForeground },
  ];
  const key = name ?? '';
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return pairs[hash % pairs.length];
}

export function Avatar({
  name,
  uri,
  size = 40,
  empty = false,
  accessibilityLabel,
  style,
}: AvatarProps) {
  const colors = useThemeColors();
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(uri) && !failed && !empty;
  const pair = paletteFor(colors, name);

  if (empty) {
    return (
      <View
        accessible
        accessibilityLabel={accessibilityLabel ?? 'Nedodeljeno'}
        style={[
          styles.base,
          styles.empty,
          { width: size, height: size, borderRadius: radius.pill, borderColor: colors.border },
          style,
        ]}
      />
    );
  }

  return (
    <View
      accessibilityLabel={accessibilityLabel ?? name ?? undefined}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: radius.pill,
          backgroundColor: showImage ? colors.muted : pair.bg,
          borderColor: colors.border,
        },
        style,
      ]}>
      {showImage ? (
        <Image
          source={{ uri: uri as string }}
          style={{ width: size, height: size, borderRadius: radius.pill }}
          contentFit="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={[styles.initials, { color: pair.fg, fontSize: Math.round(size * 0.4) }]}>
          {initialsFrom(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  initials: {
    fontWeight: fontWeight.semibold,
  },
});
