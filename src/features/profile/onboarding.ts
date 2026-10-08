import type { Profile } from '@/lib/database.types';

// Sprint 2B can consume this state without treating errors/missing rows as onboarding.
export type ProfileState =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'missing' }
  | { status: 'ready'; profile: Profile };

export function getOnboardingDestination(userId: string | null, state: ProfileState) {
  if (!userId) return 'auth';
  if (state.status !== 'ready') return state.status;
  // A late response from a previous account must never open the next account's routes.
  if (state.profile.id !== userId) return 'loading';
  return state.profile.onboarding_completed ? 'main' : 'onboarding';
}
