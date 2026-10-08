import type { StudyLevel } from '@/lib/database.types';

// One exhaustive label map for onboarding, profile display and editing.
export const studyLevels: Record<StudyLevel, string> = {
  secondary: 'Secondary education', vocational: 'Vocational / technical training',
  undergraduate: 'Undergraduate', postgraduate: 'Postgraduate', doctoral: 'Doctoral', other: 'Other study level',
};
