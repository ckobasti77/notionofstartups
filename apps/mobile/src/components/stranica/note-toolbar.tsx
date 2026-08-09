import { useBridgeState, type EditorBridge } from '@10play/tentap-editor';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  Link2Off,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius, type ColorTokens } from '@/theme/tokens';

export type LinkRequest = {
  /** Selekcija u trenutku otvaranja — Android je gubi čim fokus ode iz WebView-a. */
  selection: { from: number; to: number };
  href: string;
};

type ToolbarButton = {
  key: string;
  label: string;
  Icon: typeof Bold;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

/** Vidljivost tastature — traka prati tastaturu, ne stoji ispod nje. */
function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // `Will*` postoji samo na iOS-u; Android emituje isključivo `Did*`.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/**
 * Traka sa alatima za belešku. Namerno **nije** `Toolbar` iz tentap-a: njegov je
 * na engleskom (link bar „Type your URL here…"), bez `accessibilityLabel`-a i sa
 * H1–H6 u podmeniju. Ovaj ima srpske oznake, ikone iz `lucide-react-native` kao
 * ostatak aplikacije i H1–H3 direktno (paritet sa webom, gde su H1/H2 u traci).
 *
 * `useBridgeState` se osvežava na svaku promenu selekcije — zato živi OVDE, u
 * listu, a ne u `NoteEditor`-u: inače bi se `RichText` (WebView) prerenderovao na
 * svaki potez kursora.
 */
export function NoteToolbar({
  editor,
  onRequestLink,
}: {
  editor: EditorBridge;
  onRequestLink: (request: LinkRequest) => void;
}) {
  const colors = useThemeColors();
  const state = useBridgeState(editor);
  const keyboardVisible = useKeyboardVisible();

  // Kad tastatura nije gore traka nema šta da prati — sakrij je da ne pokriva
  // tekst. Isto pravilo koje ima i tentap-ov Toolbar.
  if (!keyboardVisible || !state.isFocused) return null;

  const buttons: Array<ToolbarButton | 'separator'> = [
    {
      key: 'bold',
      label: 'Podebljano',
      Icon: Bold,
      active: state.isBoldActive,
      disabled: !state.canToggleBold,
      onPress: () => editor.toggleBold(),
    },
    {
      key: 'italic',
      label: 'Kurziv',
      Icon: Italic,
      active: state.isItalicActive,
      disabled: !state.canToggleItalic,
      onPress: () => editor.toggleItalic(),
    },
    {
      key: 'strike',
      label: 'Precrtano',
      Icon: Strikethrough,
      active: state.isStrikeActive,
      disabled: !state.canToggleStrike,
      onPress: () => editor.toggleStrike(),
    },
    {
      key: 'code',
      label: 'Kod',
      Icon: Code,
      active: state.isCodeActive,
      disabled: !state.canToggleCode,
      onPress: () => editor.toggleCode(),
    },
    {
      key: 'link',
      label: state.isLinkActive ? 'Izmeni link' : 'Dodaj link',
      Icon: Link2,
      active: state.isLinkActive,
      disabled: !state.isLinkActive && !state.canSetLink,
      onPress: () =>
        onRequestLink({
          selection: state.selection,
          href: state.activeLink ?? '',
        }),
    },
    ...(state.isLinkActive
      ? [
          {
            key: 'unlink',
            label: 'Ukloni link',
            Icon: Link2Off,
            onPress: () => editor.setLink(null),
          } satisfies ToolbarButton,
        ]
      : []),
    'separator',
    {
      key: 'h1',
      label: 'Naslov 1',
      Icon: Heading1,
      active: state.headingLevel === 1,
      disabled: !state.canToggleHeading,
      onPress: () => editor.toggleHeading(1),
    },
    {
      key: 'h2',
      label: 'Naslov 2',
      Icon: Heading2,
      active: state.headingLevel === 2,
      disabled: !state.canToggleHeading,
      onPress: () => editor.toggleHeading(2),
    },
    {
      key: 'h3',
      label: 'Naslov 3',
      Icon: Heading3,
      active: state.headingLevel === 3,
      disabled: !state.canToggleHeading,
      onPress: () => editor.toggleHeading(3),
    },
    'separator',
    {
      key: 'bullet',
      label: 'Lista',
      Icon: List,
      active: state.isBulletListActive,
      disabled: !state.canToggleBulletList,
      onPress: () => editor.toggleBulletList(),
    },
    {
      key: 'ordered',
      label: 'Numerisana lista',
      Icon: ListOrdered,
      active: state.isOrderedListActive,
      disabled: !state.canToggleOrderedList,
      onPress: () => editor.toggleOrderedList(),
    },
    {
      key: 'task',
      label: 'Čekirana lista',
      Icon: ListChecks,
      active: state.isTaskListActive,
      disabled: !state.canToggleTaskList,
      onPress: () => editor.toggleTaskList(),
    },
    {
      key: 'quote',
      label: 'Citat',
      Icon: Quote,
      active: state.isBlockquoteActive,
      disabled: !state.canToggleBlockquote,
      onPress: () => editor.toggleBlockquote(),
    },
    'separator',
    {
      key: 'sink',
      label: 'Uvuci stavku',
      Icon: IndentIncrease,
      disabled: !state.canSink && !state.canSinkTaskListItem,
      // Obična i čekirana lista imaju istu radnju pod različitim imenom.
      onPress: () => (state.canSink ? editor.sink() : editor.sinkTaskListItem()),
    },
    {
      key: 'lift',
      label: 'Izvuci stavku',
      Icon: IndentDecrease,
      disabled: !state.canLift && !state.canLiftTaskListItem,
      onPress: () => (state.canLift ? editor.lift() : editor.liftTaskListItem()),
    },
    'separator',
    {
      key: 'undo',
      label: 'Poništi',
      Icon: Undo2,
      disabled: !state.canUndo,
      onPress: () => editor.undo(),
    },
    {
      key: 'redo',
      label: 'Ponovi',
      Icon: Redo2,
      disabled: !state.canRedo,
      onPress: () => editor.redo(),
    },
  ];

  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="Alati za uređivanje"
      style={[
        styles.bar,
        { backgroundColor: colors.surfaceRaised, borderTopColor: colors.border },
      ]}>
      <ScrollView
        horizontal
        // Bez ovoga prvi dodir samo skloni tastaturu umesto da primeni alat.
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}>
        {buttons.map((button, index) =>
          button === 'separator' ? (
            <View
              key={`separator-${index}`}
              style={[styles.separator, { backgroundColor: colors.border }]}
            />
          ) : (
            <ToolbarIconButton key={button.key} button={button} colors={colors} />
          ),
        )}
      </ScrollView>
    </View>
  );
}

function ToolbarIconButton({
  button,
  colors,
}: {
  button: ToolbarButton;
  colors: ColorTokens;
}) {
  const { Icon, active = false, disabled = false } = button;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={button.label}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={button.onPress}
      style={({ pressed }) => [
        styles.button,
        active && { backgroundColor: colors.accent },
        pressed && !active && { backgroundColor: colors.muted },
        disabled && styles.disabled,
      ]}>
      <Icon
        size={20}
        color={active ? colors.accentForeground : colors.mutedForeground}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  button: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  disabled: {
    opacity: 0.35,
  },
  separator: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    marginHorizontal: 6,
  },
});
