import { ScrollView, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandMark, PenguinMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

// Welcome artwork is a 350x256 glacier photograph that is not in the
// project yet. Until it is exported to assets/, this panel keeps the same size,
// corners and tagline badge, with the Penguin mascot as its artwork.
function WelcomeArtwork() {
  return <View className="w-full overflow-hidden rounded-lg bg-muted" style={{ aspectRatio: 350 / 256 }}>
    <View className="absolute -bottom-6 right-4"><PenguinMark size={200} variant="mascot" /></View>
    <View className="m-6 self-start rounded-sm bg-card/80 px-2 py-1">
      <Text className="font-inter-medium text-micro text-muted-foreground">A little curiosity. A lot of possibility.</Text>
    </View>
  </View>;
}

export default function Welcome() {
  return <SafeAreaView className="flex-1 bg-background">
    <ScrollView contentContainerClassName="grow justify-center gap-5 px-5 py-8">
      <BrandMark variant="hero" />
      <WelcomeArtwork />
      <View className="gap-2.5">
        <Text variant="h2">Find your people.{'\n'}Build your future.</Text>
        <Text variant="lead">A space for students to share ideas, ask better questions, and learn together.</Text>
      </View>
      <Link href="/sign-up" asChild><Button><Text>Create an account</Text></Button></Link>
      <Link href="/login" asChild><Button variant="secondary"><Text>I already have an account</Text></Button></Link>
      <Text variant="caption" className="text-center text-muted-foreground">Made for students. Curiosity welcome.</Text>
    </ScrollView>
  </SafeAreaView>;
}
