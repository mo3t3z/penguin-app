import { supabase } from '@/lib/supabase';
import { studentSearchFilters } from './search-query';
import { buildStudentPage, isStudentCursor, type StudentCursor, type StudentResult } from './student-search';

function client() {
  if (!supabase) throw new Error('Search is not configured.');
  return supabase;
}

// Presentation fields only, never account state such as onboarding progress.
const STUDENT_RESULT = `
  id,username,display_name,avatar_url,
  institution:institutions!profiles_institution_id_fkey(name),
  field:fields!profiles_field_id_fkey(name)
` as const;

// Runs as the signed-in user, so row-level security decides which profiles can be
// read. Only students who finished onboarding are listed.
export async function searchStudents({ terms, cursor, limit = 20, signal }: {
  terms: readonly string[];
  cursor?: StudentCursor;
  limit?: number;
  signal?: AbortSignal;
}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('Search page size must be between 1 and 50.');
  }
  let query = client().from('profiles').select(STUDENT_RESULT)
    .eq('onboarding_completed', true)
    .not('username', 'is', null);
  for (const filter of studentSearchFilters(terms)) query = query.or(filter);
  if (cursor !== undefined) {
    if (!isStudentCursor(cursor)) throw new Error('Invalid search cursor.');
    query = query.gt('username', cursor);
  }
  let request = query.order('username', { ascending: true }).limit(limit + 1);
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  return buildStudentPage(data as unknown as StudentResult[], limit);
}
