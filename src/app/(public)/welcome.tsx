import { Image, Pressable, ScrollView, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowRight, Briefcase, GraduationCap, Users, type LucideIcon } from 'lucide-react-native';
import { PenguinWordmark } from '@/components/penguin-wordmark';
import { Text } from '@/components/ui/text';
import { usePenguinTheme } from '@/theme/provider';
import { colors } from '@/theme/tokens';

// The welcome screen's own accents. Blue and green reuse the `info` and `success`
// tokens; purple has no token, so its pair lives here, AA on its surface in both themes.
const purple = {
  light: { surface: '#F1EBFF', ink: '#6B3FD0' },
  dark: { surface: '#241B3A', ink: '#B79CFF' },
} as const;

// The welcome illustration: the mascot with its floating study and social tiles,
// on a transparent background so it sits on both themes.
const welcomePenguin = require('../../../assets/welcome-penguin.webp');
const WELCOME_PENGUIN_ASPECT = 1199 / 1312;

function WelcomeArtwork() {
  return <View className="h-72 w-full items-center justify-center" aria-hidden>
    <View className="absolute size-60 rounded-full bg-info-surface" />
    <Image source={welcomePenguin} style={{ height: 280, width: 280 * WELCOME_PENGUIN_ASPECT }} resizeMode="contain" />
  </View>;
}

function Feature({ icon: Glyph, surface, ink, title, body }: { icon: LucideIcon; surface: string; ink: string; title: string; body: string }) {
  return <View className="flex-row items-center gap-4">
    <View className="size-14 items-center justify-center rounded-full" style={{ backgroundColor: surface }}>
      <Glyph size={24} color={ink} fill={ink} strokeWidth={1.5} aria-hidden />
    </View>
    <View className="flex-1 gap-0.5">
      <Text className="font-inter-semibold text-label">{title}</Text>
      <Text className="text-footnote text-muted-foreground">{body}</Text>
    </View>
  </View>;
}

export default function Welcome() {
  const { scheme } = usePenguinTheme();
  const c = colors[scheme];
  return <SafeAreaView className="flex-1 bg-background">
    <ScrollView contentContainerClassName="grow gap-6 px-6 pb-6 pt-4">
      <View className="flex-row items-center justify-between">
        <PenguinWordmark size="auth" />
        <Link href="/login" asChild>
          <Pressable hitSlop={12} accessibilityRole="link"><Text className="text-callout text-muted-foreground">Skip</Text></Pressable>
        </Link>
      </View>

      <View className="gap-3">
        <Text variant="h1" className="text-[44px] leading-[48px] font-inter-bold tracking-tight">
          Connect.{'\n'}Learn.{'\n'}<Text className="text-[44px] leading-[48px] font-inter-bold tracking-tight text-info">Grow together.</Text>
        </Text>
        <Text variant="lead">A social platform for students to share, organize and find opportunities around you.</Text>
      </View>

      <WelcomeArtwork />

      <View className="gap-5">
        <Feature icon={Users} surface={c['info-surface']} ink={c.info} title="Meet students" body="Find study partners and friends in your school or city." />
        <Feature icon={GraduationCap} surface={purple[scheme].surface} ink={purple[scheme].ink} title="Share & Learn" body="Exchange notes, resources and experiences." />
        <Feature icon={Briefcase} surface={c['success-surface']} ink={c.success} title="Discover opportunities" body="Stay updated with events, internships and announcements." />
      </View>

      <View className="mt-auto gap-4">
        <Link href="/sign-up" asChild>
          <Pressable accessibilityRole="button" className="min-h-14 flex-row items-center justify-center gap-2 rounded-md bg-foreground active:opacity-90">
            <Text className="font-inter-semibold text-label text-background">Get started</Text>
            <ArrowRight size={20} color={c.background} aria-hidden />
          </Pressable>
        </Link>
        <View className="flex-row justify-center">
          <Text className="text-footnote text-muted-foreground">Already have an account? </Text>
          <Link href="/login" asChild>
            <Pressable accessibilityRole="link" hitSlop={8}><Text className="font-inter-semibold text-footnote text-info">Sign in</Text></Pressable>
          </Link>
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}
