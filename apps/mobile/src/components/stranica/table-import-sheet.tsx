import { useMutation } from 'convex/react';
import * as DocumentPicker from 'expo-document-picker';
import { FileSpreadsheet, Upload } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import {
  MAX_TABLE_CELL_LENGTH,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_IMPORT_BATCH,
  MAX_TABLE_ROWS,
} from '@/lib/table-limits';
import { chunkRows, parseSpreadsheet } from '@/lib/table-import';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, radius, type ColorTokens } from '@/theme/tokens';

const PREVIEW_ROWS = 6;

/** MIME tipovi tabela; DocumentPicker ih mapira u UTI na iOS-u. */
const SPREADSHEET_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'text/csv',
  'text/comma-separated-values',
];

/**
 * Uvoz tabele iz Excel/CSV fajla (spec §9.4). Tok je namerno „pročitaj → PREGLED →
 * tek na potvrdu upiši" — nikad tih uvoz hiljada redova. Parsiranje je u
 * `lib/table-import.ts` (SheetJS, ne `read-excel-file`; razlog je tamo). Upis ide
 * kroz istu `api.pageTables.importRows` mutaciju koju koristi i web
 * (`table-import-dialog.tsx`): serije ≤ `MAX_TABLE_IMPORT_BATCH`, prva nosi kolone
 * i režim, ostale dopunjuju.
 */
