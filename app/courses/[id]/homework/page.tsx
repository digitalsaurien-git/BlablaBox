import { LearningSubmit } from '@/components/learning-submit';
import { requireCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ownedCourse } from '@/lib/courses/learning-service';
import { BackToCourse, LearningPreparationError, learningButton, learningPanel } from '@/components/learning-ui';
import { startCourseLearning } from '../../learning-actions';
export default async function HomeworkCourse({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string}>}) {
  const {error}=await searchParams;const user=await requireCurrentUser();const {id}=await params;await ownedCourse(prisma,user.id,id);
  return <div className="mx-auto grid max-w-2xl gap-6"><BackToCourse id={id}/><h1 className="text-3xl font-bold">J’ai un devoir</h1><LearningPreparationError code={error} courseId={id}/><form action={startCourseLearning} className={learningPanel}><input type="hidden" name="courseId" value={id}/><input type="hidden" name="mode" value="homework"/><label className="grid gap-2"><span>Copie ici la consigne du professeur</span><textarea name="instruction" required maxLength={3000} rows={6} className="w-full rounded-xl border p-3"/></label><p>Nous chercherons ensemble comment commencer. Tu écriras ta propre réponse.</p><LearningSubmit className={learningButton}>M’aider à commencer</LearningSubmit><p className="text-sm text-ink/65">Le service configuré reçoit la consigne et les passages utiles du cours. Cette préparation peut être payante.</p></form></div>;
}
