import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';
import { getOnboardingDestination } from '../src/features/profile/onboarding.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const profile = (overrides = {}) => ({ id: 'user-1', onboarding_completed: true, ...overrides });

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = `${directory}/${name}`;
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

test('auth and profile state resolve to one destination', () => {
  assert.equal(getOnboardingDestination(null, { status: 'loading' }), 'auth');
  assert.equal(getOnboardingDestination('user-1', { status: 'loading' }), 'loading');
  assert.equal(getOnboardingDestination('user-1', { status: 'missing' }), 'missing');
  assert.equal(getOnboardingDestination('user-1', { status: 'ready', profile: profile() }), 'main');
  assert.equal(getOnboardingDestination('user-1', { status: 'ready', profile: profile({ onboarding_completed: false }) }), 'onboarding');
});

test('a profile from another account never opens the signed-in routes', () => {
  assert.equal(getOnboardingDestination('user-2', { status: 'ready', profile: profile() }), 'loading');
});

test('the index route sends each destination to its screen', () => {
  const index = read('../src/app/index.tsx');
  assert.match(index, /destination === 'auth'\) return <Redirect href="\/welcome" \/>/);
  assert.match(index, /destination === 'main'\) return <Redirect href="\/home" \/>/);
  assert.match(index, /destination === 'onboarding'\) return <Redirect href="\/onboarding" \/>/);
  assert.match(index, /if \(recovery\) return <Redirect href="\/reset-password" \/>/);
});

test('the gallery is reachable only from a development-only link', () => {
  const root = new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const references = sourceFiles(decodeURIComponent(root))
    .filter((path) => /['"`]\/gallery['"`]/.test(readFileSync(path, 'utf8')))
    .map((path) => path.replaceAll('\\', '/').split('/src/')[1]);
  assert.deepEqual(references, ['features/auth/auth-screen.tsx']);
  assert.match(read('../src/features/auth/auth-screen.tsx'), /\{__DEV__ \? <Link href="\/gallery"/);
});

test('the gallery hands over to the normal destination when the session changes', () => {
  const route = read('../src/app/gallery.tsx');
  assert.match(route, /const \[openedAs\] = useState\(userId\)/);
  assert.match(route, /if \(!Gallery \|\| openedAs !== userId\) return <Redirect href="\/" \/>/);
  assert.match(route, /__DEV__ \? require\('\.\.\/dev\/component-gallery'\)/);
});

test('leaving the gallery does not push another screen above it', () => {
  const gallery = read('../src/dev/component-gallery.tsx');
  assert.doesNotMatch(gallery, /<Link\b/);
  assert.match(gallery, /router\.canGoBack\(\) \? router\.back\(\) : router\.replace\('\/'\)/);
});
