import { Redirect } from 'expo-router';
import { useAuth } from '@/features/auth/provider';
import { useProfile } from '@/features/profile/provider';
import { getOnboardingDestination } from '@/features/profile/onboarding';
import { ProfileStatus } from '@/features/profile/profile-status';

export default function Index() {
  const { session, recovery } = useAuth();
  const { state } = useProfile();
  if (recovery) return <Redirect href="/reset-password" />;
  const destination = getOnboardingDestination(session?.user.id ?? null, state);
  if (destination === 'auth') return <Redirect href="/login" />;
  if (destination === 'main') return <Redirect href="/account" />;
  if (destination === 'onboarding') return <Redirect href="/onboarding" />;
  return <ProfileStatus />;
}
