import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  File as FileIcon,
  FileSpreadsheet,
  ImagePlus,
  SquareCode,
  Table2,
} from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import {
  estimateNoteTableHtmlLength,
  NOTE_BODY_LIMIT_SAFETY,
  NOTE_TABLE_MAX_COLS,
  NOTE_TABLE_MAX_ROWS,
} from '@/lib/note-table';
import { normalizeTableMatrix, parseSpreadsheet } from '@/lib/table-import';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, space, text } from '@/theme/tokens';

/** Šta je izabrano za upload — isti oblik kao `PickInput` u `files-panel.tsx`. */
export type NoteInsertPick = { uri: string; name: string; mimeType: string };

/** MIME tipovi tabela; DocumentPicker ih mapira u UTI na iOS-u. */
const SPREADSHEET_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'text/csv',
  'text/comma-separated-values',
];

/**
 * „Dodaj u belešku" — mobilni pandan alatkama iz web trake
 * (`rich-text-editor.tsx:401-434`): slika/video, prilog, tabela, uvoz tabele i
 * blok koda. Na webu je to pet ikonica u traci; ovde je sheet, jer traka već
 * nosi 16 dugmadi i skroluje.
 *
 * Sheet MORA da se renderuje iz `NoteEditor`-a, ne iz trake: traka se odmontira
 * čim tastatura padne, a otvaranje sheet-a je gasi.
 */
