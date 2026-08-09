import { useMutation, useQuery } from 'convex/react';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import {
  Camera,
  File as FileIcon,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  ImagePlus,
  Paperclip,
  Plus,
  Sheet,
  Trash2,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { FilePreview, type PreviewFile } from '@/components/stranica/file-preview';
import { Row } from '@/components/ui/row';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { formatFileSize } from '@/lib/chat';
import { accessErrorMessage } from '@/lib/errors';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius, SHADOW_COLOR, type ColorTokens } from '@/theme/tokens';

type FileCategory = 'image' | 'video' | 'pdf' | 'audio' | 'sheet' | 'document';

const CATEGORY_META: Record<FileCategory, { icon: LucideIcon; label: string }> = {
  image: { icon: FileImage, label: 'Slika' },
  video: { icon: FileVideo, label: 'Video' },
  pdf: { icon: FileText, label: 'PDF' },
  audio: { icon: FileAudio, label: 'Audio' },
  sheet: { icon: Sheet, label: 'Tabela' },
  document: { icon: FileIcon, label: 'Dokument' },
};

type PickInput = { uri: string; name: string; mimeType: string };

/**
 * Prilozi „fajl" oblačića (spec §9.4). Upload iz galerije, kamere i sistemskog
 * birača dokumenata; slika/PDF se pregleda u aplikaciji, ostalo kroz sistemski
 * otvarač. Slanje i brisanje su samo za autora oblačića (`canManage`).
 *
 * Napomena: reorder (`pageFiles.reorder`) je namerno izostavljen — drag-reorder
 * priloga je desktop-ergonomija; na mobilnom je redosled po vremenu dovoljan.
 *
 * `canManage` stiže iz `pages.get` (`permissions.canEdit`) — isti uslov kao
 * server `assertOwner`, pa važi i kad je lista priloga prazna.
 */
