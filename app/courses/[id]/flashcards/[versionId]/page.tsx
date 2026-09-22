import { notFound } from 'next/navigation';
import { requireCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { learningSchema } from '@/lib/courses/learning-contract';
import { BackToCourse } from '@/components/learning-ui';
import { FlashcardDeck } from '@/components/flashcard-deck';

export default async function FlashcardsPage({params}:{params:Promise<{id:string;versionId:string}>}) {
  const user=await requireCurrentUser();const {id,versionId}=await params;
  const version=await prisma.projectVersion.findFirst({where:{id:versionId,userId:user.id,courseThemeId:id,mode:'flashcards'}});if(!version)notFound();
  const output=learningSchema.parse(version.content);
  return <main className="mx-auto grid max-w-xl min-w-0 gap-6 px-4 py-6 sm:px-0"><BackToCourse id={id}/><header><h1 className="text-3xl font-bold">{output.title}</h1><p className="mt-2">Retourne chaque carte à ton rythme.</p></header><FlashcardDeck courseId={id} cards={output.blocks.map(block=>({front:block.title??'Repère du cours',back:block.text,refs:block.citations}))}/></main>;
}
