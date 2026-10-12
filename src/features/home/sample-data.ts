// MOCK DATA. Nothing in this file comes from Supabase and nothing done to it is
// saved. It fills the parts of Home that have no backend yet (stories, the
// Following and My School tabs, and post types beyond text and images) so the
// layout can be built and reviewed. Every surface that renders it is labelled as
// a preview. Replace it with real queries as each feature gets its tables.

export type SampleScope = 'following' | 'my-school';

export type SampleStory = { id: string; label: string };

export const sampleStories: SampleStory[] = [
  { id: 'story-math', label: 'Math Club' },
  { id: 'story-info', label: 'Informatique' },
  { id: 'story-physique', label: 'Physique' },
  { id: 'story-svt', label: 'SVT' },
  { id: 'story-anglais', label: 'Anglais' },
  { id: 'story-philo', label: 'Philosophie' },
];

type SamplePostBase = {
  id: string;
  scope: SampleScope;
  author: string;
  // Track or school shown under the name.
  meta: string;
  time: string;
  title?: string;
  text: string;
  likes: number;
  comments: number;
};

export type SamplePollOption = { id: string; label: string; percent: number };

export type SamplePost = SamplePostBase & (
  | { kind: 'text' }
  | { kind: 'photo'; imageLabel: string }
  | { kind: 'resource'; fileName: string; fileInfo: string }
  | { kind: 'question'; formula: string }
  | { kind: 'poll'; options: SamplePollOption[]; votes: number; timeLeft: string }
  | { kind: 'study-partner' }
  | { kind: 'event'; date: string; place: string; participants: number }
  | { kind: 'achievement'; milestone: string; percent: number }
);

export type SamplePostKind = SamplePost['kind'];

export const samplePostKindLabels: Record<SamplePostKind, string | null> = {
  text: null,
  photo: 'Photo',
  resource: 'Resource',
  question: 'Question',
  poll: 'Poll',
  'study-partner': 'Study partner',
  event: 'Event',
  achievement: 'Achievement',
};

export const samplePosts: SamplePost[] = [
  {
    id: 'sample-resource-1', scope: 'following', kind: 'resource',
    author: 'Ahmed Ben Ali', meta: 'Bac Info', time: '2h',
    title: 'Résumé complet des structures de données',
    text: 'Voici un résumé que j’ai préparé, j’espère que ça vous aide !',
    fileName: 'Résumé_Algo_Structures.pdf', fileInfo: 'PDF · 2.4 MB',
    likes: 128, comments: 24,
  },
  {
    id: 'sample-question-1', scope: 'following', kind: 'question',
    author: 'Sara Trabelsi', meta: 'Bac Maths', time: '4h',
    text: 'Quelqu’un peut m’expliquer cette question ?',
    formula: '∫ (x² + 1) / (x² − 4) dx = ?',
    likes: 56, comments: 18,
  },
  {
    id: 'sample-study-partner-1', scope: 'following', kind: 'study-partner',
    author: 'Karim Mestiri', meta: 'Université', time: '10h',
    text: 'Je cherche un partenaire d’étude pour les projets web (React / Next.js). Si tu es intéressé, laisse un commentaire !',
    likes: 73, comments: 41,
  },
  {
    id: 'sample-photo-1', scope: 'following', kind: 'photo',
    author: 'Amira S.', meta: 'Bac SVT', time: '12h',
    text: 'Notre salle d’étude du jour 📚☕',
    imageLabel: 'A desk with a laptop, open notebooks and a mug',
    likes: 189, comments: 14,
  },
  {
    id: 'sample-text-1', scope: 'following', kind: 'text',
    author: 'Yassine K.', meta: 'Bac Physique', time: '1d',
    text: 'Petit rappel : relisez vos fiches de mécanique avant de refaire les annales, ça change tout sur les exercices de dynamique.',
    likes: 96, comments: 8,
  },
  {
    id: 'sample-poll-1', scope: 'my-school', kind: 'poll',
    author: 'Nour El Houda', meta: 'Bac Lettres', time: '8h',
    text: 'Quelle méthode trouvez-vous la meilleure pour réviser l’anglais ?',
    options: [
      { id: 'cards', label: 'Fiches de vocabulaire', percent: 52 },
      { id: 'series', label: 'Séries en version originale', percent: 28 },
      { id: 'other', label: 'Autre (précisez en commentaire)', percent: 20 },
    ],
    votes: 214, timeLeft: '16h left',
    likes: 45, comments: 32,
  },
  {
    id: 'sample-event-1', scope: 'my-school', kind: 'event',
    author: 'Club Informatique', meta: '1K members', time: '12h',
    title: 'Atelier : Introduction à l’IA 🤖',
    text: 'Une séance d’initiation ouverte à tous les niveaux.',
    date: 'Sam, 14 Oct · 14:00 – 16:00', place: 'Salle 12, bâtiment B', participants: 56,
    likes: 120, comments: 18,
  },
  {
    id: 'sample-achievement-1', scope: 'my-school', kind: 'achievement',
    author: 'Mohamed A.', meta: 'Bac Math', time: '1d',
    text: 'J’ai enfin terminé tous les exercices du chapitre 3 ! 💪 Prochaine étape : examen blanc.',
    milestone: 'Chapitre 3 — Probabilités', percent: 100,
    likes: 210, comments: 26,
  },
  {
    id: 'sample-resource-2', scope: 'my-school', kind: 'resource',
    author: 'Ines Gharbi', meta: 'Bac Physique', time: '2d',
    title: 'Fiches de révision — Physique (Mécanique)',
    text: 'J’ai compilé les fiches les plus importantes pour le Bac. N’hésitez pas à ajouter vos remarques !',
    fileName: 'Fiches_Mecanique.pdf', fileInfo: 'PDF · 1.1 MB',
    likes: 96, comments: 8,
  },
];

export function samplePostsFor(scope: SampleScope) {
  return samplePosts.filter((post) => post.scope === scope);
}
