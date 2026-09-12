import { notFound } from 'next/navigation';
import { requireCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { learningSchema } from '@/lib/courses/learning-contract';
import { passageSnapshot, ownedCourse } from '@/lib/courses/learning-service';
import { BackToCourse, CourseVisual, LearningAudio, LearningBlocks, LearningError } from '@/components/learning-ui';
export default async function CourseContent({params,searchParams}:{params:Promise<{id:string;versionId:string}>;searchParams:Promise<{error?:string}>}) {
  const user=await requireCurrentUser();const {id,versionId}=await params;
  const version=await prisma.projectVersion.findFirst({where:{id:versionId,userId:user.id,courseThemeId:id,mode:{in:['explain','summary','essential','visual']}}});if(!version)notFound();
  const course=await ownedCourse(prisma,user.id,id);const output=learningSchema.parse(version.content);
  const omissionNotice=output.elementsOmitted?<p role="status" className="rounded-xl bg-mist p-3 text-sm">Voici les idées que ton cours permet d’expliquer avec confiance. Certains points ont été laissés de côté.</p>:null;
  return <div className="mx-auto grid max-w-3xl min-w-0 gap-6 break-words"><BackToCourse id={id}/><h1 className="text-3xl font-bold">{output.title}</h1><LearningError code={(await searchParams).error}/>{passageSnapshot(course).fingerprint!==version.sourceFingerprint?<p role="status">Cette réponse utilise une lecture précédente du cours. Ses passages restent consultables. Reviens au cours pour préparer une nouvelle réponse.</p>:null}{omissionNotice}<nav className="flex gap-4" aria-label="Lire ou écouter"><a href="#lecture" className="rounded-xl border px-5 py-3 font-bold">Lire</a><a href="#ecoute" className="rounded-xl border px-5 py-3 font-bold">Écouter</a></nav><div id="lecture"><LearningBlocks blocks={output.blocks} courseId={id}/></div>{output.visual?<CourseVisual visual={output.visual} courseId={id}/>:null}<div id="ecoute"><LearningAudio courseId={id} versionId={version.id} audio={version.audio} audioKey="content"/></div></div>;
}
