import { LearningSubmit } from '@/components/learning-submit';
import { requireCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ownedCourse } from '@/lib/courses/learning-service';
import { BackToCourse, LearningPreparationError, learningButton, learningPanel } from '@/components/learning-ui';
import { startCourseLearning } from '../../learning-actions';
export default async function UnderstandCourse({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string;activity?:string}>}) {
  const {error,activity}=await searchParams;const user=await requireCurrentUser();const {id}=await params;const course=await ownedCourse(prisma,user.id,id);
  return <div className="mx-auto grid max-w-2xl gap-6"><BackToCourse id={id}/><h1 className="text-3xl font-bold">Comprendre {course.title}</h1><LearningPreparationError code={error} courseId={id} activity={activity}/><p>Comment veux-tu commencer ?</p>{[['explain','Explique-moi simplement'],['summary','Fais-moi un résumé'],['essential','Montre-moi l’essentiel'],['visual','Voir en visuel']].map(([mode,label])=><form className={learningPanel} action={startCourseLearning} key={mode}><input type="hidden" name="courseId" value={id}/><input type="hidden" name="mode" value={mode}/><LearningSubmit className={learningButton}>{label}</LearningSubmit></form>)}<p className="text-sm text-ink/65">Le service de préparation reçoit uniquement les passages de ce cours. Une préparation peut être payante ; un résultat déjà disponible est réutilisé.</p></div>;
}
