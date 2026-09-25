import type { PrismaClient } from '@prisma/client';
import { learningSchema } from './learning-contract.ts';
import { parseAudio } from './audio-contract.ts';
import { generateSegmentedStoredAudio } from '../segmented-audio-generation.ts';
import { storedAudioExists } from '../audio-storage.ts';
import { getTTSProvider } from '../providers/tts/index.ts';
import { digest, json, claim, complete } from './learning-helpers.ts';
import { ownedSession } from './learning-session.ts';
import { MSG_NOT_FOUND_CONTENT, MSG_NOT_FOUND_ACTIVITY, MSG_NOT_FOUND_AUDIO, MSG_NOT_FOUND_QUESTION, MSG_FEEDBACK_BEFORE_ANSWER } from '../messages.ts';

export async function learningAudioText(db:PrismaClient,userId:string,versionId:string,key:string,sessionId?:string) {
  const version=await db.projectVersion.findFirst({where:{id:versionId,userId}});
  if(!version)throw new Error(MSG_NOT_FOUND_CONTENT);
  const output=learningSchema.parse(version.content);
  if(key==='content' && !['quiz','gap','order','mix','homework'].includes(version.mode))return {version,text:output.blocks.map(b=>b.text).join('\n\n')};
  if(!sessionId)throw new Error(MSG_NOT_FOUND_ACTIVITY);
  const session=await ownedSession(db,userId,sessionId);
  if(session.projectVersionId!==versionId)throw new Error(MSG_NOT_FOUND_SESSION);
  const match=key.match(/^(question|feedback)-(\d+)$/);
  if(!match)throw new Error(MSG_NOT_FOUND_AUDIO);
  const index=Number(match[2]);const q=output.questions[index];
  if(!q || index>session.position || session.kind!=='revision')throw new Error(MSG_NOT_FOUND_QUESTION);
  if(match[1]==='feedback' && !session.attempts.some(a=>a.questionIndex===index))throw new Error(MSG_FEEDBACK_BEFORE_ANSWER);
  return {version,text:match[1]==='question'?[q.prompt,...q.choices].join('\n'):q.explanation};
}

export async function prepareAudio(db:PrismaClient,userId:string,versionId:string,key:string,sessionId?:string) {
  const {version,text}=await learningAudioText(db,userId,versionId,key,sessionId);
  const cacheKey=digest(JSON.stringify([text,process.env.TTS_PROVIDER,process.env.TTS_MODEL,process.env.TTS_VOICE]));
  const audio=parseAudio(version.audio);
  if(audio[key]?.hash===cacheKey && await storedAudioExists(audio[key].file))return;
  const operation=await claim(db,userId,digest(`${versionId}:${key}:${cacheKey}`),process.env.TTS_PROVIDER ?? 'disabled','tts');const started=Date.now();
  try {
    await generateSegmentedStoredAudio({script:text,provider:getTTSProvider(),publish:async publication=>{
      await db.$transaction(async tx=>{
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${versionId},0))::text`;
        const current=await tx.projectVersion.findFirst({where:{id:versionId,userId}});
        if(!current)throw new Error(MSG_NOT_FOUND_CONTENT);
        await tx.projectVersion.update({where:{id:versionId},data:{audio:json({...parseAudio(current.audio),[key]:{file:publication.manifestFileName,hash:cacheKey}})}});
        await tx.providerUsage.update({where:{id:operation.id},data:{status:'DONE',durationMs:Date.now()-started}});
      });return true;
    }});
  } catch(error) {await complete(db,operation.id,started,{},'FAILED');throw error;}
}
