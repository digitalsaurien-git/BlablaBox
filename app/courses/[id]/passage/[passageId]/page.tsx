import { notFound } from 'next/navigation';
import { requireCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { BackToCourse, learningPanel } from '@/components/learning-ui';
export default async function PassagePage({params}:{params:Promise<{id:string;passageId:string}>}) {
  const user=await requireCurrentUser();const {id,passageId}=await params;
  const p=await prisma.sourcePassage.findFirst({where:{id:passageId,userId:user.id,OR:[{extraction:{sourceAsset:{placements:{some:{userId:user.id,coursePart:{courseThemeId:id}}}}}},{citations:{some:{userId:user.id,projectVersion:{courseThemeId:id}}}}]},include:{extraction:{include:{sourceAsset:{include:{imports:{take:1,orderBy:{createdAt:'asc'}}}}}}}});if(!p)notFound();
  return <div className="mx-auto grid max-w-2xl gap-6"><BackToCourse id={id}/><h1 className="text-2xl font-bold">Le passage utilisé</h1><section className={learningPanel}><p>{p.extraction.sourceAsset.imports[0]?.originalFileName} · {p.extraction.unitKey}</p><p>{p.extraction.method==='native'?'Texte lu directement':p.extraction.method==='reviewed'?'Texte reconnu puis vérifié':'Texte reconnu dans une image'} · {p.quality==='verified'?'lecture vérifiée':'lecture incertaine'}</p><blockquote className="whitespace-pre-wrap leading-7">{p.text}</blockquote><a className="text-moss underline" href={`/api/sources/${p.extraction.sourceAssetId}/download`}>Télécharger l’original</a></section></div>;
}
