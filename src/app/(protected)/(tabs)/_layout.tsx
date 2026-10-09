import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '@/components/navigation/tab-bar';
import { usePenguinTheme } from '@/theme/provider';
import { colors } from '@/theme/tokens';

export default function TabsLayout() {
  const { scheme } = usePenguinTheme();
  return <Tabs
    tabBar={(props) => <TabBar {...props} />}
    screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors[scheme].background } }}
  >
    <Tabs.Screen name="home" />
    <Tabs.Screen name="account" />
  </Tabs>;
}
