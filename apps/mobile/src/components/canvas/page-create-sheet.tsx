import { useMutation } from 'convex/react';
import { FileText, ListTodo } from 'lucide-react-native';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, radius, type ColorTokens } from '@/theme/tokens';

const MAX_TITLE = 200;

type PageKind = 'note' | 'task';

/**
 * Kreiranje stranice/pod-stranice iz canvas rail-a (M4.4). Native unos naslova +
 * vrste (beleška/zadatak) → `pages.create`; WebView (koji sluša `getAreaCanvasByArea`
 * / `getPageCanvasByPage`) sam pokupi novi čvor realtime. Fajl/tabela se prave na
 * desktopu (traže prilog/kolone) — ovde su namerno izostavljene (§5.2).
 *
 * `parentPageId` bira nivo: `null` = koren oblasti (canvas oblasti), id stranice =
 * pod-stranica (canvas stranice).
 */
export function PageCreateSheet({
  open,
  startupId,
  areaId,
  parentPageId,
  onClose,
}: {
  open: boolean;
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
  parentPageId: Id<'pages'> | null;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const create = useMutation(api.pages.create);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<PageKind>('note');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTitle('');
    setKind('note');
  };

  const submit = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      Alert.alert('Prazan naslov', 'Unesi naslov stranice.');
      return;
    }
    setBusy(true);
    try {
      await create({ startupId, areaId, parentPageId, kind, title: cleanTitle });
      reset();
      onClose();
    } catch (error) {
      Alert.alert('Greška', accessErrorMessage(error, 'Stranica nije kreirana.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Zatvori"
        style={styles.backdrop}
        onPress={onClose}
      />
      <KeyboardAvoidingView behavior="padding" style={styles.avoider} pointerEvents="box-none">
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.popover, borderColor: colors.border, paddingBottom: insets.bottom + 12 },
          ]}>
          <Text style={[styles.heading, { color: colors.foreground }]}>
            {parentPageId === null ? 'Nova stranica' : 'Nova podstranica'}
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            autoFocus
            maxLength={MAX_TITLE}
            placeholder="Naslov"
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.primary}
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input }]}
          />
          <View style={[styles.kindRow, { backgroundColor: colors.muted }]}>
            <KindSegment
              label="Beleška"
              icon={<FileText size={16} color={kind === 'note' ? colors.foreground : colors.mutedForeground} />}
              active={kind === 'note'}
              disabled={busy}
              onPress={() => setKind('note')}
              colors={colors}
            />
            <KindSegment
              label="Zadatak"
              icon={<ListTodo size={16} color={kind === 'task' ? colors.foreground : colors.mutedForeground} />}
              active={kind === 'task'}
              disabled={busy}
              onPress={() => setKind('task')}
              colors={colors}
            />
          </View>
          <View style={styles.actions}>
            <Button label="Otkaži" variant="ghost" onPress={onClose} disabled={busy} style={styles.flexBtn} />
            <Button label="Dodaj" onPress={() => void submit()} loading={busy} style={styles.flexBtn} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function KindSegment({
  label,
  icon,
  active,
  disabled,
  onPress,
  colors,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
  colors: ColorTokens;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.segment,
        active && { backgroundColor: colors.card, borderColor: colors.border },
      ]}>
      {icon}
      <Text
        style={[styles.segmentLabel, { color: active ? colors.foreground : colors.mutedForeground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  avoider: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
    paddingHorizontal: 20,
    gap: 10,
  },
  heading: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
  },
  input: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.base,
  },
  kindRow: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radius.lg,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  segmentLabel: {
    fontSize: 14,
    fontWeight: fontWeight.medium,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  flexBtn: {
    flex: 1,
  },
});
