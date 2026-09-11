import { LearningSubmit } from '@/components/learning-submit';
import Link from 'next/link';
import { requireCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ownedCourse } from '@/lib/courses/learning-service';
import { BackToCourse, LearningPreparationError, learningButton, learningPanel } from '@/components/learning-ui';
import { startCourseLearning } from '../../learning-actions';
export default async function ReviseCourse({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{minutes?:string;error?:string}>}) {
  const user=await requireCurrentUser();const {id}=await params;await ownedCourse(prisma,user.id,id);const {minutes,error}=await searchParams;
  const chosen=minutes==='5'||minutes==='10';
  return <div className="mx-auto grid max-w-2xl gap-6"><BackToCourse id={id}/><h1 className="text-3xl font-bold">Réviser</h1><LearningPreparationError code={error} courseId={id}/>{!chosen?<><p>Combien de temps veux-tu y consacrer ?</p><div className={learningPanel}>{[5,10].map(n=><Link className={learningButton} key={n} href={`/courses/${id}/revise?minutes=${n}`}>{n} minutes</Link>)}</div><p>À ton rythme, sans chronomètre.</p></>:<><p>Environ {minutes} minutes. Quel jeu choisis-tu ?</p>{[['quiz','Quiz'],['gap','Texte à trous'],['order','Remettre dans l’ordre'],['mix','Mélange surprise']].map(([mode,label])=><form className={learningPanel} action={startCourseLearning} key={mode}><input type="hidden" name="courseId" value={id}/><input type="hidden" name="mode" value={mode}/><input type="hidden" name="minutes" value={minutes}/><LearningSubmit className={learningButton}>{label}</LearningSubmit></form>)}<Link href={`/courses/${id}/revise`} className="text-moss underline">Changer la durée</Link><p className="text-sm">Le service configuré prépare les questions à partir du cours. Cette préparation peut être payante.</p></>}</div>;
}
