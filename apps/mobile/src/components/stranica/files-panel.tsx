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
  Pencil,
  Plus,
  // Ikonica tabele; alias jer `Sheet` je i naš bottom-sheet primitiv.
  Sheet as SheetIcon,
  Trash2,
  type LucideIcon,
} from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { FilePreview, type PreviewFile } from '@/components/stranica/file-preview';
import { Button } from '@/components/ui/button';
import { FAB } from '@/components/ui/fab';
import { Input } from '@/components/ui/input';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { MAX_PAGE_FILES } from '@/convex/lib/page_files';
import { formatFileSize } from '@/lib/chat';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { planPageFilePicks, rejectedPicksMessage } from '@/lib/page-file-picks';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, space, text, type ColorTokens } from '@/theme/tokens';

type FileCategory = 'image' | 'video' | 'pdf' | 'audio' | 'sheet' | 'document';

const CATEGORY_META: Record<FileCategory, { icon: LucideIcon; label: string }> = {
  image: { icon: FileImage, label: 'Slika' },
  video: { icon: FileVideo, label: 'Video' },
  pdf: { icon: FileText, label: 'PDF' },
  audio: { icon: FileAudio, label: 'Audio' },
  sheet: { icon: SheetIcon, label: 'Tabela' },
  document: { icon: FileIcon, label: 'Dokument' },
};

type PickInput = {
  uri: string;
  name: string;
  mimeType: string;
  /** `null` kad izvor ne javi veličinu — server je onda meri iz bloba. */
  size: number | null;
};

