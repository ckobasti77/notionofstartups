import { Tabs } from 'expo-router';
import { Bell, FolderClosed, House, MessageCircle, Menu, type LucideIcon } from 'lucide-react-native';
import type { ColorValue } from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight } from '@/theme/tokens';

/**
 * Tab bar sa pet tabova: Danas · Prostor · Chat · Obaveštenja · Više
 * (docs/mobile/02-EKRANI.md, sekcija 2). Zaglavlje nosi svaki tab sam
 * (`TabScreen` → `AppHeader`), zato je `headerShown: false`.
 *
 * Aktivan tab je JEDINO obojeno mesto u traci — accent ikonica i labela; neaktivni
 * su prigušeni (`subtle`), sa tanjim potezom ikonice.
 */
export default function TabsLayout() {
  const colors = useThemeColors();

  /** Ikonica taba: accent + deblji potez kad je aktivna, inače prigušeno. */
  const tabIcon =
    (Icon: LucideIcon) =>
    ({ focused, size }: { focused: boolean; color: ColorValue; size: number }) => (
      <Icon
        color={focused ? colors.primary : colors.subtle}
        size={size}
        strokeWidth={focused ? 2.4 : 1.8}
      />
    );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subtle,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: fontWeight.medium },
        tabBarItemStyle: { paddingTop: 4 },
      }}>
      <Tabs.Screen
        name="danas"
        options={{ title: 'Danas', tabBarIcon: tabIcon(House) }}
      />
      <Tabs.Screen
        name="prostor"
        options={{ title: 'Prostor', tabBarIcon: tabIcon(FolderClosed) }}
      />
      <Tabs.Screen
        name="chat"
        options={{ title: 'Chat', tabBarIcon: tabIcon(MessageCircle) }}
      />
      <Tabs.Screen
        name="obavestenja"
        options={{ title: 'Obaveštenja', tabBarIcon: tabIcon(Bell) }}
      />
      <Tabs.Screen name="vise" options={{ title: 'Više', tabBarIcon: tabIcon(Menu) }} />
    </Tabs>
  );
}
