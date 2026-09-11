import { LearningSubmit } from '@/components/learning-submit';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { courseSources, ownedCourse, passageSnapshot } from '@/lib/courses/learning-service';
import { LearningError, learningButton, learningPanel } from '@/components/learning-ui';
import { analyzeLearningCourse } from '../learning-actions';
export const dynamic='force-dynamic';
export default async function CoursePage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{readingError?:string}>}) {
  const user=await requireCurrentUser();const {id}=await params;const search=await searchParams;
  const course=await ownedCourse(prisma,user.id,id).catch(()=>notFound());const snapshot=passageSnapshot(course);
  const assets=courseSources(course);
  const verified=snapshot.passages.filter(p=>p.quality==='verified').length;
  const versions=await prisma.projectVersion.findMany({where:{userId:user.id,courseThemeId:id,mode:{in:['explain','summary','essential','visual']}},orderBy:{createdAt:'desc'},take:10,select:{id:true,mode:true,createdAt:true}});
  const sessions=await prisma.learningSession.findMany({where:{userId:user.id,courseThemeId:id},orderBy:{updatedAt:'desc'},take:10,select:{id:true,kind:true}});
  const pending=assets.flatMap(a=>a.extractions.filter(e=>e.quality==='needs-vision'&&!a.extractions.some(l=>l.unitKey===e.unitKey&&['ocr','reviewed'].includes(l.method))).map(e=>({id:e.id,label:`${a.imports[0]?.originalFileName} · ${e.unitKey}`})));
  const uncertain=assets.flatMap(a=>a.extractions.filter(e=>e.method==='ocr'&&!a.extractions.some(l=>l.unitKey===e.unitKey&&l.method==='reviewed')));
  return <main className="mx-auto grid max-w-3xl min-w-0 gap-6 break-words pb-10">
    <Link href="/courses" className="text-moss underline">← Mes cours</Link>
    <header><h1 className="text-3xl font-bold">{course.title}</h1><p className="mt-4 text-xl">Que veux-tu faire ?</p></header>
    <nav aria-label="Travailler ce cours" className="grid gap-4">{[['understand','Comprendre ce cours'],['revise','Réviser'],['homework','J’ai un devoir']].map(([path,label])=><Link key={path} className={`${learningButton} min-h-20 text-xl`} href={`/courses/${id}/${path}`}>{label}</Link>)}</nav>
    <section className={learningPanel} aria-label="État du cours">
      <h2 className="text-lg font-bold">{verified?'Cours prêt':pending.length?'Améliorons la lecture du cours':uncertain.length?'Quelques passages sont à vérifier':'Ton cours se préparera avec ton activité'}</h2>
      {!verified&&!pending.length&&!uncertain.length?<p>Choisis ce que tu veux faire. Nous lirons automatiquement le texte disponible.</p>:null}
      {pending.length?<><p>{verified?'Certaines pages sont des images. Tu peux déjà utiliser le cours, ou améliorer leur lecture.':'Certaines pages sont des images. Améliorons leur lecture pour travailler dessus.'}</p><a className="w-fit text-moss underline" href="#course-reading">Améliorer la lecture des pages</a></>:null}
    </section>
    {pending.length||search.readingError||!verified?<details id="course-reading" className={learningPanel} open={search.readingError?true:undefined}>
      <summary className="cursor-pointer font-bold">{pending.length?'Améliorer la lecture des pages en images':'Améliorer la lecture du cours'}</summary>
      {search.readingError==='consent'?<p role="alert">Choisis au moins une page et donne ton accord avant de continuer.</p>:<LearningError code={search.readingError}/>}
      {pending.length?<form action={analyzeLearningCourse} className="grid gap-3">
        <input type="hidden" name="courseId" value={id}/>
        <fieldset className="grid gap-2"><legend>Choisis jusqu’à cinq pages</legend>{pending.map(p=><label key={p.id} className="flex items-start gap-3 py-2"><input type="checkbox" name="page" value={p.id} className="mt-1 size-5"/><span>{p.label}</span></label>)}</fieldset>
        <label className="flex items-start gap-3"><input type="checkbox" name="consent" value="yes" required className="mt-1 size-5"/><span>J’autorise l’envoi des pages choisies au service d’analyse {process.env.OCR_PROVIDER==='openai'?'OpenAI':'configuré'}. Cette analyse peut être payante.</span></label>
        <LearningSubmit className={learningButton}>Analyser les pages choisies</LearningSubmit>
      </form>:<p>Tu peux vérifier les passages reconnus ci-dessous ou <Link href="/courses" className="text-moss underline">ajouter un document plus lisible</Link>.</p>}
    </details>:null}
  {uncertain.length?<section className={learningPanel}><h2 className="text-lg font-bold">Passages à vérifier</h2><p>Compare le texte reconnu à l’image avant de l’utiliser pour un exercice.</p>{uncertain.map(e=><Link className="text-moss underline" key={e.id} href={`/courses/${id}/reading/${e.id}`}>Vérifier {e.unitKey}</Link>)}</section>:null}
  {versions.length||sessions.length?<section className={learningPanel}><h2 className="text-lg font-bold">Reprendre mon travail</h2>{versions.map(v=><Link className="text-moss underline" key={v.id} href={`/courses/${id}/content/${v.id}`}>{({explain:'Explication',summary:'Résumé',essential:'Essentiel',visual:'Visuel'} as Record<string,string>)[v.mode]} · {v.createdAt.toLocaleDateString('fr-FR')}</Link>)}{sessions.map(s=><Link className="text-moss underline" key={s.id} href={`/courses/${id}/session/${s.id}`}>{s.kind==='revision'?'Reprendre une révision':'Reprendre un devoir'}</Link>)}</section>:null}
  <details className={learningPanel}><summary className="cursor-pointer font-bold">Détails techniques</summary>
    <p>{snapshot.passages.length} passages disponibles, dont {verified} vérifiés.</p>
    <p>Lecture locale : 25 Mio et 40 pages ou images maximum par document. Les activités utilisent les passages vérifiés.</p>
    {assets.map(asset=><section key={asset.id}><h3 className="font-semibold">{asset.imports[0]?.originalFileName??'Document'}</h3><ul>{asset.extractions.map(e=><li key={e.id}>{e.unitKey} · {e.method} · {e.quality}</li>)}</ul></section>)}
  </details>
  <details className={learningPanel}><summary className="cursor-pointer font-bold">Documents et organisation</summary>{course.parts.map(part=><section key={part.id}><h2 className="font-semibold">{part.referenceLabel} {part.title}</h2>{part.placements.map(p=><p key={p.id}><a className="text-moss underline" href={`/api/sources/${p.sourceAssetId}/download`}>{p.sourceAsset.imports[0]?.originalFileName??'Original'}</a></p>)}</section>)}<Link href="/courses#organiser" className="text-moss underline">Organiser mes cours</Link></details></main>;
}