/**
 * Prilozi „fajl" oblačića (spec §9.4). Upload iz galerije, kamere i sistemskog
 * birača dokumenata — galerija i birač dokumenata primaju VIŠE fajlova odjednom
 * (P7/D11, pandan web `page-files-panel.tsx` `multiple` + `uploadMany`), kamera
 * ostaje jedan snimak. Slika, PDF, video i audio se pregledaju u aplikaciji
 * (P7/D16), tabela i dokument idu u sistemski otvarač — isto što web renderuje,
 * odnosno ne renderuje. Slanje i brisanje su samo za autora oblačića (`canManage`).
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
  const rename = useMutation(api.pageFiles.rename);

  /**
   * Broj priloga koji su još u redu za slanje. `number`, ne `boolean` — brojač se
   * podiže za CELU seriju odjednom, inače bi indikator na FAB-u pao na nulu
   * između dva fajla i treptao (isti obrazac kao `chat/message-composer.tsx`).
   */
  const [uploads, setUploads] = useState(0);
  /** Serija ide REDOM, jedan upload za drugim — kao web `uploadMany`. */
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const [menuOpen, setMenuOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewFile | null>(null);
  const [renaming, setRenaming] = useState<{ fileId: Id<'pageFiles'>; name: string } | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  async function upload(input: PickInput) {
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
    }
  }

  /**
   * Red čekanja za seriju priloga: jedan upload za drugim, redom kojim su fajlovi
   * izabrani. Paralelno slanje bi se otimalo o `MAX_PAGE_FILES` (svaki
   * `generateUploadUrl` proverava kapacitet nezavisno), a redosled bi zavisio od
   * brzine mreže po fajlu.
   */
  function enqueue(inputs: PickInput[]) {
    if (inputs.length === 0) return;
    setUploads((count) => count + inputs.length);
    queueRef.current = queueRef.current.then(async () => {
      for (const input of inputs) {
        try {
          await upload(input);
        } finally {
          setUploads((count) => Math.max(0, count - 1));
        }
      }
    });
  }

  /**
   * Predprovera pre reda čekanja: odbijeni se KAŽU naglas, jednim `Alert`-om.
   * Tiho odsecanje bi izgledalo kao da je fajl poslat pa nestao (isti nalaz koji
   * je P3 zatvorio u chatu).
   */
  function startPicks(picks: PickInput[]) {
    const plan = planPageFilePicks({ existingCount: files?.length ?? 0, picked: picks });
    if (plan.rejected.length > 0) {
      haptics.warning();
      Alert.alert(
        plan.accepted.length > 0 ? 'Neki prilozi nisu poslati' : 'Prilog odbijen',
        rejectedPicksMessage(plan.rejected),
      );
    }
    enqueue(plan.accepted);
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
      // Granicu ovde daje SERVER (`MAX_PAGE_FILES`), za razliku od chata gde je
      // 10 po izboru svesna klijentska odluka — prilog stranice ima tvrd plafon.
      allowsMultipleSelection: true,
      selectionLimit: MAX_PAGE_FILES,
      quality: 0.8,
    });
    if (result.canceled) return;
    startPicks(
      result.assets.map((asset, index) => ({
        uri: asset.uri,
        name:
          asset.fileName ??
          (asset.type === 'video' ? `video-${index + 1}.mp4` : `slika-${index + 1}.jpg`),
        mimeType: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        size: asset.fileSize ?? null,
      })),
    );
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
    startPicks([
      {
        uri: asset.uri,
        name: asset.fileName ?? 'fotografija.jpg',
        mimeType: asset.mimeType ?? 'image/jpeg',
        size: asset.fileSize ?? null,
      },
    ]);
  }

  async function pickDocument() {
    setMenuOpen(false);
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (result.canceled) return;
    startPicks(
      result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        size: asset.size ?? null,
      })),
    );
  }

  function openFile(file: NonNullable<typeof files>[number]) {
    // Sve što web renderuje u svom pregledaču (`file-viewer-dialog.tsx`) ide u
    // pregled — i kad je `url` prazan, jer tada pregled kaže ZAŠTO je prazan.
    if (
      file.category === 'image' ||
      file.category === 'pdf' ||
      file.category === 'video' ||
      file.category === 'audio'
    ) {
      setPreview({ name: file.name, url: file.url, kind: file.category });
      return;
    }
    if (!file.url) {
      Alert.alert('Nedostupno', 'Ovaj prilog trenutno nije dostupan.');
      return;
    }
    // Sistemski otvarač za tabelu i dokument — ni web ih ne prikazuje u pregledu.
    void WebBrowser.openBrowserAsync(file.url).catch(() => Linking.openURL(file.url!));
  }

  /**
   * Preimenovanje priloga — pandan `pageFiles.rename` sa weba
   * (`page-files-panel.tsx`). `Alert.prompt` postoji samo na iOS-u, pa Android
   * dobija isti tok kroz mali sheet umesto da radnja fali na pola platformi.
   */
  function startRename(fileId: Id<'pageFiles'>, name: string) {
    haptics.tap();
    setRenaming({ fileId, name });
  }

  async function submitRename(next: string) {
    const target = renaming;
    if (target === null) return;
    const clean = next.trim();
    if (!clean) {
      setRenameError('Naziv ne sme biti prazan.');
      return;
    }
    setRenameBusy(true);
    try {
      await rename({ fileId: target.fileId, name: clean });
      haptics.success();
      setRenaming(null);
      setRenameError(null);
    } catch (error) {
      haptics.error();
      setRenameError(accessErrorMessage(error, 'Prilog nije preimenovan.'));
    } finally {
      setRenameBusy(false);
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
    // Oblik reda priloga: ikonica vrste 40 + naziv + veličina.
    return (
      <SkeletonList
        count={4}
        style={styles.list}
        item={(index) => <SkeletonRow index={index} leading="square" subtitle />}
      />
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
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Preimenuj ${file.name}`}
                      onPress={() => {
                        setRenameDraft(file.name);
                        setRenameError(null);
                        startRename(file._id, file.name);
                      }}
                      style={({ pressed }) => [styles.deleteBtn, pressed && { backgroundColor: colors.muted }]}>
                      <Pencil size={18} color={colors.mutedForeground} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Obriši ${file.name}`}
                      onPress={() => confirmRemove(file._id, file.name)}
                      style={({ pressed }) => [styles.deleteBtn, pressed && { backgroundColor: colors.muted }]}>
                      <Trash2 size={18} color={colors.destructive} />
                    </Pressable>
                  </>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}

      {showAdd ? (
        <FAB
          icon={Plus}
          accessibilityLabel={
            uploads > 0 ? `Šalje se ${uploads} priloga` : 'Dodaj prilog'
          }
          busy={uploads > 0}
          onPress={() => {
            haptics.tap();
            setMenuOpen(true);
          }}
          style={{ bottom: insets.bottom + 16 }}
        />
      ) : null}

      <AddMenu
        open={menuOpen}
        colors={colors}
        onLibrary={pickFromLibrary}
        onCamera={pickFromCamera}
        onDocument={pickDocument}
        onClose={() => setMenuOpen(false)}
      />

      <Sheet
        visible={renaming !== null}
        onClose={() => setRenaming(null)}
        avoidKeyboard
        style={styles.renameSheet}>
        <Text accessibilityRole="header" style={[styles.renameHeading, { color: colors.foreground }]}>
          Preimenuj prilog
        </Text>
        {renameError === null ? null : (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.renameError, { color: colors.destructive }]}>
            {renameError}
          </Text>
        )}
        <Input
          value={renameDraft}
          onChangeText={(next) => {
            setRenameDraft(next);
            if (renameError !== null) setRenameError(null);
          }}
          autoFocus
          editable={!renameBusy}
          accessibilityLabel="Naziv priloga"
          returnKeyType="done"
          onSubmitEditing={() => void submitRename(renameDraft)}
        />
        <View style={styles.renameActions}>
          <Button
            label="Otkaži"
            variant="ghost"
            disabled={renameBusy}
            onPress={() => setRenaming(null)}
            style={styles.renameBtn}
          />
          <Button
            label="Sačuvaj"
            loading={renameBusy}
            onPress={() => void submitRename(renameDraft)}
            style={styles.renameBtn}
          />
        </View>
      </Sheet>

      <FilePreview file={preview} onClose={() => setPreview(null)} />
    </View>
  );
}

