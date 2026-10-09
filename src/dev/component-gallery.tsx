import { useState } from 'react';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowUpRight, Bell, Building2, GraduationCap, Mail, Moon, Sun, Monitor, Users } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { FormField } from '@/components/ui/form-field';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { BrandMark } from '@/components/brand-mark';
import { IdentityRow } from '@/components/social/identity-row';
import { StatePanel } from '@/components/social/state-panel';
import { PostCard } from '@/features/posts/post-card';
import { InfoRow } from '@/components/forms/info-row';
import { SelectorOption } from '@/components/forms/selector-option';
import { PasswordField } from '@/components/ui/password-field';
import { OnboardingProgress } from '@/features/onboarding/progress';
import { SegmentedTabs } from '@/components/navigation/segmented-tabs';
import { ProfileAbout } from '@/features/profile/profile-about';
import { ProfileHeader } from '@/features/profile/profile-header';
import type { PublicProfile } from '@/features/profile/service';
import type { FeedPost } from '@/features/posts/feed';
import { usePenguinTheme } from '@/theme/provider';
import { colors, avatarSizes } from '@/theme/tokens';

const previewPost: FeedPost = {
  id: 'preview-post', author_id: 'preview-author', created_at: '2026-10-08T10:00:00.000000+00:00', updated_at: '2026-10-08T10:00:00.000000+00:00',
  content: 'Does anyone have a good way to build intuition for eigenvectors? The calculations make sense, but I’m still missing the bigger picture.',
  author: { id: 'preview-author', username: 'aminay', display_name: 'Amina Yusuf', avatar_url: null },
  media: [],
};

const previewProfile: PublicProfile = {
  id: 'preview-author', username: 'mayac', display_name: 'Maya Chen', avatar_url: null, institution_id: null, field_id: null,
  study_level: 'undergraduate', bio: 'CS student, curious builder. Usually in the library or turning an idea into a tiny app.',
  created_at: '2026-09-15T12:00:00.000000+00:00',
};
const previewStudies = {
  loading: false, failed: false, retry: () => {},
  institution: { id: 'i', name: 'Northbridge University', slug: 'northbridge', country: 'GB', city: 'Bristol', created_at: '' },
  field: { id: 'f', name: 'Computer Science', slug: 'computer-science', created_at: '' },
};
const previewTabs = [{ key: 'posts', label: 'Posts' }, { key: 'about', label: 'About' }] as const;

function Section({ number, title, children }: React.PropsWithChildren<{ number: string; title: string }>) {
  return <View className="gap-5">
    <View className="flex-row items-center gap-3"><Text variant="caption" className="text-primary">{number}</Text><Text variant="h3">{title}</Text></View>
    {children}
  </View>;
}