export function TableImportSheet({
  pageId,
  open,
  existingRowCount,
  onClose,
}: {
  pageId: Id<'pages'>;
  open: boolean;
  existingRowCount: number;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const importRows = useMutation(api.pageTables.importRows);

  const [matrix, setMatrix] = useState<string[][] | null>(null);
  const [sourceColumns, setSourceColumns] = useState(0);
  const [truncatedCells, setTruncatedCells] = useState(0);
  const [fileName, setFileName] = useState('');
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(true);
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  function reset() {
    setMatrix(null);
    setSourceColumns(0);
    setTruncatedCells(0);
    setFileName('');
    setProgress(null);
  }

  function close() {
    reset();
    onClose();
  }

  // Zatvaranje se blokira dok traje upis — backdrop tap i Android „nazad" ne smeju
  // da resetuju UI dok serije još pišu u pozadini.
  function requestClose() {
    if (busy) return;
    close();
  }

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: SPREADSHEET_TYPES,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;

    setBusy(true);
    try {
      const parsed = await parseSpreadsheet(
        { uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? undefined },
        MAX_TABLE_COLUMNS,
      );
      if (parsed.matrix.length === 0) {
        haptics.warning();
        Alert.alert('Prazan fajl', 'U fajlu nema podataka za uvoz.');
        reset();
        return;
      }
      setMatrix(parsed.matrix);
      setSourceColumns(parsed.columnCount);
      setTruncatedCells(parsed.truncatedCells);
      setFileName(asset.name);
      haptics.success();
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Fajl nije pročitan.'));
      reset();
    } finally {
      setBusy(false);
    }
  }

  // Šta nastaje iz trenutnih prekidača — služi i pregledu i proveri limita.
  const columnLabels =
    matrix === null
      ? []
      : firstRowIsHeader
        ? matrix[0].map((label, index) => label || `Kolona ${index + 1}`)
        : matrix[0].map((_, index) => `Kolona ${index + 1}`);
  const dataRows = matrix === null ? [] : firstRowIsHeader ? matrix.slice(1) : matrix;
  const projectedRows = replace ? dataRows.length : existingRowCount + dataRows.length;

  // Limit se proverava PRE upisa i reaguje na „Zameni" (append menja zbir).
  // Kolone se mere na STVARNOJ širini fajla (`sourceColumns`), ne na već isečenoj
  // matrici — inače bi se višak preko 64 tiho izgubio bez poruke.
  const limitError =
    matrix === null
      ? null
      : sourceColumns > MAX_TABLE_COLUMNS
        ? `Fajl ima ${sourceColumns} kolona; granica je ${MAX_TABLE_COLUMNS}.`
        : projectedRows > MAX_TABLE_ROWS
          ? `Uvoz bi napravio ${projectedRows} redova; granica je ${MAX_TABLE_ROWS}.`
          : null;

  async function runImport() {
    if (matrix === null || limitError !== null) return;
    const columns = columnLabels;

    haptics.tap();
    setBusy(true);
    setProgress({ done: 0, total: dataRows.length });
    let committed = 0;
    try {
      const batches = chunkRows(dataRows, MAX_TABLE_IMPORT_BATCH);
      // Prazan skup redova i dalje šalje jednu seriju — da kreira kolone / primeni
      // „Zameni". Isto ponašanje kao web `runImport`.
      if (batches.length === 0) {
        await importRows({ pageId, columns, rows: [], mode: replace ? 'replace' : 'append' });
      }
      for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        await importRows({
          pageId,
          ...(index === 0 ? { columns } : {}),
          rows: batch,
          mode: index === 0 && replace ? 'replace' : 'append',
        });
        committed = Math.min((index + 1) * MAX_TABLE_IMPORT_BATCH, dataRows.length);
        setProgress({ done: committed, total: dataRows.length });
      }
      haptics.success();
      Alert.alert(
        'Uvoz gotov',
        `Uvezeno: ${dataRows.length} ${dataRows.length === 1 ? 'red' : 'redova'}.` +
          (truncationNote ? ` ${truncationNote}` : ''),
      );
      close();
    } catch (error) {
      haptics.error();
      // Uvoz ide u serijama; ako pukne na sredini, deo je već upisan (u „Zameni"
      // režimu je stari sadržaj već obrisan) — to se korisniku kaže, ne prećuti.
      const base = accessErrorMessage(error, 'Uvoz nije uspeo.');
      const partial =
        committed > 0
          ? ` Deo je već upisan (${committed}/${dataRows.length})${
              replace ? '; stari sadržaj je zamenjen' : ''
            }. Proveri tabelu pre ponovnog pokušaja.`
          : '';
      Alert.alert('Greška', base + partial);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const previewRows = dataRows.slice(0, PREVIEW_ROWS);

  // Ćelije duže od limita su već isečene u `parseSpreadsheet` (da server ne odbije
  // seriju); ovde se korisniku pošteno kaže koliko ih je skraćeno.
  const truncationNote =
    truncatedCells > 0
      ? `${truncatedCells} ${
          truncatedCells === 1 ? 'ćelija je skraćena' : 'ćelija je skraćeno'
        } na ${MAX_TABLE_CELL_LENGTH} znakova.`
      : null;

  return (
    // Ne prelazi ~88% ekrana; višak sadržaja skroluje unutar `body`.
    <Sheet visible={open} onClose={requestClose} maxHeight="88%" style={styles.sheet}>
      {/* Sadržaj skroluje vertikalno — na niskim ekranima sve stane bez odsecanja;
          akcije su zakačene ispod skrola da su uvek dohvatljive. */}
      <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Uvoz iz Excel-a ili CSV-a
            </Text>
            <Text style={[styles.description, { color: colors.mutedForeground }]}>
              Podržani su .xlsx, .xls i .csv. Uvozi se prvi list. Najviše {MAX_TABLE_COLUMNS}{' '}
              kolona i {MAX_TABLE_ROWS} redova.
            </Text>

            {matrix === null ? (
              <View style={styles.pickArea}>
                <Button
                  label={busy ? 'Čitanje…' : 'Izaberi fajl'}
                  variant="secondary"
                  icon={busy ? undefined : <Upload size={18} color={colors.secondaryForeground} />}
                  loading={busy}
                  onPress={pickFile}
                />
              </View>
            ) : (
              <>
                <View style={styles.fileRow}>
                  <FileSpreadsheet size={16} color={colors.primary} />
                  <Text numberOfLines={1} style={[styles.fileName, { color: colors.foreground }]}>
                    {fileName}
                  </Text>
                </View>
                <Text style={[styles.summary, { color: colors.mutedForeground }]}>
                  Nastaje: {dataRows.length} {dataRows.length === 1 ? 'red' : 'redova'} ×{' '}
                  {sourceColumns} {sourceColumns === 1 ? 'kolona' : 'kolone'}
                </Text>
                {truncationNote !== null ? (
                  <Text style={[styles.truncateNote, { color: colors.foreground }]}>
                    {truncationNote}
                  </Text>
                ) : null}

                <ToggleRow
                  label="Prvi red su zaglavlja"
                  value={firstRowIsHeader}
                  onValueChange={setFirstRowIsHeader}
                  disabled={busy}
                  colors={colors}
                />
                <ToggleRow
                  label="Zameni postojeći sadržaj"
                  value={replace}
                  onValueChange={setReplace}
                  disabled={busy}
                  colors={colors}
                />

                {/* Pregled: zaglavlja + prvih nekoliko redova, horizontalni skrol. */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator
                  style={[styles.preview, { borderColor: colors.border }]}
                  contentContainerStyle={styles.previewContent}>
                  {columnLabels.map((label, colIndex) => (
                    <View key={colIndex} style={styles.previewColumn}>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.previewHeader,
                          { color: colors.foreground, backgroundColor: colors.muted },
                        ]}>
                        {label}
                      </Text>
                      {previewRows.map((row, rowIndex) => (
                        <Text
                          key={rowIndex}
                          numberOfLines={1}
                          style={[
                            styles.previewCell,
                            { color: row[colIndex] ? colors.foreground : colors.mutedForeground, borderTopColor: colors.border },
                          ]}>
                          {row[colIndex] || '—'}
                        </Text>
                      ))}
                    </View>
                  ))}
                </ScrollView>

                {limitError !== null ? (
                  <Text style={[styles.limitError, { color: colors.destructive }]}>{limitError}</Text>
                ) : null}
                {progress !== null ? (
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[styles.progress, { color: colors.mutedForeground }]}>
                    Uvoz u toku: {progress.done}/{progress.total}
                  </Text>
                ) : null}
              </>
            )}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.actions}>
          <Button
            label="Otkaži"
            variant="ghost"
            onPress={close}
            style={styles.flexBtn}
            disabled={busy}
          />
          {matrix !== null ? (
            <Button
              label="Uvezi"
              onPress={runImport}
              loading={busy}
              disabled={limitError !== null}
              style={styles.flexBtn}
            />
          ) : null}
        </View>
        {matrix !== null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Izaberi drugi fajl"
            disabled={busy}
            onPress={pickFile}
            style={({ pressed }) => [
              styles.secondaryLink,
              pressed && { backgroundColor: colors.muted },
              busy && { opacity: 0.5 },
            ]}>
            <Text style={[styles.secondaryLinkLabel, { color: colors.primaryText }]}>
              Izaberi drugi fajl
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Sheet>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
  disabled,
  colors,
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled: boolean;
  colors: ColorTokens;
}) {
  // Ceo red je dodirna meta (≥44pt), ne samo ~31pt visok `Switch`. `Switch` je
  // vizuelni (`pointerEvents="none"`), a tap hvata `Pressable` — bez dvostrukog
  // okidanja.
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        haptics.select();
        onValueChange(!value);
      }}
      style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{label}</Text>
      <View pointerEvents="none">
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ true: colors.primary, false: colors.input }}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 20,
  },
  body: {
    flexShrink: 1,
  },
  bodyContent: {
    gap: 10,
    paddingBottom: 4,
  },
  footer: {
    gap: 10,
    paddingTop: 12,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  description: {
    fontSize: 16,
    lineHeight: 22,
  },
  pickArea: {
    paddingVertical: 12,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  fileName: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  summary: {
    fontSize: 16,
  },
  truncateNote: {
    fontSize: 16,
    fontWeight: fontWeight.medium,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  toggleLabel: {
    flex: 1,
    fontSize: fontSize.base,
    marginRight: 12,
  },
  preview: {
    maxHeight: 220,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
  },
  previewContent: {
    padding: 0,
  },
  previewColumn: {
    minWidth: 120,
  },
  previewHeader: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  previewCell: {
    fontSize: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  limitError: {
    // Poruka objašnjava zašto je „Uvezi" blokiran — puna veličina osnovnog teksta.
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  progress: {
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  flexBtn: {
    flex: 1,
  },
  secondaryLink: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  secondaryLinkLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});
