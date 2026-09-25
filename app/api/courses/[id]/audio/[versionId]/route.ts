import { readFile } from 'node:fs/promises';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { learningAudioText } from '@/lib/courses/learning-service';
import { getStoredAudioPlayback, resolveStoredAudioPath } from '@/lib/audio-storage';
import { parseAudio } from '@/lib/courses/audio-contract';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string;versionId:string}>}) {
  const user=await getCurrentUser();if(!user)return new Response(null,{status:401});const {id,versionId}=await params;const url=new URL(request.url);
  try {
    const key=url.searchParams.get('key')??'';const {version}=await learningAudioText(prisma,user.id,versionId,key,url.searchParams.get('session')??undefined);
    if(version.courseThemeId!==id)throw new Error();const ref=parseAudio(version.audio)[key];if(!ref)throw new Error();
    const playback=await getStoredAudioPlayback(ref.file);const index=Number(url.searchParams.get('segment')??0);if(!Number.isInteger(index)||index<0||!playback?.segments[index])throw new Error();
    const bytes=await readFile(resolveStoredAudioPath(playback.segments[index].fileName));
    return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'audio/mpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`${url.searchParams.get('download')==='1'?'attachment':'inline'}; filename="cours-${index+1}.mp3"`}});
  } catch{return new Response(null,{status:404});}
}
