import { Redirect } from 'expo-router';
import { useAuth } from '@/features/auth/provider';
import { useProfile } from '@/features/profile/provider';
import { ProfileStatus } from '@/features/profile/profile-status';
import { OnboardingScreen } from '@/features/onboarding/screen';

export default function Onboarding() {
  const { session, recovery } = useAuth();
  const { state } = useProfile();
  if (recovery) return <Redirect href="/reset-password" />;
  if (!session) return <Redirect href="/login" />;
  if (state.status !== 'ready' || state.profile.id !== session.user.id) return <ProfileStatus />;
  if (state.profile.onboarding_completed) return <Redirect href="/home" />;
  return <OnboardingScreen key={session.user.id} profile={state.profile} />;
}
