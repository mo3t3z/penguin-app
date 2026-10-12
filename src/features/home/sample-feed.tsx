import { useCallback, useMemo, type ReactElement } from 'react';
import { FlatList, View, type ListRenderItem } from 'react-native';
import { FlaskConical, Users } from 'lucide-react-native';
import { StatePanel } from '@/components/social/state-panel';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { samplePostsFor, type SamplePost, type SampleScope } from './sample-data';
import { SamplePostCard } from './sample-post-card';
import type { SampleInteractions } from './use-sample-interactions';

const notices: Record<SampleScope, string> = {
  following: 'Preview with sample content. Following other students is not available yet, and nothing you do here is saved.',
  'my-school': 'Preview with sample content. School feeds are not available yet, and nothing you do here is saved.',
};

const keyExtractor = (item: SamplePost) => item.id;

function ItemSeparator() {
  return <View className="h-5" />;
}

// The Following and My School tabs: a FlatList of sample posts under a notice that
// says so. It mirrors the real FeedList's layout so the two can be swapped later.
export function SampleFeed({ scope, header, interactions }: {
  scope: SampleScope;
  header: ReactElement;
  interactions: SampleInteractions;
}) {
  const posts = useMemo(() => samplePostsFor(scope), [scope]);
  const { liked, saved, joined, votes, toggle, vote } = interactions;
  const renderPost = useCallback<ListRenderItem<SamplePost>>(({ item }) => <SamplePostCard
    post={item}
    liked={liked.has(item.id)}
    saved={saved.has(item.id)}
    joined={joined.has(item.id)}
    choice={votes[item.id]}
    onToggle={toggle}
    onVote={vote}
  />, [joined, liked, saved, toggle, vote, votes]);
  const listHeader = <View className="gap-4">
    {header}
    <View className="flex-row items-start gap-2 rounded-md bg-accent p-3" accessibilityRole="alert">
      <Icon as={FlaskConical} size={20} color="accent-foreground" />
      <Text className="flex-1 text-footnote text-accent-foreground">{notices[scope]}</Text>
    </View>
  </View>;
  return <FlatList
    className="flex-1 bg-background"
    contentContainerClassName="px-4 pb-6"
    data={posts}
    renderItem={renderPost}
    extraData={interactions}
    keyExtractor={keyExtractor}
    ListHeaderComponent={listHeader}
    ListHeaderComponentStyle={{ marginBottom: 20 }}
    ItemSeparatorComponent={ItemSeparator}
    ListEmptyComponent={<StatePanel
      icon={Users}
      title="Nothing here yet"
      description="Posts for this tab will appear here once it is connected."
    />}
    initialNumToRender={4}
    maxToRenderPerBatch={4}
    windowSize={7}
    accessibilityLabel={scope === 'following' ? 'Following feed preview' : 'My School feed preview'}
  />;
}
