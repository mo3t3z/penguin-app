import { memo } from 'react';
import { Pressable, View } from 'react-native';
import {
  Bookmark, CalendarDays, CircleCheck, FileText, Heart, ImageIcon, MapPin, MessageCircle, Share2, Users,
} from 'lucide-react-native';
import { PostAction } from '@/components/social/post-action';
import { UserAvatar } from '@/components/social/user-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { shareText } from '@/lib/share-text';
import { cn } from '@/lib/utils';
import { samplePostKindLabels, type SamplePost } from './sample-data';
import type { SampleInteractions } from './use-sample-interactions';

type PostOf<Kind extends SamplePost['kind']> = Extract<SamplePost, { kind: Kind }>;

function ResourceBody({ post }: { post: PostOf<'resource'> }) {
  return <View
    className="flex-row items-center gap-3 rounded-md bg-muted p-3"
    accessible
    accessibilityLabel={`Sample attachment ${post.fileName}, ${post.fileInfo}`}
  >
    <View className="size-11 items-center justify-center rounded-sm bg-accent">
      <Icon as={FileText} size={24} color="primary" />
    </View>
    <View className="min-w-0 flex-1">
      <Text numberOfLines={1} className="text-callout font-inter-medium">{post.fileName}</Text>
      <Text variant="caption" className="text-muted-foreground">{post.fileInfo}</Text>
    </View>
  </View>;
}

function QuestionBody({ post }: { post: PostOf<'question'> }) {
  return <View className="items-center rounded-md bg-muted px-4 py-6">
    <Text selectable className="text-center text-headline font-inter-medium">{post.formula}</Text>
  </View>;
}

function PhotoBody({ post }: { post: PostOf<'photo'> }) {
  return <View
    className="items-center justify-center gap-2 rounded-sm bg-muted"
    style={{ aspectRatio: 326 / 206 }}
    accessible
    accessibilityRole="image"
    accessibilityLabel={`Sample image placeholder: ${post.imageLabel}`}
  >
    <Icon as={ImageIcon} size={32} color="muted-foreground" />
    <Text variant="caption" className="text-muted-foreground">Sample image placeholder</Text>
  </View>;
}

function PollBody({ post, choice, onVote }: {
  post: PostOf<'poll'>;
  choice?: string;
  onVote: (postId: string, optionId: string) => void;
}) {
  return <View className="gap-2">
    {post.options.map((option) => {
      const chosen = option.id === choice;
      return <Pressable
        key={option.id}
        className={cn('min-h-11 justify-center overflow-hidden rounded-sm border bg-muted', chosen ? 'border-primary' : 'border-transparent')}
        role="button"
        hitSlop={{ top: 2, bottom: 2 }}
        onPress={() => onVote(post.id, option.id)}
        accessibilityLabel={`${option.label}, ${option.percent} percent${chosen ? ', your choice' : ''}. Sample poll`}
        accessibilityState={{ selected: chosen }}
      >
        <View
          className={cn('absolute inset-y-0 left-0', chosen ? 'bg-primary/40' : 'bg-primary/15')}
          style={{ width: `${option.percent}%` }}
        />
        <View className="flex-row items-center gap-3 px-3">
          <Text numberOfLines={2} className={cn('flex-1 text-callout', chosen && 'font-inter-semibold')}>{option.label}</Text>
          <Text className="text-callout font-inter-medium">{option.percent}%</Text>
        </View>
      </Pressable>;
    })}
    <Text variant="caption" className="text-muted-foreground">{post.votes} votes · {post.timeLeft}</Text>
  </View>;
}

function EventBody({ post, joined, onToggleJoin }: { post: PostOf<'event'>; joined: boolean; onToggleJoin: () => void }) {
  const rows = [
    { icon: CalendarDays, text: post.date },
    { icon: MapPin, text: post.place },
    { icon: Users, text: `${post.participants + (joined ? 1 : 0)} participants` },
  ];
  return <View className="gap-3">
    <View className="gap-2 rounded-md bg-muted p-3">
      {rows.map((row) => <View key={row.text} className="flex-row items-center gap-2">
        <Icon as={row.icon} size={20} color="muted-foreground" />
        <Text className="flex-1 text-callout">{row.text}</Text>
      </View>)}
    </View>
    <Button
      variant={joined ? 'outline' : 'default'}
      onPress={onToggleJoin}
      accessibilityLabel={joined ? 'Leave sample event' : 'Join sample event'}
      accessibilityState={{ selected: joined }}
    >
      <Text>{joined ? 'Joined' : 'Join event'}</Text>
    </Button>
  </View>;
}

