import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { ONBOARDING_STEP_COUNT, progressLabel } from './steps';

// Figma "Onboarding progress": eyebrow, "n of 6" and six segments.
export function OnboardingProgress({ step }: { step: number }) {
  return <View
    className="gap-2"
    accessible
    accessibilityRole="progressbar"
    accessibilityLabel={`Profile setup, step ${progressLabel(step)}`}
    accessibilityValue={{ min: 0, max: ONBOARDING_STEP_COUNT, now: step + 1 }}
  >
    <View className="flex-row items-center justify-between">
      <Text className="font-inter-semibold text-micro uppercase tracking-wide text-primary">Your student profile</Text>
      <Text className="text-micro text-muted-foreground">{progressLabel(step)}</Text>
    </View>
    <View className="flex-row gap-1.5">
      {Array.from({ length: ONBOARDING_STEP_COUNT }, (_, index) => (
        <View key={index} className={`h-1 flex-1 rounded-full ${index <= step ? 'bg-primary' : 'bg-border'}`} />
      ))}
    </View>
  </View>;
}
