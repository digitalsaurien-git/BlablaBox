import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Usage } from '../providers/llm/course-provider.ts';

export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export function splitPassages(text:string) {
  const results:Array<{position:number;start:number;end:number;text:string}>=[];
  let start=0;
  while(start<text.length) {
    let end=Math.min(start+1400,text.length);
    if(end<text.length) {const boundary=text.lastIndexOf(' ',end);if(boundary>start)end=boundary;}
    const segment=text.slice(start,end);
    if(segment.trim())results.push({position:results.length,start,end,text:segment});
    start=end;
    while(text[start]===' ') start++;
  }
  return results;
}

export async function claim(db:PrismaClient,userId:string,operationKey:string,provider:string,operation:string) {
  try { return await db.providerUsage.create({data:{userId,operationKey,provider:provider.slice(0,30),operation,status:'PENDING'}}); }
  catch(error) {
    if(!(error && typeof error==='object' && 'code' in error && error.code==='P2002')) throw error;
    const changed=await db.providerUsage.updateMany({where:{userId,operationKey,status:'FAILED'},data:{status:'PENDING',createdAt:new Date()}});
    if(changed.count!==1)throw new Error('Cette préparation est déjà en cours ou terminée. Recharge la page. Une opération interrompue doit être vérifiée avant une nouvelle tentative.');
    return db.providerUsage.findUniqueOrThrow({where:{userId_operationKey:{userId,operationKey}}});
  }
}

export async function complete(db:Pick<PrismaClient,'providerUsage'>,id:string,started:number,usage:Usage={},status='DONE') {
  const safeCount=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<2147483647?Number(n):null;
  await db.providerUsage.update({where:{id},data:{status,durationMs:Math.min(Date.now()-started,2147483647),inputTokens:safeCount(usage.inputTokens),outputTokens:safeCount(usage.outputTokens)}});
}
