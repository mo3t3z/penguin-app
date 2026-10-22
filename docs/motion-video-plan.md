# Penguin Motion Video: خطة التنفيذ

نوع: Motion Graphics · المدة: 30 ثانية · الأبعاد: 9:16 (1080×1920) · 30 fps = 900 frame.
الأدوات: ChatGPT (سكريبت، نصوص، assets، موسيقى) · Claude Code (كود Remotion) · Remotion (render).

هذه وثيقة تخطيط فقط، ما فيهاش تغيير في كود التطبيق. فيديو Remotion يعيش في مجلد منفصل `motion/`
باش ما يتخلطش مع Expo/Metro (`src/app/` فيه routes فقط).

## 1. قواعد أساسية

- نعرضو كان الميزات الموجودة فعلا في الكود (حسب `docs/ROADMAP.md`): Feed وCreate Post، Discover
  (طلبة + منشورات)، Messages مع chat live، Groups مع roles. ما نعرضوش Notifications ولا Settings
  (Sprint 8 و9 PLANNED).
- بيانات وهمية فقط: أسماء ووجوه مخترعة. ما نستعملوش صور أو محادثات طلبة حقيقيين.
- ما نستعملوش logos تطبيقات أخرى (WhatsApp، Instagram…). نستعملو أشكال عامة.
- الفيديو تسويقي. ما يعوّضش قبول Android على الجهاز (الـ checklist يبقى DEFERRED).
- الشاشات تتبني كـ React components تحاكي UI التطبيق بنفس tokens (أدق من screen recording وتتحرك
  براحتنا). بديل: screen recording من الجهاز يدخل كـ `<OffthreadVideo>` في مشهد واحد كان نحبو.

## 2. Design tokens (من `src/theme/tokens.ts`)

| Token | Light | Dark |
|---|---|---|
| background | `#FAF7F2` | `#15120F` |
| card | `#FFFFFF` | `#1E1A16` |
| foreground | `#1C1712` | `#F6F1EA` |
| muted-foreground | `#6A6158` | `#ADA399` |
| primary (Volcanic Orange) | `#FF7A00` | `#FF7A00` |
| primary-pressed | `#E56D00` | `#E56D00` |
| accent | `#FFF0E1` | `#3A230F` |
| border | `#ECE5DC` | `#332C25` |

اقتراح: الفيديو كامل Dark (`#15120F`) مع primary برتقالي، والمشهد الأخير ينقلب Light (`#FAF7F2`)
كـ "شروق". النص على primary يكون `#1C1712` (مش أبيض) كيما يعمل التطبيق.
الخط: IBM Plex Sans Arabic أو Cairo (عبر `@remotion/google-fonts`) للعربية، وInter للأرقام واللاتيني.
تأكد من الخط الفعلي للتطبيق في `src/` قبل ما تثبّت.

## 3. Storyboard (900 frame)

الكتابة بالعربية، RTL. الـ copy نص مقترح، عدّلو قبل الإنتاج.

| # | الوقت | Frames | المشهد | Copy (AR) | Animation |
|---|---|---|---|---|---|
| 1 | 0.0–3.0s | 0–89 | **Hook**: فوضى. 5 فقاعات رسائل وأيقونات عامة تطير وتتصادم على خلفية داكنة. | "حياتك في الجامعة موزّعة على 5 تطبيقات؟" | الفقاعات `spring` عشوائية (seed ثابت)، shake خفيف، النص يدخل كلمة بكلمة (stagger 4f). في آخر 10f الفقاعات تنسحب للمركز. |
| 2 | 3.0–6.0s | 90–179 | **Logo reveal**: الفقاعات تذوب في دائرة برتقالية، الدائرة تتحول للـ penguin mascot. | "Penguin" | Scale 0→1 بـ spring (damping 12)، glow برتقالي pulse، wordmark يتكتب بـ clip mask. Flash أبيض 3 frames عند الـ morph. |
| 3 | 6.0–11.0s | 180–329 | **Feed + Create**: phone mockup يطلع من تحت. Post card يتسقط في الـ feed، بعدها زر Create (+) يتضغط ويتفتح composer. | "شارك. حتى لو كان فكرة صغيرة." | Phone: translateY 400→0 + rotate 6°→0. Cards stagger 8f. زر Create: scale 1→0.9→1.05→1 مع ripple. Like: قلب يفرقع (scale + particles 6). |
| 4 | 11.0–16.0s | 330–479 | **Discover**: search bar تتكتب "ENIT"، نتائج طلبة تدخل بـ stagger، tab يتبدل لمنشورات. | "لقى أصحابك وزملاءك." | Typewriter 2f/حرف. Result rows slide-in من اليمين (RTL) 6f stagger. Tab indicator تنزلق بـ spring. |
| 5 | 16.0–21.0s | 480–629 | **Messages live**: bubbles تدخل مباشرة، "typing…" dots، رد يوصل، read tick. | "ديسكي، وباللحظة." | Bubble pop (scale 0.6→1، origin حسب الجهة). Dots: 3 نقاط sin wave offset 5f. شاشة الـ tab bar تظهر مع إبراز Messages. |
| 6 | 21.0–26.0s | 630–779 | **Groups + roles**: شاشة مجموعة، badges للأدوار (Owner/Admin/Member) تظهر وحدة وحدة، عدد الأعضاء يعدّ. | "كوّن مجموعتك. ونظّمها." | Avatars على دائرة يدخلو بـ stagger. Role badge يختم (scale 1.4→1 + rotate -8°→0). Counter `interpolate` 0→48. |
| 7 | 26.0–30.0s | 780–899 | **CTA**: خلفية تنقلب Light، mascot في المركز، tab bar بالخمس أيقونات تظهر تحتو. | "Penguin: مجتمع الطلبة. حمّل التطبيق." | BG color interpolate dark→light على 20f. Mascot bounce. 5 tab icons stagger. آخر 15f hold ثابت (للـ end card). |

