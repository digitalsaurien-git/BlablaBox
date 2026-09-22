import { notFound } from 'next/navigation';
import { requireCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { learningSchema } from '@/lib/courses/learning-contract';
import { BackToCourse } from '@/components/learning-ui';
import { MindMap } from '@/components/mind-map';

export default async function CourseMindMap({params}:{params:Promise<{id:string;versionId:string}>}) {
  const user=await requireCurrentUser();const {id,versionId}=await params;
  const version=await prisma.projectVersion.findFirst({where:{id:versionId,userId:user.id,courseThemeId:id,mode:'mindmap'}});if(!version)notFound();
  const output=learningSchema.parse(version.content);if(output.visual?.type!=='mindmap')notFound();
  return <main className="mx-auto grid max-w-4xl min-w-0 gap-6 break-words pb-10"><BackToCourse id={id}/><header><h1 className="text-3xl font-bold">{output.title}</h1><p className="mt-2">Pars du centre, puis explore une branche à la fois.</p></header><MindMap courseId={id} visual={output.visual}/></main>;
}