export function NoteInsertSheet({
  open,
  bodyLength,
  onClose,
  onUpload,
  onInsertTable,
  onInsertTableContent,
  onInsertCodeBlock,
}: {
  open: boolean;
  /** Trenutna dužina HTML tela — za procenu da li uvezena tabela staje. */
  bodyLength: number;
  onClose: () => void;
  onUpload: (pick: NoteInsertPick) => Promise<void>;
  onInsertTable: () => void;
  onInsertTableContent: (matrix: string[][], firstRowIsHeader: boolean) => void;
  onInsertCodeBlock: () => void;
}) {
  const colors = useThemeColors();
  const [reading, setReading] = useState(false);

  /** Zatvori pa uradi: birači i tastatura ne smeju da se bore sa sheet-om. */
  function run(action: () => void | Promise<void>) {
    return () => {
      haptics.tap();
      onClose();
      void action();
    };
  }

  async function pickFromLibrary() {
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
    await onUpload({
      uri: asset.uri,
      name: asset.fileName ?? (asset.type === 'video' ? 'video.mp4' : 'slika.jpg'),
      mimeType: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
    });
  }

  async function pickFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Dozvola', 'Pristup kameri je odbijen.');
      return;
    }
    // `expo-image-picker`, ne `expo-camera` — isti izbor i iz istog razloga kao u
    // `files-panel.tsx:132`. Posledica: snimanje videa ide samo iz galerije.
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    await onUpload({
      uri: asset.uri,
      name: asset.fileName ?? 'fotografija.jpg',
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
  }

  async function pickDocument() {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    await onUpload({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
    });
  }

  /**
   * Uvoz CSV/XLSX u telo. Granice su uže nego kod tabele oblačića (telo se seče
   * na 80.000 znakova), pa se fajl odbija PRE ubacivanja i uz istu poruku koju
   * daje web. Izbor „prvi red je zaglavlje" je na webu čekboks u dijalogu; ovde
   * je pitanje u `Alert`-u, koje ujedno pokazuje i izmerene dimenzije.
   */
  async function importSpreadsheet() {
    const result = await DocumentPicker.getDocumentAsync({
      type: SPREADSHEET_TYPES,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;

    setReading(true);
    try {
      // Širina se traži na granici + 1 da bi se prekoračenje PRIMETILO, umesto da
      // se višak kolona tiho odseče (isto što radi web).
      const parsed = await parseSpreadsheet(
        { uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? undefined },
        NOTE_TABLE_MAX_COLS + 1,
      );
      const matrix = normalizeTableMatrix(parsed.matrix, NOTE_TABLE_MAX_COLS + 1);
      if (matrix.length === 0) {
        haptics.warning();
        Alert.alert('Prazan fajl', 'U fajlu nema podataka za uvoz.');
        return;
      }
      if (matrix.length > NOTE_TABLE_MAX_ROWS || matrix[0].length > NOTE_TABLE_MAX_COLS) {
        haptics.warning();
        Alert.alert(
          'Prevelika tabela',
          `Tabela u belešci može imati najviše ${NOTE_TABLE_MAX_ROWS} redova i ${NOTE_TABLE_MAX_COLS} kolona — za veće tabele koristi tabela oblačić.`,
        );
        return;
      }
      if (bodyLength + estimateNoteTableHtmlLength(matrix) > NOTE_BODY_LIMIT_SAFETY) {
        haptics.warning();
        Alert.alert(
          'Nema mesta',
          'Tabela je prevelika za telo ove beleške — koristi tabela oblačić.',
        );
        return;
      }
      haptics.success();
      // Sheet se zatvara TEK pri ubacivanju: `runAtSelection` vraća fokus u
      // editor, a fokus iza otvorenog `Modal`-a ne bi digao tastaturu.
      const insert = (firstRowIsHeader: boolean) => () => {
        onClose();
        onInsertTableContent(matrix, firstRowIsHeader);
      };
      Alert.alert(
        'Uvezi tabelu',
        `${asset.name}: ${matrix.length} × ${matrix[0].length}${
          parsed.truncatedCells > 0
            ? `\nSkraćeno predugačkih ćelija: ${parsed.truncatedCells}.`
            : ''
        }`,
        [
          { text: 'Otkaži', style: 'cancel' },
          { text: 'Bez zaglavlja', onPress: insert(false) },
          { text: 'Prvi red je zaglavlje', onPress: insert(true) },
        ],
      );
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Fajl nije pročitan.'));
    } finally {
      setReading(false);
    }
  }

  return (
    // Šest redova bez unutrašnjeg skrola — prevlačenje hvata ceo sheet.
    <Sheet visible={open} onClose={onClose} dragAnywhere>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
        Dodaj u belešku
      </Text>
      {reading ? (
        <View accessibilityLiveRegion="polite" style={styles.busy}>
          <ActivityIndicator size="small" color={colors.mutedForeground} />
          <Text style={[styles.busyText, { color: colors.mutedForeground }]}>
            Čitam fajl…
          </Text>
        </View>
      ) : null}
      <Row
        icon={<ImagePlus size={22} color={colors.foreground} />}
        title="Iz galerije"
        disabled={reading}
        onPress={run(pickFromLibrary)}
        showChevron={false}
      />
      <Row
        icon={<Camera size={22} color={colors.foreground} />}
        title="Slikaj kamerom"
        disabled={reading}
        onPress={run(pickFromCamera)}
        showChevron={false}
      />
      <Row
        icon={<FileIcon size={22} color={colors.foreground} />}
        title="Priloži fajl"
        disabled={reading}
        onPress={run(pickDocument)}
        showChevron={false}
      />
      <Row
        icon={<Table2 size={22} color={colors.foreground} />}
        title="Ubaci tabelu 3×3"
        disabled={reading}
        onPress={run(onInsertTable)}
        showChevron={false}
      />
      {/* Jedini red koji NE zatvara sheet odmah — dok se fajl čita, indikator
          iznad mora da bude vidljiv. */}
      <Row
        icon={<FileSpreadsheet size={22} color={colors.foreground} />}
        title="Uvezi tabelu (CSV/XLSX)"
        disabled={reading}
        onPress={() => {
          haptics.tap();
          void importSpreadsheet();
        }}
        showChevron={false}
      />
      <Row
        icon={<SquareCode size={22} color={colors.foreground} />}
        title="Blok koda"
        disabled={reading}
        onPress={run(onInsertCodeBlock)}
        showChevron={false}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  heading: {
    paddingHorizontal: space[4],
    paddingBottom: space[1],
    fontSize: 18,
    fontWeight: fontWeight.semibold,
  },
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[4],
    paddingBottom: space[2],
  },
  busyText: {
    ...text.body,
  },
});
