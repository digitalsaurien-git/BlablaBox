import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { readSourceFile } from '@/lib/sources/storage';
import { readLearningDocument } from '@/lib/courses/document-reader';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{id:string;extractionId:string}>}) {
  const user=await getCurrentUser();if(!user)return new Response(null,{status:401});const {id,extractionId}=await params;
  const e=await prisma.sourceExtraction.findFirst({where:{id:extractionId,userId:user.id,sourceAsset:{placements:{some:{userId:user.id,coursePart:{courseThemeId:id}}}}},include:{sourceAsset:true}});if(!e)return new Response(null,{status:404});
  try {const units=await readLearningDocument(await readSourceFile(e.sourceAsset.storageKey),e.sourceAsset.mimeType);const unit=units.find(u=>u.key===e.unitKey&&u.hash===e.inputHash);if(!unit?.image)throw new Error();return new Response(new Uint8Array(Buffer.from(unit.image,'base64')),{headers:{'Content-Type':unit.mime??'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}catch{return new Response(null,{status:404});}
}
