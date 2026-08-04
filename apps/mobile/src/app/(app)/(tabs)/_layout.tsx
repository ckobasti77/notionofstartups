import { Tabs } from 'expo-router';
import { Bell, FolderClosed, House, MessageCircle, Menu } from 'lucide-react-native';

import { useThemeColors } from '@/theme/theme-provider';

/**
 * Tab bar sa pet tabova: Danas · Prostor · Chat · Obaveštenja · Više
 * (docs/mobile/02-EKRANI.md, sekcija 2). Header (startup switcher) dolazi iz
 * roditeljskog `(app)/_layout.tsx`, zato je `headerShown: false`.
 */
export default function TabsLayout() {
  const colors = useThemeColors();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontSize: 11 },
      }}>
      <Tabs.Screen
        name="danas"
        options={{
          title: 'Danas',
          tabBarIcon: ({ color, size }) => <House color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="prostor"
        options={{
          title: 'Prostor',
          tabBarIcon: ({ color, size }) => <FolderClosed color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="obavestenja"
        options={{
          title: 'Obaveštenja',
          tabBarIcon: ({ color, size }) => <Bell color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="vise"
        options={{
          title: 'Više',
          tabBarIcon: ({ color, size }) => <Menu color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