function AchievementBody({ post }: { post: PostOf<'achievement'> }) {
  return <View
    className="flex-row items-center gap-3 rounded-md border border-border p-3"
    accessible
    accessibilityLabel={`${post.milestone}, ${post.percent} percent complete`}
  >
    <Icon as={CircleCheck} size={32} color="primary" />
    <View className="flex-1 gap-1.5">
      <Text className="text-callout font-inter-medium">{post.milestone}</Text>
      <Text variant="caption" className="text-muted-foreground">{post.percent}% complété</Text>
      <View className="h-1.5 overflow-hidden rounded-full bg-muted">
        <View className="h-full rounded-full bg-primary" style={{ width: `${post.percent}%` }} />
      </View>
    </View>
  </View>;
}

type SamplePostCardProps = {
  post: SamplePost;
  liked: boolean;
  saved: boolean;
  joined: boolean;
  choice?: string;
  onToggle: SampleInteractions['toggle'];
  onVote: SampleInteractions['vote'];
};

// A post built from sample-data.ts. It carries a "Sample" badge, and its likes,
// bookmarks, votes and joins change only this screen's in-memory state.
function SamplePostCardComponent({ post, liked, saved, joined, choice, onToggle, onVote }: SamplePostCardProps) {
  const kindLabel = samplePostKindLabels[post.kind];
  const likes = post.likes + (liked ? 1 : 0);
  return <View className="gap-[14px] rounded-lg border border-border bg-card p-4" accessibilityLabel={`Sample post by ${post.author}`}>
    <View className="flex-row items-center gap-[10px]">
      <UserAvatar name={post.author} size="md" />
      <View className="min-w-0 flex-1">
        <Text variant="large" numberOfLines={1}>{post.author}</Text>
        <Text variant="muted" numberOfLines={1}>{post.meta} · {post.time}</Text>
      </View>
      {kindLabel ? <Badge variant="campus" className="rounded-full bg-accent px-2.5">
        <Text className="text-accent-foreground">{kindLabel}</Text>
      </Badge> : null}
      <Badge variant="outline" className="rounded-full px-2.5"><Text className="text-muted-foreground">Sample</Text></Badge>
    </View>
    <View className="gap-1.5">
      {post.title ? <Text variant="large">{post.title}</Text> : null}
      <Text selectable className="text-callout">{post.text}</Text>
    </View>
    {post.kind === 'resource' ? <ResourceBody post={post} /> : null}
    {post.kind === 'question' ? <QuestionBody post={post} /> : null}
    {post.kind === 'photo' ? <PhotoBody post={post} /> : null}
    {post.kind === 'poll' ? <PollBody post={post} choice={choice} onVote={onVote} /> : null}
    {post.kind === 'event' ? <EventBody post={post} joined={joined} onToggleJoin={() => onToggle('joined', post.id)} /> : null}
    {post.kind === 'achievement' ? <AchievementBody post={post} /> : null}
    <View className="flex-row items-center gap-[18px]">
      <PostAction
        icon={Heart}
        className="min-w-12"
        active={liked}
        label={likes}
        onPress={() => onToggle('liked', post.id)}
        accessibilityLabel={`${liked ? 'Unlike' : 'Like'} this sample post. ${likes} likes`}
        accessibilityState={{ selected: liked }}
      />
      {/* Sample posts have no comment thread to open, so this is a count only. */}
      <View className="min-h-11 min-w-12 flex-row items-center gap-1.5" accessible accessibilityLabel={`${post.comments} comments`}>
        <Icon as={MessageCircle} color="muted-foreground" />
        <Text className="text-caption text-muted-foreground">{post.comments}</Text>
      </View>
      <PostAction
        icon={Share2}
        onPress={() => void shareText(`${post.author} on Penguin: ${post.text}`)}
        accessibilityLabel="Share this sample post"
      />
      <PostAction
        icon={Bookmark}
        className="ml-auto justify-end"
        active={saved}
        onPress={() => onToggle('saved', post.id)}
        accessibilityLabel={saved ? 'Remove bookmark from this sample post' : 'Bookmark this sample post'}
        accessibilityState={{ selected: saved }}
      />
    </View>
  </View>;
}

export const SamplePostCard = memo(SamplePostCardComponent);
