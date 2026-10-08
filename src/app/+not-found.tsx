import { Link } from 'expo-router';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return <View className="flex-1 justify-center gap-6 bg-background p-6">
    <Text variant="h1">Nothing here yet.</Text>
    <Link href="/" asChild><Button><Text>Back to Penguin</Text></Button></Link>
  </View>;
}
