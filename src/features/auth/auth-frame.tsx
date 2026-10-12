import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '@/components/navigation/top-bar';

// Returns to the previous screen, or to a fallback when this screen was opened
// directly (for example from an email link).
export function goBackOr(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

// Shared layout for signed-out screens: the header with a back button,
// then a scrolling column with the 20px page inset.
export function AuthFrame({ navTitle, onBack, children }: PropsWithChildren<{ navTitle?: string; onBack?: () => void }>) {
  return <SafeAreaView className="flex-1 bg-background">
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopBar title={navTitle} onBack={onBack} brand={false} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="grow px-5 pb-8 pt-2">
        <View className="gap-5">{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