ملاحظة: قبل النشر، تأكد شنوة الـ CTA الحقيقي (رابط، APK، store). حاليا ما فما حتى store release
موثّق في ROADMAP، فخلي النص "قريبا" أو "جرّبه" حسب الواقع.

### Transitions
بين المشاهد نستعملو `@remotion/transitions` (`slide` أفقي، `wipe`، `fade`) بمدة 10–12 frame
تتخصم من الـ Sequences (`TransitionSeries`). المشهد 2→3 حركة match-cut: الـ mascot يصغر ويصير
avatar في الـ feed.

## 4. مكتبة الـ Animation (قواعد موحدة)

- `spring` configs: `snappy {damping:14, stiffness:180}`، `soft {damping:20, stiffness:90}`،
  `bouncy {damping:9, stiffness:150}`.
- Stagger ثابت: 6 frames للـ lists، 4 frames للكلمات، 2 frames للحروف.
- Easing للحركات الغير spring: `Easing.bezier(0.22, 1, 0.36, 1)`.
- كل الـ randomness بـ `random('seed-name')` من Remotion (deterministic).
- Safe zone 9:16: 150px فوق و 380px تحت بلا نص مهم (UI تيك توك/Reels يغطيها)، 60px هوامش جانبية.
- Captions: كبيرة (64–80px)، 1–2 أسطر، تباين >= 4.5:1.
- احترام `use-reduce-motion`؟ غير مطلوب في فيديو.

## 5. Assets

| Asset | الملف | المصدر |
|---|---|---|
| Mascot | `assets/penguin-mascot.png`, `penguin-mascot-small.png` | موجود في المشروع (نسخه لـ `motion/public/`) |
| Wordmark | `assets/penguin-logo-horizontal.png` | موجود. ندعو نسخة داكنة/فاتحة حسب `brand.wordmark` |
| App icon | `assets/penguin-app-icon.png` | موجود |
| Avatars وهمية x8 | `motion/public/avatars/a1..a8.png` | ChatGPT image generation (انظر prompt 6.3) أو initials في CSS (أسهل وأأمن) |
| Phone frame | SVG/CSS داخل الكود | يتبنى بكود، بلا asset |
| Icons (tab bar، قلب، +) | نفس مكتبة أيقونات التطبيق | تأكد منها في `src/components/navigation/tab-bar.tsx` |
| Mock data | `motion/src/data/mock.ts` | ChatGPT يولّدها JSON (6.2) |
| موسيقى | `motion/public/audio/bed.mp3` | Suno/Udio/مكتبة رخصة واضحة. 30s، ~110 BPM، instrumental |
| SFX (pop، whoosh، tick) | `motion/public/audio/sfx/` | مكتبة مجانية بترخيص واضح |

الـ tab bar لازم يظهر بالخمس عناصر: Home، Discover، Create، Messages، Profile (route `account`).

## 6. دور ChatGPT (قبل Claude Code)

### 6.1 تنقيح السكريبت
> أنت copywriter لتطبيق طلبة اسمه Penguin. عندي storyboard من 7 مشاهد لفيديو 30 ثانية، 9:16.
> اكتب 3 نسخ للنص العربي (فصحى مبسطة، دارجة تونسية، فرنسية) كل سطر <= 6 كلمات، نبرة ودودة
> وطاقة عالية، بلا مبالغة. أعطني كل مشهد في سطر. الميزات المسموحة: feed، create post، discover،
> chat مباشر، groups بأدوار. ممنوع تذكر notifications أو أي ميزة أخرى.

