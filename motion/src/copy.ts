export type Lang = 'ar' | 'tn' | 'fr';

type Copy = {
  dir: 'rtl' | 'ltr';
  hook: string;
  brand: string;
  feed: string;
  discover: string;
  search: string;
  chat: string;
  groups: string;
  ctaTitle: string;
  cta: string;
  tabs: [string, string, string, string, string];
  composer: string;
  people: string;
  posts: string;
  members: string;
};

export const COPY: Record<Lang, Copy> = {
  ar: {
    dir: 'rtl',
    hook: 'حياتك في الجامعة موزّعة على 5 تطبيقات؟',
    brand: 'Penguin',
    feed: 'شارك. حتى لو كانت فكرة صغيرة.',
    discover: 'لقى أصحابك وزملاءك.',
    search: 'ENIT',
    chat: 'ديسكي، وباللحظة.',
    groups: 'كوّن مجموعتك. ونظّمها.',
    ctaTitle: 'Penguin: مجتمع الطلبة.',
    cta: 'قريبا',
    tabs: ['الرئيسية', 'اكتشف', 'إنشاء', 'الرسائل', 'الملف'],
    composer: 'شنوّة في بالك؟',
    people: 'طلبة',
    posts: 'منشورات',
    members: 'عضو',
  },
  tn: {
    dir: 'rtl',
    hook: 'حياتك في الفاك مقسومة على 5 تطبيقات؟',
    brand: 'Penguin',
    feed: 'شارك. حتى كان فكرة صغيرة.',
    discover: 'لقى صحابك وزملاءك.',
    search: 'ENIT',
    chat: 'ديسكي، وفي بلاصتها.',
    groups: 'عمل الجماعة متاعك. ونظّمها.',
    ctaTitle: 'Penguin: مجتمع الطلبة.',
    cta: 'قريب',
    tabs: ['الرئيسية', 'اكتشف', 'إنشاء', 'الميساجات', 'البروفيل'],
    composer: 'شنوّة في بالك؟',
    people: 'طلبة',
    posts: 'بوستات',
    members: 'عضو',
  },
  fr: {
    dir: 'ltr',
    hook: 'Ta vie étudiante éparpillée sur 5 applis ?',
    brand: 'Penguin',
    feed: 'Partage. Même une petite idée.',
    discover: 'Retrouve tes amis et camarades.',
    search: 'ENIT',
    chat: 'Discute, en temps réel.',
    groups: 'Crée ton groupe. Organise-le.',
    ctaTitle: 'Penguin : la communauté étudiante.',
    cta: 'Bientôt',
    tabs: ['Accueil', 'Découvrir', 'Créer', 'Messages', 'Profil'],
    composer: 'Quoi de neuf ?',
    people: 'Étudiants',
    posts: 'Publications',
    members: 'membres',
  },
};

// Switch language here.
export const LANG: Lang = 'ar';
export const copy = COPY[LANG];