function AddMenu({
  open,
  colors,
  onLibrary,
  onCamera,
  onDocument,
  onClose,
}: {
  open: boolean;
  colors: ColorTokens;
  onLibrary: () => void;
  onCamera: () => void;
  onDocument: () => void;
  onClose: () => void;
}) {
  const pick = (action: () => void) => () => {
    haptics.tap();
    action();
  };
  return (
    // Tri reda bez skrola — prevlačenje hvata ceo sheet.
    <Sheet visible={open} onClose={onClose} dragAnywhere>
      <Row
        icon={<ImagePlus size={22} color={colors.foreground} />}
        title="Iz galerije"
        onPress={pick(onLibrary)}
        showChevron={false}
      />
      <Row
        icon={<Camera size={22} color={colors.foreground} />}
        title="Slikaj kamerom"
        onPress={pick(onCamera)}
        showChevron={false}
      />
      <Row
        icon={<FileIcon size={22} color={colors.foreground} />}
        title="Iz dokumenata"
        onPress={pick(onDocument)}
        showChevron={false}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  renameSheet: {
    paddingHorizontal: space[5],
    gap: space[2],
  },
  renameHeading: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
  },
  renameError: {
    ...text.body,
  },
  renameActions: {
    flexDirection: 'row',
    gap: space[2],
    paddingTop: space[1],
  },
  renameBtn: {
    flex: 1,
  },
  flex: { flex: 1 },
  list: {
    padding: 16,
    paddingTop: 8,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 8,
    minHeight: 56,
    borderRadius: radius.card,
  },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
    borderRadius: radius.control,
  },
});