### 6.2 Mock data
> ولّد JSON لبيانات وهمية لتطبيق طلبة تونسي: 8 طلبة (اسم مخترع، تخصص، سنة)، 5 منشورات قصيرة
> بالعربية والدارجة، محادثة من 6 رسائل بين طالبين، مجموعة بـ 6 أعضاء مع أدوار owner/admin/member.
> بلا أرقام هواتف ولا مؤسسات حقيقية ولا أسماء مشاهير. الشكل: { students, posts, chat, group }.

### 6.3 صور avatars (اختياري)
> 8 avatars بأسلوب illustration مسطح، دائري، خلفيات دافئة (برتقالي، كريمي، بني)، وجوه مجردة
> متنوعة، بدون نص، بدون logos، 512×512، نفس الأسلوب كلهم.

### 6.4 موسيقى
> Instrumental, upbeat modern electronic-pop, 110 BPM, 30 seconds, warm plucks and soft kick,
> clear build at 0:03 and a drop at 0:06, bright resolve at 0:26, clean ending on beat.

## 7. Prompt جاهز لـ Claude Code

انسخ هذا في session جديدة داخل مجلد المشروع.

```text
مهمتك: ابني فيديو Motion Graphics تسويقي لتطبيق Penguin باستخدام Remotion.

قيود المشروع (من CLAUDE.md): لا تعدّل شيئا داخل src/ أو supabase/ أو app.json. لا تشغّل EAS ولا أي
أمر git commit/push. لا تنشئ أو تعدّل إلا مجلد motion/ جديد. شغّل git status قبل البدء وما تلمسش
الملفات غير المرتبطة. ما تطبعش أي سر من .env.

قبل أي كود: افتح https://www.remotion.dev/docs واقرأ الصفحات الخاصة بـ: the-fundamentals،
sequence، transitions (TransitionSeries)، spring، interpolate، staticFile، @remotion/google-fonts،
audio، render CLI. اتبع النسخة الحالية من الـ API ولا تعتمد على الذاكرة. اكتب في ردك رقم نسخة
remotion التي ثبّتها.

المواصفات: 1080x1920 (9:16)، 30 fps، 900 frame بالضبط. Composition id: "PenguinPromo".

1) أنشئ motion/ كمشروع Remotion مستقل (TypeScript، package.json خاص به، مش workspace للتطبيق).
   انسخ من assets/ إلى motion/public/: penguin-mascot.png، penguin-logo-horizontal.png،
   penguin-app-icon.png.
2) motion/src/theme.ts: استورد القيم يدويا (لا تستورد من src/) من src/theme/tokens.ts:
   dark background #15120F، card #1E1A16، foreground #F6F1EA، primary #FF7A00، accent #3A230F،
   border #332C25، muted-foreground #ADA399، light background #FAF7F2، light foreground #1C1712.
   النص فوق primary لونه #1C1712. الخط IBM Plex Sans Arabic عبر @remotion/google-fonts، وInter
   للأرقام. RTL للعربية (direction: rtl).
3) motion/src/anim.ts: spring presets (snappy {damping:14,stiffness:180}، soft {damping:20,
   stiffness:90}، bouncy {damping:9,stiffness:150})، ثوابت stagger (list 6f، word 4f، char 2f)،
   easing Easing.bezier(0.22,1,0.36,1). كل العشوائية عبر random("seed").
4) motion/src/data/mock.ts: بيانات وهمية (8 طلبة، 5 منشورات، محادثة من 6 رسائل، مجموعة بـ 6 أعضاء
   وأدوار owner/admin/member). أسماء مخترعة فقط، بدون بيانات حقيقية.
5) مكونات مشتركة: PhoneFrame (CSS)، PostCard، StudentRow، ChatBubble، TypingDots، RoleBadge،
   TabBar (5 عناصر بالترتيب: Home، Discover، Create، Messages، Profile)، Caption (آمن في safe zone:
   150px فوق و380px تحت و60px جوانب).
6) 7 مشاهد في motion/src/scenes/ ثم ركّبها في TransitionSeries بانتقالات 10-12 frame
   تُخصم من المدة بحيث يبقى المجموع 900 frame:
   S1 Hook 0-89: فقاعات فوضى عامة (بدون شعارات تطبيقات حقيقية) + نص "حياتك في الجامعة موزّعة على 5
      تطبيقات؟"، الكلمات تدخل stagger.
   S2 Logo 90-179: الفقاعات تذوب في دائرة برتقالية تتحول إلى mascot، glow pulse، wordmark بـ clip
      mask، "Penguin".
   S3 Feed+Create 180-329: PhoneFrame يطلع من تحت (translateY 400→0، rotate 6→0)، بطاقات منشورات
      stagger، زر Create يُضغط ويفتح composer، قلب like مع 6 particles. نص "شارك. حتى لو كانت
      فكرة صغيرة."
   S4 Discover 330-479: typewriter "ENIT" في search، نتائج طلبة slide-in، تبديل tab لمنشورات
      بـ spring. نص "لقى أصحابك وزملاءك."
   S5 Chat 480-629: فقاعات تدخل pop، TypingDots، ردّ يصل، tick قراءة، إبراز تبويب Messages. نص
      "ديسكي، وباللحظة."
   S6 Groups 630-779: avatars على دائرة stagger، RoleBadge بختم (scale 1.4→1، rotate -8→0)،
      عدّاد أعضاء 0→48. نص "كوّن مجموعتك. ونظّمها."
   S7 CTA 780-899: الخلفية تنقلب من dark إلى light خلال 20 frame، mascot يقفز، 5 أيقونات TabBar
      تظهر stagger، hold ثابت في آخر 15 frame. نص "Penguin: مجتمع الطلبة." وسطر CTA كمتغير
      في motion/src/copy.ts (الافتراضي "قريبا").
   كل النصوص في motion/src/copy.ts بحيث يسهل تبديل اللغة (ar/tn/fr).
7) الصوت: لو وُجد motion/public/audio/bed.mp3 استعمله بـ <Audio> مع fade-in 15f وfade-out 20f
   (interpolate على volume). لو غير موجود، لا تفشل: تخطّ الصوت واذكر ذلك.
8) أضف Still لكل مشهد (id: "Scene1".."Scene7") لمراجعة سريعة.
9) سكربتات package.json: "dev": "remotion studio"، "render": "remotion render PenguinPromo
   out/penguin-promo.mp4 --codec=h264"، "stills": render لكل Still إلى out/stills/.

التحقق قبل ما تقول "تم":
- npx tsc --noEmit داخل motion/ ينجح.
- شغّل remotion render فعليا وأكد أن المخرج mp4 بطول 30.0s و1080x1920 (استعمل ffprobe لو متوفر).
- ارندر Stills للمشاهد السبعة وافحصها بصريا: لا نص خارج safe zone، لا overflow، RTL صحيح،
  التباين مقروء.
- اذكر بصدق أي شيء لم تتحقق منه (الصوت، الخطوط، مشهد معين).
- لا تعمل commit. اذكر الملفات الجديدة فقط.

سلّم: شجرة motion/، مخرج out/penguin-promo.mp4، ملخص قصير بالتعديلات الممكنة للـ copy والتوقيت.
```

