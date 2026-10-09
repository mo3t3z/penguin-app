// Step copy and gating for onboarding. Nothing here talks to the network.
export const onboardingSteps = [
  { navTitle: 'Make yourself at home', title: 'A real community starts with you.', description: 'Let’s set up your student profile. A few details help you find people who get what you’re studying.' },
  { navTitle: 'Your identity', title: 'What should we call you?', description: 'Use the name you’d like other students to know.' },
  { navTitle: 'Your institution', title: 'Where are you studying?', description: 'Find your university, school or institute.' },
  { navTitle: 'Your field of study', title: 'What sparks your curiosity?', description: 'Choose the area closest to your program.' },
  { navTitle: 'Your study level', title: 'Which chapter are you in?', description: 'Meet people working through similar challenges.' },
  { navTitle: 'One last look', title: 'Looks like you.', description: 'Here’s how you’ll appear in the community. Everything can be updated later.' },
] as const;

export const ONBOARDING_STEP_COUNT = onboardingSteps.length;
export const REVIEW_STEP = ONBOARDING_STEP_COUNT - 1;

export type OnboardingSelections = { institution: unknown; field: unknown; level: unknown };

export function progressLabel(step: number) {
  return `${step + 1} of ${ONBOARDING_STEP_COUNT}`;
}

export function isValidDisplayName(value: string) {
  const length = [...value.trim()].length;
  return length > 0 && length <= 80;
}

// What a selection step still needs before Continue; null when the step can advance.
export function stepRequirementError(step: number, { institution, field, level }: OnboardingSelections) {
  if (step === 2 && !institution) return 'Select an institution to continue.';
  if (step === 3 && !field) return 'Select a field of study to continue.';
  if (step === 4 && !level) return 'Select your study level to continue.';
  return null;
}

export function canContinueStep(step: number, selections: OnboardingSelections) {
  return stepRequirementError(step, selections) === null;
}

// Where the back arrow or hardware back goes; null leaves onboarding's first step.
export function previousStep(step: number) {
  return step > 0 ? step - 1 : null;
}

export function primaryActionLabel(step: number, busy: boolean) {
  if (busy) return 'Please wait…';
  if (step === 0) return 'Let’s get started';
  return step === REVIEW_STEP ? 'Enter Penguin' : 'Continue';
}
