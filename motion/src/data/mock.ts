// Invented sample data only.
export type Role = 'owner' | 'admin' | 'member';

export const students = [
  {name: 'سلمى بن يوسف', school: 'ENIT · هندسة مدنية', hue: 24},
  {name: 'ياسين الطرابلسي', school: 'ENIT · إعلامية', hue: 200},
  {name: 'مريم الحداد', school: 'ENIT · كهرباء', hue: 330},
  {name: 'أيوب القاسمي', school: 'ENIT · ميكانيك', hue: 140},
  {name: 'نور الهدى بوزيد', school: 'ENIT · صناعية', hue: 270},
  {name: 'حمزة الشريف', school: 'ENIT · اتصالات', hue: 50},
  {name: 'ريم العياري', school: 'ENIT · مائية', hue: 180},
  {name: 'كريم المنصوري', school: 'ENIT · إعلامية', hue: 10},
];

export const posts = [
  {author: 0, text: 'شكون عندو ملخص الرياضيات 2؟ نبدلو بملخص الفيزياء 📚', likes: 24},
  {author: 1, text: 'هاكاثون الويكاند الجاي، نلوجو على مصمم UI 🎨', likes: 41},
  {author: 2, text: 'مكتبة الكلية مفتوحة لين 10 الليل هالجمعة', likes: 17},
  {author: 3, text: 'نادي الروبوتيك يقبل أعضاء جدد 🤖', likes: 33},
  {author: 4, text: 'فكرة صغيرة: كل جمعة قهوة وحل تمارين مع بعضنا ☕', likes: 58},
];

export const chat = [
  {from: 'them', text: 'وينك؟ الجماعة الكل في المكتبة'},
  {from: 'me', text: 'جاي توا، 5 دقايق'},
  {from: 'them', text: 'جيب معاك الشارجور 🔌'},
  {from: 'me', text: 'باهي 👍'},
  {from: 'them', text: 'ونسيت: الامتحان تبدل للخميس'},
  {from: 'me', text: 'يعيشك، ما كنتش نعرف!'},
] as const;

export const group = {
  name: 'نادي الروبوتيك',
  members: [
    {student: 1, role: 'owner' as Role},
    {student: 0, role: 'admin' as Role},
    {student: 3, role: 'admin' as Role},
    {student: 2, role: 'member' as Role},
    {student: 5, role: 'member' as Role},
    {student: 7, role: 'member' as Role},
  ],
  total: 48,
};