## 8. خطة التنفيذ (مراحل)

| المرحلة | شنوة | مين | وقت تقريبي |
|---|---|---|---|
| 0 | تثبيت الـ copy واللغة، تأكيد CTA الحقيقي | أنت + ChatGPT (6.1) | 30 د |
| 1 | mock data وavatars وموسيقى | ChatGPT (6.2–6.4) | 45 د |
| 2 | scaffold Remotion + theme + مكونات | Claude Code | 1–2 س |
| 3 | المشاهد 1–7 + transitions | Claude Code | 2–3 س |
| 4 | مراجعة Stills وتعديل التوقيت | أنت + Claude Code | 1 س |
| 5 | صوت + render نهائي + export إضافي | Claude Code | 30 د |

Render إضافي: نفس الـ composition بـ `--codec=h264 --crf=18` للنسخة النهائية، وGIF قصير
للمعاينة. الأبعاد 9:16 تنفع TikTok/Reels/Shorts/Status.

## 9. نقاط لازم تتأكد منها

- **ترخيص Remotion**: مجاني للأفراد والشركات الصغيرة، غير هذا يتطلب ترخيص. راجع remotion.dev/license.
- **ترخيص الموسيقى والـ SFX** قبل النشر العام.
- **CTA**: ما فما حتى إصدار store موثّق، لا تكتب "حمّل الآن" إلا لو صحيح.
- الفيديو يعرض ميزات "IMPLEMENTED LOCALLY"، وحتى Android acceptance ما كملش (Groups core accepted،
  والباقي DEFERRED). مقبول للتسويق المبكر، لكن لا تعد بميزات غير موجودة.
- الخط العربي: تأكد من الـ glyphs وrtl في Stills قبل الـ render الكامل.
