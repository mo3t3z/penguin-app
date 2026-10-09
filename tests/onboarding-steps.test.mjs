import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  canContinueStep,
  isValidDisplayName,
  ONBOARDING_STEP_COUNT,
  onboardingSteps,
  previousStep,
  primaryActionLabel,
  progressLabel,
  REVIEW_STEP,
  stepRequirementError,
} from '../src/features/onboarding/steps.ts';

const nothing = { institution: null, field: null, level: null };
const everything = { institution: { id: 'i' }, field: { id: 'f' }, level: 'undergraduate' };

test('onboarding has six steps, each with header, title and description', () => {
  assert.equal(ONBOARDING_STEP_COUNT, 6);
  assert.equal(REVIEW_STEP, 5);
  for (const step of onboardingSteps) {
    assert.ok(step.navTitle && step.title && step.description);
  }
  assert.equal(progressLabel(0), '1 of 6');
  assert.equal(progressLabel(REVIEW_STEP), '6 of 6');
});

test('selection steps block Continue until their own choice is made', () => {
  assert.equal(stepRequirementError(2, nothing), 'Select an institution to continue.');
  assert.equal(stepRequirementError(3, nothing), 'Select a field of study to continue.');
  assert.equal(stepRequirementError(4, nothing), 'Select your study level to continue.');
  assert.equal(canContinueStep(2, { ...nothing, institution: { id: 'i' } }), true);
  assert.equal(canContinueStep(3, { ...nothing, institution: { id: 'i' } }), false);
  assert.equal(canContinueStep(4, { ...everything, level: null }), false);
  for (const step of [2, 3, 4]) assert.equal(canContinueStep(step, everything), true);
});

test('welcome, identity and review steps are not gated by selections', () => {
  for (const step of [0, 1, REVIEW_STEP]) {
    assert.equal(stepRequirementError(step, nothing), null);
    assert.equal(canContinueStep(step, nothing), true);
  }
});

test('display names are trimmed and limited to 1-80 code points', () => {
  assert.equal(isValidDisplayName(''), false);
  assert.equal(isValidDisplayName('   '), false);
  assert.equal(isValidDisplayName(' Maya Chen '), true);
  assert.equal(isValidDisplayName('a'.repeat(80)), true);
  assert.equal(isValidDisplayName('a'.repeat(81)), false);
  assert.equal(isValidDisplayName('🎓'.repeat(80)), true);
});

test('back moves one step and leaves the first step to the system', () => {
  assert.equal(previousStep(0), null);
  assert.equal(previousStep(1), 0);
  assert.equal(previousStep(REVIEW_STEP), REVIEW_STEP - 1);
});

test('primary action label follows the step and busy state', () => {
  assert.equal(primaryActionLabel(0, false), 'Let’s get started');
  assert.equal(primaryActionLabel(3, false), 'Continue');
  assert.equal(primaryActionLabel(REVIEW_STEP, false), 'Enter Penguin');
  assert.equal(primaryActionLabel(REVIEW_STEP, true), 'Please wait…');
});

test('root layout still guards public, onboarding and protected routes by session and profile', () => {
  const layout = readFileSync(new URL('../src/app/_layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /<Stack\.Protected guard=\{!session\}><Stack\.Screen name="\(public\)" \/>/);
  assert.match(layout, /<Stack\.Protected guard=\{destination === 'main' && !recovery\}><Stack\.Screen name="\(protected\)" \/>/);
  assert.match(layout, /<Stack\.Protected guard=\{Boolean\(session\) && !recovery && destination !== 'main'\}><Stack\.Screen name="onboarding" \/>/);
});

test('onboarding saves only in its final completion call', () => {
  const screen = readFileSync(new URL('../src/features/onboarding/screen.tsx', import.meta.url), 'utf8');
  assert.equal(screen.match(/updateCurrentProfile\(/g)?.length, 1);
  assert.match(screen, /onboarding_completed: true/);
});
