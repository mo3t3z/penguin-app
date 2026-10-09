import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  confirmationError,
  emailError,
  isValidEmail,
  MIN_PASSWORD_LENGTH,
  passwordError,
} from '../src/features/auth/validation.ts';

test('email validation trims input and rejects malformed addresses', () => {
  assert.equal(isValidEmail('  maya@northbridge.edu  '), true);
  for (const value of ['', 'maya', 'maya@', '@northbridge.edu', 'maya@northbridge', 'ma ya@northbridge.edu', 'maya@@northbridge.edu']) {
    assert.equal(isValidEmail(value), false, value);
  }
  assert.equal(emailError('maya@northbridge.edu'), undefined);
  assert.equal(emailError('maya'), 'Enter a valid email address.');
});

test('logging in only requires a non-empty password', () => {
  assert.equal(passwordError('', false), 'Enter your password.');
  assert.equal(passwordError('short', false), undefined);
});

test('creating a password keeps the existing eight-character minimum and adds no other rule', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.equal(passwordError('', true), 'Enter your password.');
  assert.equal(passwordError('1234567', true), 'Use at least 8 characters.');
  assert.equal(passwordError('12345678', true), undefined);
  assert.equal(passwordError('abcdefgh', true), undefined);
});

test('password confirmation must match exactly', () => {
  assert.equal(confirmationError('correct horse', 'correct horse'), undefined);
  assert.equal(confirmationError('correct horse', 'correct horse '), 'Passwords do not match.');
  assert.equal(confirmationError('Password1', 'password1'), 'Passwords do not match.');
  assert.equal(confirmationError('password1', ''), 'Passwords do not match.');
});
