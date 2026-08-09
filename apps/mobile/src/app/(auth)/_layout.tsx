import { Stack } from 'expo-router';

import { useStackAnimation } from '@/hooks/use-stack-animation';

export default function AuthLayout() {
  const screenOptions = useStackAnimation();
  return <Stack screenOptions={screenOptions} />;
}
