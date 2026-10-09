import { supabase } from '@/lib/supabase';
import type { Profile, ProfileUpdate } from '@/lib/database.types';
import { requireUuid } from '@/features/posts/validation';

function client() {
  if (!supabase) throw new Error('Profile data is not configured.');
  return supabase;
}

async function currentUserId() {
  const { data, error } = await client().auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Sign in to access your profile.');
  return data.user.id;
}

export async function getCurrentProfile() {
  const id = await currentUserId();
  const { data, error } = await client().from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data; // null is a missing profile, not completed onboarding.
}

// What one student may see of another: presentation fields only, never account
// state such as onboarding progress.
const PUBLIC_PROFILE = 'id,username,display_name,avatar_url,institution_id,field_id,study_level,bio,created_at' as const;
export type PublicProfile = Pick<Profile,
  'id' | 'username' | 'display_name' | 'avatar_url' | 'institution_id' | 'field_id' | 'study_level' | 'bio' | 'created_at'>;

// Read-only lookup for a student profile screen. Row-level security decides which
// profiles the signed-in user can read; null means not found or not visible.
export async function getProfileById(id: string): Promise<PublicProfile | null> {
  const { data, error } = await client().from('profiles').select(PUBLIC_PROFILE).eq('id', requireUuid(id)).maybeSingle();
  if (error) throw error;
  return data;
}

export const normalizeUsername = (username: string) => username.trim().toLowerCase();
// Resolve selected records directly, even outside the first search page.
export async function getProfileReferences(institutionId: string | null, fieldId: string | null) {
  const [institution, field] = await Promise.all([
    institutionId ? client().from('institutions').select('*').eq('id', institutionId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    fieldId ? client().from('fields').select('*').eq('id', fieldId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (institution.error) throw institution.error;
  if (field.error) throw field.error;
  return { institution: institution.data, field: field.data };
}
export const isValidUsername = (username: string) => /^[a-z0-9][a-z0-9_]{2,29}$/.test(username);

export async function updateCurrentProfile(input: ProfileUpdate) {
  const id = await currentUserId();
  // Runtime allowlist as well as TS typing: never forward arbitrary identity/timestamp fields.
  const patch: ProfileUpdate = {};
  if (input.username !== undefined) {
    patch.username = input.username === null ? null : normalizeUsername(input.username);
    if (patch.username !== null && !isValidUsername(patch.username)) throw new Error('Use 3–30 letters, numbers or underscores, starting with a letter or number.');
  }
  if (input.display_name !== undefined) patch.display_name = input.display_name?.trim() ?? null;
  if (input.bio !== undefined) patch.bio = input.bio?.trim() ?? null;
  if (input.avatar_url !== undefined) patch.avatar_url = input.avatar_url;
  if (input.institution_id !== undefined) patch.institution_id = input.institution_id;
  if (input.field_id !== undefined) patch.field_id = input.field_id;
  if (input.study_level !== undefined) patch.study_level = input.study_level;
  if (input.onboarding_completed !== undefined) patch.onboarding_completed = input.onboarding_completed;
  if (!Object.keys(patch).length) throw new Error('No profile changes supplied.');
  const { data, error } = await client().from('profiles').update(patch).eq('id', id).select('*').single();
  if (error) throw error; // Includes uniqueness races and DB validation failures.
  return data;
}

export async function checkUsernameAvailability(value: string) {
  const username = normalizeUsername(value);
  if (!isValidUsername(username)) return { username, valid: false, available: false };
  const id = await currentUserId();
  const { data, error } = await client().from('profiles').select('id').eq('username', username).maybeSingle();
  if (error) throw error;
  // Advisory only: the database unique constraint is authoritative at save time.
  return { username, valid: true, available: data === null || data.id === id };
}

type SearchOptions = { search?: string; offset?: number; limit?: number };
function searchOptions({ search = '', offset = 0, limit = 25 }: SearchOptions) {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Use a nonnegative offset and a limit between 1 and 100.');
  }
  // Treat LIKE wildcards literally; do not interpolate into PostgREST OR expressions.
  const pattern = `%${search.trim().slice(0, 120).replace(/[\\%_]/g, '\\$&')}%`;
  return { pattern, offset, limit };
}

export async function listInstitutions(options: SearchOptions & { country?: string } = {}) {
  const { pattern, offset, limit } = searchOptions(options);
  let query = client().from('institutions').select('*').ilike('name', pattern);
  if (options.country) query = query.eq('country', options.country.trim().toUpperCase());
  const { data, error } = await query.order('name').order('id').range(offset, offset + limit - 1);
  if (error) throw error;
  return data;
}

export async function listFields(options: SearchOptions = {}) {
  const { pattern, offset, limit } = searchOptions(options);
  const { data, error } = await client().from('fields').select('*').ilike('name', pattern)
    .order('name').order('id').range(offset, offset + limit - 1);
  if (error) throw error;
  return data;
}