export function FilesPanel({ pageId, canManage }: { pageId: Id<'pages'>; canManage: boolean }) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const files = useQuery(api.pageFiles.list, { pageId });

  const generateUploadUrl = useMutation(api.pageFiles.generateUploadUrl);
  const attach = useMutation(api.pageFiles.attach);
  const remove = useMutation(api.pageFiles.remove);

  const [uploading, setUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewFile | null>(null);

  async function upload(input: PickInput) {
    setUploading(true);
    try {
      const { uploadUrl, token } = await generateUploadUrl({ pageId });
      const blob = await (await fetch(input.uri)).blob();
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': input.mimeType },
        body: blob,
      });
      if (!res.ok) throw new Error('Otpremanje nije uspelo.');
      const { storageId } = (await res.json()) as { storageId: Id<'_storage'> };
      const result = await attach({ pageId, storageId, token, name: input.name });
      if (!result.ok) Alert.alert('Prilog odbijen', result.message);
    } catch (error) {
      Alert.alert('Greška', accessErrorMessage(error, 'Prilog nije poslat.'));
    } finally {
      setUploading(false);
    }
  }

  async function pickFromLibrary() {
    setMenuOpen(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Dozvola', 'Pristup galeriji je odbijen.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    await upload({
      uri: asset.uri,
      name: asset.fileName ?? (asset.type === 'video' ? 'video.mp4' : 'slika.jpg'),
      mimeType: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
    });
  }

  async function pickFromCamera() {
    setMenuOpen(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Dozvola', 'Pristup kameri je odbijen.');
      return;
    }
    // Namerno `expo-image-picker`, ne `expo-camera` (spec je tražio `expo-camera`):
    // `launchCameraAsync` otvara sistemsku kameru za jedan snimak i vraća ga
    // spremnog za upload — bez custom preview sloja, dozvola i lifecycle-a koje
    // `expo-camera` nosi. Lakše i dovoljno za „uslikaj prilog".
    // Posledica: snimanje VIDEA iz aplikacije nije moguće (samo foto); video se i
    // dalje može priložiti iz galerije.
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    await upload({
      uri: asset.uri,
      name: asset.fileName ?? 'fotografija.jpg',
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
  }

  async function pickDocument() {
    setMenuOpen(false);
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    await upload({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
    });
  }

  function openFile(file: NonNullable<typeof files>[number]) {
    if (!file.url) {
      Alert.alert('Nedostupno', 'Ovaj prilog trenutno nije dostupan.');
      return;
    }
    if (file.category === 'image' || file.category === 'pdf') {
      setPreview({ name: file.name, url: file.url, kind: file.category });
    } else {
      // Sistemski otvarač za video/audio/tabelu/dokument (spec §9.4).
      void WebBrowser.openBrowserAsync(file.url).catch(() => Linking.openURL(file.url!));
    }
  }

  function confirmRemove(fileId: Id<'pageFiles'>, name: string) {
    Alert.alert('Obriši prilog', `„${name}" biće trajno obrisan.`, [
      { text: 'Otkaži', style: 'cancel' },
      {
        text: 'Obriši',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove({ fileId });
          } catch (error) {
            Alert.alert('Greška', accessErrorMessage(error, 'Prilog nije obrisan.'));
          }
        },
      },
    ]);
  }

  if (files === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} accessibilityLabel="Učitavanje priloga" />
      </View>
    );
  }

  const showAdd = canManage;

  return (
    <View style={styles.flex}>
      {files.length === 0 ? (
        <EmptyState
          icon={<Paperclip size={40} color={colors.mutedForeground} />}
          title="Nema priloga"
          description="Dodaj sliku, dokument ili fotografiju table."
          actionLabel={showAdd ? 'Dodaj prilog' : undefined}
          onAction={showAdd ? () => setMenuOpen(true) : undefined}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 96 }]}
          showsVerticalScrollIndicator={false}>
          {files.map((file) => {
            const Icon = CATEGORY_META[file.category].icon;
            return (
              <View key={file._id} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Row
                  style={styles.rowMain}
                  icon={
                    <View style={[styles.iconChip, { backgroundColor: colors.accent }]}>
                      <Icon size={20} color={colors.primary} />
                    </View>
                  }
                  title={file.name}
                  subtitle={`${CATEGORY_META[file.category].label}${
                    formatFileSize(file.size) ? ` · ${formatFileSize(file.size)}` : ''
                  }`}
                  onPress={() => openFile(file)}
                  showChevron={false}
                  accessibilityLabel={`Otvori ${file.name}`}
                />
                {file.canManage ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Obriši ${file.name}`}
                    onPress={() => confirmRemove(file._id, file.name)}
                    style={({ pressed }) => [styles.deleteBtn, pressed && { backgroundColor: colors.muted }]}>
                    <Trash2 size={18} color={colors.destructive} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}

      {showAdd ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dodaj prilog"
          onPress={() => setMenuOpen(true)}
          disabled={uploading}
          style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 16 }]}>
          {uploading ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Plus size={26} color={colors.primaryForeground} />
          )}
        </Pressable>
      ) : null}

      <AddMenu
        open={menuOpen}
        colors={colors}
        insetBottom={insets.bottom}
        onLibrary={pickFromLibrary}
        onCamera={pickFromCamera}
        onDocument={pickDocument}
        onClose={() => setMenuOpen(false)}
      />

      <FilePreview file={preview} onClose={() => setPreview(null)} />
    </View>
  );
}

function AddMenu({
  open,
  colors,
  insetBottom,
  onLibrary,
  onCamera,
  onDocument,
  onClose,
}: {
  open: boolean;
  colors: ColorTokens;
  insetBottom: number;
  onLibrary: () => void;
  onCamera: () => void;
  onDocument: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Zatvori"
        style={styles.backdrop}
        onPress={onClose}
      />
      <View
        style={[
          styles.menu,
          { backgroundColor: colors.popover, borderColor: colors.border, paddingBottom: insetBottom + 12 },
        ]}>
        <Row
          icon={<ImagePlus size={22} color={colors.foreground} />}
          title="Iz galerije"
          onPress={onLibrary}
          showChevron={false}
        />
        <Row
          icon={<Camera size={22} color={colors.foreground} />}
          title="Slikaj kamerom"
          onPress={onCamera}
          showChevron={false}
        />
        <Row
          icon={<FileIcon size={22} color={colors.foreground} />}
          title="Iz dokumenata"
          onPress={onDocument}
          showChevron={false}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: {
    padding: 16,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 8,
    minHeight: 60,
    borderRadius: radius.lg,
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
    borderRadius: radius.md,
  },
  fab: {
    position: 'absolute',
    right: 16,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: SHADOW_COLOR,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  menu: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    paddingHorizontal: 12,
  },
});
