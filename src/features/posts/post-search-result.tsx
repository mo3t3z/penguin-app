import { memo, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { UserAvatar } from '@/components/social/user-avatar';
import { Text } from '@/components/ui/text';
import { highlightSegments } from '@/features/discover/discover-results';
import { termsFromKey } from '@/features/discover/search-query';
import type { FeedPost } from './feed';
import { publicationAccessibilityLabel, relativePublicationTime } from './post-presentation';

// A post as a search result: author and time on one line, then up to four lines of
// text with the searched words highlighted. The whole item opens the post's
// comments, where it can be read in full, liked and answered.
function PostSearchResultComponent({ post, search, onOpen }: {
  post: FeedPost;
  // The canonical search key the result matched.
  search: string;
  onOpen: (postId: string) => void;
}) {
  const name = post.author?.display_name?.trim() || 'Penguin student';
  const avatar = post.author?.avatar_url?.trim() || null;
  const segments = useMemo(() => highlightSegments(post.content, termsFromKey(search)), [post.content, search]);
  return <Pressable
    className="gap-1.5 border-b border-divider px-5 py-3.5 active:bg-muted"
    role="button"
    accessibilityLabel={`Post by ${name}. ${publicationAccessibilityLabel(post.created_at)}. ${post.content}`}
    accessibilityHint="Opens the post and its comments"
    onPress={() => onOpen(post.id)}
  >
    <View className="flex-row items-center gap-2">
      <UserAvatar name={name} uri={avatar} size="xs" />
      <Text numberOfLines={1} className="shrink text-footnote font-inter-semibold">{name}</Text>
      <Text className="text-footnote text-muted-foreground">· {relativePublicationTime(post.created_at)}</Text>
    </View>
    <Text variant="callout" numberOfLines={4}>
      {segments.map((segment, index) => segment.match
        ? <Text key={index} variant="callout" className="bg-accent font-inter-semibold text-accent-foreground">{segment.text}</Text>
        : segment.text)}
    </Text>
  </Pressable>;
}

export const PostSearchResult = memo(PostSearchResultComponent);
