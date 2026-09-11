import { notFound } from 'next/navigation';
import { requireCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { BackToCourse, learningButton, learningPanel } from '@/components/learning-ui';
import { confirmCourseReading } from '../../../learning-actions';
export default async function ReadingPage({params}:{params:Promise<{id:string;extractionId:string}>}) {
  const user=await requireCurrentUser();const {id,extractionId}=await params;
  const e=await prisma.sourceExtraction.findFirst({where:{id:extractionId,userId:user.id,method:'ocr',sourceAsset:{placements:{some:{userId:user.id,coursePart:{courseThemeId:id}}}}}});if(!e)notFound();
  return <div className="mx-auto grid max-w-3xl gap-6"><BackToCourse id={id}/><h1 className="text-2xl font-bold">Vérifier la lecture</h1><p>Compare le texte à l’image. Vérifie surtout les nombres, les dates et les signes. Si tu hésites, garde le passage comme incertain.</p><img src={`/api/courses/${id}/reading/${e.id}`} alt={`Original : ${e.unitKey}`} className="w-full rounded-xl border"/><form action={confirmCourseReading} className={learningPanel}><input type="hidden" name="courseId" value={id}/><input type="hidden" name="extractionId" value={e.id}/><label className="grid gap-2"><span>Texte reconnu</span><textarea name="text" rows={12} maxLength={20000} required defaultValue={e.text} className="w-full rounded-xl border p-3"/></label><label className="flex items-start gap-3"><input type="checkbox" required name="confirmed" value="yes" className="mt-1 size-5"/><span>J’ai comparé ce texte à l’original et confirmé sa lecture. Il pourra être utilisé pour les exercices.</span></label><button className={learningButton}>Confirmer cette lecture</button></form></div>;
}
