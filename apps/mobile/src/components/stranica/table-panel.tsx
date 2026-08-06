import { usePaginatedQuery, useMutation, useQuery } from 'convex/react';
import { Columns3, Plus, Table2 } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { CellEditSheet, ColumnEditSheet } from '@/components/stranica/cell-edit-sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, type ColorTokens } from '@/theme/tokens';

const ROW_HEIGHT = 48;
const HEADER_HEIGHT = 44;
const COL_WIDTH = 150;
/** Jedna serija — `MAX_TABLE_PAGE_SIZE` je 200 na serveru; 50 po zahtevu za mobilni. */
const PAGE_SIZE = 50;

type Column = { id: string; label: string; width?: number };
type EditingCell = { rowId: Id<'pageTableRows'>; columnId: string; columnLabel: string; value: string };
type EditingColumn = { columnId: string; label: string };

/**
 * Prikaz i osnovno editovanje tabele (spec §9.4). Prva kolona je zamrznuta, a
 * ostale skroluju horizontalno; ceo sadržaj deli jedan vertikalni skrol. Vrednost
 * ćelije menja svaki član (tap → `CellEditSheet`); dodavanje/brisanje reda i
 * kolone je samo autor kartice (`canEditStructure`). Redovi se paginiraju.
 */
export function TablePanel({ pageId }: { pageId: Id<'pages'> }) {
  const colors = useThemeColors();
  const meta = useQuery(api.pageTables.getMeta, { pageId });
  const { results: rows, status, loadMore } = usePaginatedQuery(
    api.pageTables.listRows,
    { pageId },
    { initialNumItems: PAGE_SIZE },
  );

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingColumn, setEditingColumn] = useState<EditingColumn | null>(null);
  const [busy, setBusy] = useState(false);

  const setCells = useMutation(api.pageTables.setCells);
  const addRow = useMutation(api.pageTables.addRow);
  const removeRow = useMutation(api.pageTables.removeRow);
  const addColumn = useMutation(api.pageTables.addColumn);
  const renameColumn = useMutation(api.pageTables.renameColumn);
  const removeColumn = useMutation(api.pageTables.removeColumn);

  if (meta === undefined || status === 'LoadingFirstPage') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} accessibilityLabel="Učitavanje tabele" />
      </View>
    );
  }

  const columns = meta.columns as Column[];
  const canEditStructure = meta.canEditStructure;

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    try {
      await action();
      setEditingCell(null);
      setEditingColumn(null);
    } catch (error) {
      Alert.alert('Greška', accessErrorMessage(error, fallback));
    } finally {
      setBusy(false);
    }
  }

  const onAddColumn = () =>
    void run(() => addColumn({ pageId }), 'Kolona nije dodata.');
  const onAddRow = () => void run(() => addRow({ pageId }), 'Red nije dodat.');

  const confirmDeleteRow = (rowId: Id<'pageTableRows'>) =>
    Alert.alert('Obriši red', 'Ovaj red i sve njegove vrednosti biće trajno obrisani.', [
      { text: 'Otkaži', style: 'cancel' },
      {
        text: 'Obriši',
        style: 'destructive',
        onPress: () => void run(() => removeRow({ rowId }), 'Red nije obrisan.'),
      },
    ]);

  const confirmDeleteColumn = (columnId: string) =>
    Alert.alert('Obriši kolonu', 'Kolona i sve njene vrednosti biće trajno obrisane.', [
      { text: 'Otkaži', style: 'cancel' },
      {
        text: 'Obriši',
        style: 'destructive',
        onPress: () => void run(() => removeColumn({ pageId, columnId }), 'Kolona nije obrisana.'),
      },
    ]);

  if (columns.length === 0) {
    return (
      <>
        <EmptyState
          icon={<Table2 size={40} color={colors.mutedForeground} />}
          title="Tabela nema kolona"
          description={
            canEditStructure
              ? 'Dodaj prvu kolonu da bi tabela mogla da primi podatke.'
              : 'Autor kartice još nije dodao kolone.'
          }
          actionLabel={canEditStructure ? 'Dodaj kolonu' : undefined}
          onAction={canEditStructure ? onAddColumn : undefined}
        />
        <ColumnEditSheet
          open={editingColumn !== null}
          label={editingColumn?.label ?? ''}
          saving={busy}
          onRename={(label) =>
            editingColumn &&
            void run(
              () => renameColumn({ pageId, columnId: editingColumn.columnId, label }),
              'Kolona nije preimenovana.',
            )
          }
          onRemove={() => editingColumn && confirmDeleteColumn(editingColumn.columnId)}
          onClose={() => setEditingColumn(null)}
        />
      </>
    );
  }

  const [frozen, ...rest] = columns;

  return (
    <View style={styles.flex}>
      {canEditStructure ? (
        <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
          <ToolbarButton
            icon={<Columns3 size={16} color={colors.foreground} />}
            label="Kolona"
            onPress={onAddColumn}
            disabled={busy}
            colors={colors}
          />
          <ToolbarButton
            icon={<Plus size={16} color={colors.foreground} />}
            label="Red"
            onPress={onAddRow}
            disabled={busy}
            colors={colors}
          />
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.tableRow}>
          {/* Zamrznuta prva kolona */}
          <View>
            <HeaderCell
              column={frozen}
              frozen
              onPress={canEditStructure ? () => setEditingColumn({ columnId: frozen.id, label: frozen.label }) : undefined}
              colors={colors}
            />
            {rows.map((row) => (
              <BodyCell
                key={row._id}
                frozen
                value={row.cells[frozen.id] ?? ''}
                columnLabel={frozen.label}
                onPress={() =>
                  setEditingCell({
                    rowId: row._id,
                    columnId: frozen.id,
                    columnLabel: frozen.label,
                    value: row.cells[frozen.id] ?? '',
                  })
                }
                colors={colors}
              />
            ))}
          </View>

          {/* Ostale kolone — horizontalni skrol */}
          {rest.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator style={styles.flex}>
              <View>
                <View style={styles.headerRow}>
                  {rest.map((column) => (
                    <HeaderCell
                      key={column.id}
                      column={column}
                      onPress={
                        canEditStructure
                          ? () => setEditingColumn({ columnId: column.id, label: column.label })
                          : undefined
                      }
                      colors={colors}
                    />
                  ))}
                </View>
                {rows.map((row) => (
                  <View key={row._id} style={styles.dataRow}>
                    {rest.map((column) => (
                      <BodyCell
                        key={column.id}
                        value={row.cells[column.id] ?? ''}
                        columnLabel={column.label}
                        onPress={() =>
                          setEditingCell({
                            rowId: row._id,
                            columnId: column.id,
                            columnLabel: column.label,
                            value: row.cells[column.id] ?? '',
                          })
                        }
                        colors={colors}
                      />
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : null}
        </View>

        {rows.length === 0 ? (
          <View style={styles.emptyRows}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Tabela još nema redova.
            </Text>
            {canEditStructure ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dodaj prvi red"
                onPress={onAddRow}
                disabled={busy}
                style={({ pressed }) => [
                  styles.addFirstRow,
                  { borderColor: colors.border },
                  pressed && { backgroundColor: colors.muted },
                ]}>
                <Plus size={16} color={colors.foreground} />
                <Text style={[styles.addFirstLabel, { color: colors.foreground }]}>Dodaj red</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {status === 'CanLoadMore' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Učitaj još redova"
            onPress={() => loadMore(PAGE_SIZE)}
            style={({ pressed }) => [
              styles.loadMore,
              { borderColor: colors.border },
              pressed && { backgroundColor: colors.muted },
            ]}>
            <Text style={[styles.loadMoreLabel, { color: colors.primary }]}>Učitaj još redova</Text>
          </Pressable>
        ) : status === 'LoadingMore' ? (
          <View style={styles.loadMore}>
            <ActivityIndicator color={colors.primary} accessibilityLabel="Učitavanje redova" />
          </View>
        ) : null}
      </ScrollView>

      <CellEditSheet
        open={editingCell !== null}
        columnLabel={editingCell?.columnLabel ?? ''}
        value={editingCell?.value ?? ''}
        saving={busy}
        canDeleteRow={canEditStructure}
        onSave={(value) =>
          editingCell &&
          void run(
            () => setCells({ rowId: editingCell.rowId, values: { [editingCell.columnId]: value } }),
            'Vrednost nije sačuvana.',
          )
        }
        onDeleteRow={() => editingCell && confirmDeleteRow(editingCell.rowId)}
        onClose={() => setEditingCell(null)}
      />
      <ColumnEditSheet
        open={editingColumn !== null}
        label={editingColumn?.label ?? ''}
        saving={busy}
        onRename={(label) =>
          editingColumn &&
          void run(
            () => renameColumn({ pageId, columnId: editingColumn.columnId, label }),
            'Kolona nije preimenovana.',
          )
        }
        onRemove={() => editingColumn && confirmDeleteColumn(editingColumn.columnId)}
        onClose={() => setEditingColumn(null)}
      />
    </View>
  );
}

function HeaderCell({
  column,
  frozen = false,
  onPress,
  colors,
}: {
  column: Column;
  frozen?: boolean;
  onPress?: () => void;
  colors: ColorTokens;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'header'}
      accessibilityLabel={onPress ? `Uredi kolonu ${column.label}` : column.label}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cell,
        styles.headerCell,
        frozen && [styles.frozenCell, { borderRightColor: colors.border }],
        { backgroundColor: colors.muted, borderBottomColor: colors.border },
        pressed && onPress && { backgroundColor: colors.secondary },
      ]}>
      <Text numberOfLines={1} style={[styles.headerText, { color: colors.foreground }]}>
        {column.label}
      </Text>
    </Pressable>
  );
}

function BodyCell({
  value,
  columnLabel,
  frozen = false,
  onPress,
  colors,
}: {
  value: string;
  columnLabel: string;
  frozen?: boolean;
  onPress: () => void;
  colors: ColorTokens;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${columnLabel}: ${value || 'prazno'}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cell,
        frozen && [styles.frozenCell, { borderRightColor: colors.border }],
        { backgroundColor: colors.card, borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.muted },
      ]}>
      <Text numberOfLines={1} style={[styles.cellText, { color: value ? colors.foreground : colors.mutedForeground }]}>
        {value || '—'}
      </Text>
    </Pressable>
  );
}

function ToolbarButton({
  icon,
  label,
  onPress,
  disabled,
  colors,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  disabled: boolean;
  colors: ColorTokens;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.toolbarBtn,
        { borderColor: colors.border },
        pressed && { backgroundColor: colors.muted },
        disabled && { opacity: 0.5 },
      ]}>
      {icon}
      <Text style={[styles.toolbarLabel, { color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  toolbar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toolbarLabel: {
    fontSize: 15,
    fontWeight: fontWeight.medium,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  tableRow: {
    flexDirection: 'row',
  },
  headerRow: {
    flexDirection: 'row',
  },
  dataRow: {
    flexDirection: 'row',
  },
  cell: {
    width: COL_WIDTH,
    height: ROW_HEIGHT,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCell: {
    height: HEADER_HEIGHT,
  },
  frozenCell: {
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  headerText: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
  },
  cellText: {
    fontSize: 15,
  },
  emptyRows: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
  addFirstRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  addFirstLabel: {
    fontSize: 15,
    fontWeight: fontWeight.medium,
  },
  loadMore: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  loadMoreLabel: {
    fontSize: 15,
    fontWeight: fontWeight.semibold,
  },
});
