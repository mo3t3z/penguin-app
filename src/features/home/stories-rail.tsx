import { FlatList, View, type ListRenderItem } from 'react-native';
import { Plus } from 'lucide-react-native';
import { UserAvatar } from '@/components/social/user-avatar';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { sampleStories, type SampleStory } from './sample-data';

type RailItem = { id: string; label: string; kind: 'add' | 'own' | 'sample' };

const keyExtractor = (item: RailItem) => item.id;
const sampleItems: RailItem[] = sampleStories.map((story: SampleStory) => ({ ...story, kind: 'sample' }));

function Separator() {
  return <View className="w-3" />;
}

// Horizontal stories row. Stories have no backend yet: the circles after "Your
// story" are sample data and none of them opens anything, so they are not buttons.
export function StoriesRail({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const items: RailItem[] = [
    { id: 'add', label: 'Add story', kind: 'add' },
    { id: 'own', label: 'Your story', kind: 'own' },
    ...sampleItems,
  ];
  const renderItem: ListRenderItem<RailItem> = ({ item }) => <View
    className="w-[68px] items-center gap-1.5"
    accessible
    accessibilityLabel={item.kind === 'sample' ? `${item.label} story, sample` : `${item.label}, not available yet`}
  >
    {item.kind === 'add'
      ? <View className="size-16 items-center justify-center rounded-full border border-border bg-card">
        <Icon as={Plus} size={24} color="primary" />
      </View>
      : <View className="size-16 items-center justify-center rounded-full border-2 border-primary">
        <UserAvatar name={item.kind === 'own' ? name : item.label} uri={item.kind === 'own' ? avatarUrl : null} size="lg" />
      </View>}
    <Text numberOfLines={1} className="text-micro text-muted-foreground">{item.label}</Text>
  </View>;
  return <View className="gap-2">
    <FlatList
      horizontal
      // Bleeds to the screen edges through the feed's 16px inset.
      className="-mx-4"
      contentContainerClassName="px-4"
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ItemSeparatorComponent={Separator}
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Stories"
    />
    <Text className="text-micro text-muted-foreground">Stories preview · sample content, not available yet</Text>
  </View>;
}