export default function ComponentGallery() {
  const { preference, scheme, setPreference } = usePenguinTheme();
  const [name, setName] = useState('');
  const [checked, setChecked] = useState(false);
  const [presses, setPresses] = useState(0);
  const [liked, setLiked] = useState(false);
  const [option, setOption] = useState(0);
  const [profileTab, setProfileTab] = useState<'posts' | 'about'>('posts');
  const [secret, setSecret] = useState('');
  const palette = colors[scheme];
  return <SafeAreaView className="flex-1 bg-background">
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="items-center px-4 py-6">
        <View className="w-full max-w-2xl gap-10">
          <View className="flex-row items-center justify-between">
            <Button variant="ghost" size="icon" accessibilityLabel="Leave the gallery"
              onPress={() => router.canGoBack() ? router.back() : router.replace('/')}><Icon as={ArrowLeft} /></Button>
            <BrandMark />
            <IconButton icon={Bell} accessibilityLabel="Icon button preview" onPress={() => setPresses(value => value + 1)} />
          </View>
          <View className="gap-4">
            <View className="self-start"><Badge variant="campus"><Text>SPRINT 0 · UI FOUNDATION</Text></Badge></View>
            <Text variant="h1">Made for{'\n'}what’s next.</Text>
            <Text variant="lead">Snow, ink and teal. A quieter canvas for bright minds and shared momentum.</Text>
          </View>
          <View className="gap-3">
            <Text variant="small">Appearance</Text>
            <View className="flex-row flex-wrap gap-2">
              {(['light', 'dark', 'system'] as const).map(mode => <Button key={mode}
                variant={preference === mode ? 'default' : 'outline'}
                accessibilityState={{ selected: preference === mode }} onPress={() => setPreference(mode)}>
                <Icon as={mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor} color={preference === mode ? 'primary-foreground' : 'foreground'} />
                <Text>{mode[0].toUpperCase() + mode.slice(1)}</Text>
              </Button>)}
            </View>
            <Text variant="muted">{preference === 'system' ? 'Following your device' : 'Manual appearance'} · {scheme} palette</Text>
          </View>
          <Separator />
          <Section number="01" title="The palette">
            <View className="flex-row flex-wrap gap-3">
              {(['foreground', 'background', 'primary', 'accent', 'muted'] as const).map(token => <View key={token} className="gap-2" style={{ width: 100 }}>
                <View className="h-20 rounded-lg border border-border" style={{ backgroundColor: palette[token] }} />
                <Text variant="caption">{token}</Text><Text variant="caption" className="text-muted-foreground">{palette[token]}</Text>
              </View>)}
            </View>
          </Section>
          <Section number="02" title="Words with room">
            <Text variant="h1">Big ideas.</Text><Text variant="h2">Small beginnings.</Text>
            <Text variant="h3">Space to belong.</Text><Text variant="lead">A little curiosity goes a long way.</Text>
            <Text>Body · 15/22. Clear, comfortable reading for everyday conversations.</Text>
            <Text className="text-metadata">Post text · 14/20. What students share.</Text>
            <Text variant="small">Label · 13/18 semibold. Field labels.</Text>
            <Text variant="muted">Secondary · 13/18. Supporting context.</Text><Text variant="caption">Caption · 12/16. The small details.</Text>
            <Text className="text-micro text-muted-foreground">Metadata · 11/14. Times and tab labels.</Text>
          </Section>
          <Section number="03" title="Every action, considered">
            <View className="flex-row flex-wrap gap-3">
              {(['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const).map(variant => <Button key={variant} variant={variant} onPress={() => setPresses(value => value + 1)}><Text>{variant === 'default' ? 'Primary' : variant}</Text></Button>)}
              <Button disabled><Text>Disabled</Text></Button><Button loading accessibilityLabel="Loading preview"><Text>Loading</Text></Button>
              <Button size="icon" accessibilityLabel="Try icon button" onPress={() => setPresses(value => value + 1)}><Icon as={ArrowUpRight} color="primary-foreground" /></Button>
            </View>
            <View className="flex-row flex-wrap gap-3">{(['sm','default','lg'] as const).map(size => <Button key={size} size={size} variant="outline" onPress={() => setPresses(value => value + 1)}><Text>{size}</Text></Button>)}</View>
            <Text variant="muted" accessibilityLiveRegion="polite">Button presses: {presses}</Text>
          </Section>
          <Section number="04" title="A clear place to start">
            <FormField label="Display name" required placeholder="Your name" hint="Choose a name people recognize." value={name} onChangeText={setName} error={checked && !name.trim() ? 'Enter a display name to continue.' : undefined} />
            <Button variant="secondary" onPress={() => setChecked(true)}><Text>Check field</Text></Button>
            {checked && name.trim() ? <Text className="text-success" accessibilityLiveRegion="polite">Looks good. This is only a UI demo.</Text> : null}
            <Input variant="search" placeholder="Search preview" accessibilityLabel="Search preview" />
            <FormField label="Email address" leadingIcon={Mail} placeholder="you@university.edu" />
            <PasswordField label="Password" placeholder="Enter your password" value={secret} onChangeText={setSecret} />
            <OnboardingProgress step={2} />
            <View className="gap-3" accessibilityRole="radiogroup">
              {['Northbridge University', 'North Coast Institute'].map((title, index) => <SelectorOption key={title} icon={Building2}
                title={title} detail={index === 0 ? 'Bristol, GB' : null} selected={option === index} onPress={() => setOption(index)} />)}
            </View>
            <Card variant="muted"><CardContent className="gap-4">
              <InfoRow icon={Building2} label="Institution" value="Northbridge University" />
              <InfoRow icon={GraduationCap} label="Study level" value="Undergraduate" onEdit={() => setPresses(value => value + 1)} />
            </CardContent></Card>
            <FormField label="A few words" variant="multiline" placeholder="Let an idea take shape…" />
            <FormField label="Unavailable" value="Disabled input" editable={false} />
            <FormField label="Read only" value="Readable, not editable" readOnly />
          </Section>
          <Section number="05" title="Room for context">
            {(['surface','outlined','muted','highlighted'] as const).map(variant => <Card key={variant} variant={variant}>
              <CardHeader><CardTitle>{variant[0].toUpperCase() + variant.slice(1)} card</CardTitle><CardDescription>Generous spacing. A clear hierarchy.</CardDescription></CardHeader>
              <CardContent><Text>Reusable structure, with Penguin’s own character.</Text></CardContent>
            </Card>)}
          </Section>
          <Section number="06" title="People & little details">
            <View className="flex-row flex-wrap items-center gap-4">
              {(Object.keys(avatarSizes) as (keyof typeof avatarSizes)[]).map(size => <View key={size} className="items-center gap-2">
                <Avatar size={size} alt={`${size} avatar preview`}><AvatarFallback><Text variant={size === 'xs' ? 'caption' : 'small'}>PN</Text></AvatarFallback></Avatar>
                <Text variant="caption">{avatarSizes[size]}</Text>
              </View>)}
              <Avatar alt="Local image preview" size="xl"><AvatarImage source={require('../../assets/icon.png')} /><AvatarFallback><Text>PN</Text></AvatarFallback></Avatar>
            </View>
            <View className="flex-row flex-wrap gap-2">{(['secondary','campus','subject','success','warning','destructive','outline'] as const).map(variant => <Badge key={variant} variant={variant}><Text>{variant === 'secondary' ? 'Neutral' : variant}</Text></Badge>)}</View>
            <Separator />
            <View className="flex-row items-center gap-4" style={{ height: 28 }}><Text variant="small">One</Text><Separator orientation="vertical" /><Text variant="small">Another</Text></View>
          </Section>
          <Section number="06b" title="Profile">
            <ProfileHeader profile={previewProfile} studies={previewStudies} own />
            <SegmentedTabs tabs={previewTabs} value={profileTab} onChange={setProfileTab} />
            {profileTab === 'about' ? <ProfileAbout profile={previewProfile} studies={previewStudies} /> : <Text variant="muted">Posts appear here.</Text>}
          </Section>
          <Section number="07" title="Good things take a moment">
            <View accessibilityLabel="Loading preview" accessibilityState={{ busy: true }} className="gap-4 rounded-lg border border-border p-5">
              <View className="flex-row items-center gap-3"><Skeleton className="h-12 w-12 rounded-full" /><View className="flex-1 gap-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-24" /></View></View>
              <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" />
            </View>
            <Text variant="muted">Quiet, static placeholders. No unnecessary motion.</Text>
            <View className="rounded-lg border border-border bg-card p-4">
              <IdentityRow name="Maya Chen" username="mayac" time="38m" timeAccessibilityLabel="Published 38 minutes ago" />
            </View>
            <PostCard post={previewPost} visible={false}
              likeState={{ count: liked ? 13 : 12, likedByMe: liked, pending: false, error: null }}
              commentCount={{ count: 0, error: null }}
              onToggleLike={() => setLiked(value => !value)} onOpenComments={() => setPresses(value => value + 1)} />
            <StatePanel icon={Users} title="The campus is quiet" description="Empty and error states share this layout."
              actionLabel="Primary action" onAction={() => setPresses(value => value + 1)} />
          </Section>
          <Separator /><Text variant="caption" className="text-muted-foreground">PENGUIN · DEVELOPMENT GALLERY · FOUNDATION BEFORE FEATURES</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
