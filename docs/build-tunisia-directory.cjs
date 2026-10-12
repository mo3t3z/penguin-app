const fs = require('fs');
const path = require('path');
const os = require('os');
const read = name => JSON.parse(fs.readFileSync(path.join(os.tmpdir(), name), 'utf8'));
const ar = read('tn-results-ar.json');
const fr = read('tn-results.json');
const filters = read('tn-filters.json');
const publicIds = new Set(filters.idEtablissement.map(x => String(x.id)));
const french = new Map(fr.result.map(r => [r.id, r]));
const records = ar.result.filter(r => publicIds.has(r.idEtablissement.id));
if (ar.result.length !== Number(ar.length) || fr.result.length !== Number(fr.length)) throw Error('Incomplete source');
const out = path.join(__dirname, 'tunisia-higher-education');
fs.mkdirSync(out, {recursive:true});
const source = 'https://uni-formation.rnu.tn/';
const data = {retrieved:'2026-10-09', source, scope:'Public institutions listed in the official directory. Entries are not confirmation of current admissions; historical habilitations retained.', records:records.map(r=>({id:r.id,ar:r,fr:french.get(r.id)}))};
fs.writeFileSync(path.join(out,'directory-ar-fr.json'),JSON.stringify(data,null,2));
const universities = filters.idUniversite.map(u=>({...u,institutions:[...new Map(records.filter(r=>r.idUniversite.id===String(u.id)).map(r=>[r.idEtablissement.id,r.idEtablissement])).values()]}));
const lines = ['# دليل الجامعات والمؤسسات والاختصاصات العمومية في تونس','', 'تاريخ الاستخراج: 9 أكتوبر 2026. المصدر: [الدليل التونسي الرسمي لعروض التكوين الجامعي]('+source+').','', '**حدود البيانات:** هذه جميع السجلات العمومية التي أعادها الدليل عند الاستخراج، وليست تأكيدًا لفتح التسجيل في كل اختصاص سنة 2026–2027. احتُفظ بفترات التأهيل كما وردت، بما فيها القديمة وغير المبيّنة. قد يتكرر الاختصاص بسبب اختلاف التأهيل أو نمط الدراسة. لا تُفسّر الدكتوراه البحثية على أنها شهادة الطب المهنية. الأسماء من المصدر دون ترجمة تقديرية.','', '## الجامعات والجهة المشرفة','', '| الجامعة / الجهة | المؤسسات في الدليل | سجلات التكوين |','|---|---:|---:|'];
for(const u of universities) lines.push(`| ${u.titre} | ${u.institutions.length} | ${records.filter(r=>r.idUniversite.id===String(u.id)).length} |`);
const esc=x=>String(x||'غير مبيّن').replaceAll('|',' / ').replaceAll('\n',' ');
for(const u of universities){
 lines.push('',`## ${u.titre}`,'');
 for(const i of u.institutions){
  lines.push(`### ${i.titre}`,'','| الشهادة | التخصص / الشعبة | المسار | فترة التأهيل كما بالمصدر | نمط الدراسة |','|---|---|---|---|---|');
  for(const r of records.filter(r=>r.idEtablissement.id===i.id)) lines.push('| '+[r.idDiplome.titre,r.idMention.titre,r.idParcours.titre,r.habilitation,r.idModeDiorganisation.titre].map(esc).join(' | ')+' |');
  lines.push('');
 }
}
fs.writeFileSync(path.join(out,'directory-ar.md'),lines.join('\n'));
const dict=[];const indexes=new Map();const intern=s=>{s=s||'';if(!indexes.has(s)){indexes.set(s,dict.length);dict.push(s);}return indexes.get(s)};
const compact=records.map(r=>[r.idUniversite.titre,r.idEtablissement.titre,r.idDiplome.titre,r.idMention.titre,r.idParcours.titre,r.habilitation,r.idModeDiorganisation.titre].map(intern));
fs.writeFileSync(path.join(out,'compact.json'),JSON.stringify({dict,rows:compact}));
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(universities.map(u=>({university:u.titre,institutions:u.institutions.length,records:records.filter(r=>r.idUniversite.id===String(u.id)).length})),null,2));
console.log(JSON.stringify({records:records.length,institutions:publicIds.size,universities:universities.length,compactBytes:fs.statSync(path.join(out,'compact.json')).size,summary:universities.map(u=>[u.titre,u.institutions.length])}));
