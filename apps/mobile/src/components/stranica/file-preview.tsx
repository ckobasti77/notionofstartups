import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink, X } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET } from '@/theme/tokens';

export type PreviewFile = {
  name: string;
  url: string;
  /** Samo `image` i `pdf` se prikazuju u aplikaciji (spec §9.4). */
  kind: 'image' | 'pdf';
};

/**
 * Pregled priloga preko celog ekrana. Slika kroz `expo-image`, PDF kroz `WebView`
 * (iOS ga renderuje inline; na Androidu je dugme „Otvori spolja" pouzdan izlaz).
 */
export function FilePreview({ file, onClose }: { file: PreviewFile | null; onClose: () => void }) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={file !== null} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zatvori pregled"
            onPress={onClose}
            style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.muted }]}>
            <X size={24} color={colors.foreground} />
          </Pressable>
          <Text numberOfLines={1} style={[styles.title, { color: colors.foreground }]}>
            {file?.name ?? ''}
          </Text>
          {file ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Otvori spolja"
              onPress={() => void WebBrowser.openBrowserAsync(file.url)}
              style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.muted }]}>
              <ExternalLink size={22} color={colors.foreground} />
            </Pressable>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>

        {file?.kind === 'image' ? (
          <Image
            source={{ uri: file.url }}
            style={styles.image}
            contentFit="contain"
            transition={150}
            accessibilityLabel={file.name}
          />
        ) : file?.kind === 'pdf' ? (
          <WebView
            source={{ uri: file.url }}
            style={styles.web}
            originWhitelist={['*']}
            startInLoadingState
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: fontWeight.semibold,
  },
  image: {
    flex: 1,
  },
  web: {
    flex: 1,
  },
});
