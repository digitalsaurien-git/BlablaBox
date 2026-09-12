export const LEARNING_ERROR_CODES = ['INVALID_STRUCTURE','UNKNOWN_CITATION','QUOTE_MISMATCH','UNVERIFIABLE_NUMBER','NO_USABLE_BLOCKS','AUDIT_REJECTED','TIMEOUT','SOURCE_UNUSABLE','PROVIDER_UNAVAILABLE','BUSY','NOT_FOUND','INTERNAL'] as const;
export type LearningErrorCode = typeof LEARNING_ERROR_CODES[number];
export type TokenUsage = {inputTokens?:number;outputTokens?:number};
export class LearningFailure extends Error {
  readonly code: LearningErrorCode;
  constructor(code:LearningErrorCode) {
    super(code==='TIMEOUT'?'Le service de préparation a dépassé le délai autorisé.':'La production ne peut pas être vérifiée.');
    this.name='LearningFailure';this.code=code;
  }
}
// WeakMap keeps provider counters out of serialized errors and accepts no content.
const usages=new WeakMap<object,TokenUsage>();
export function safeUsage(value:TokenUsage):TokenUsage {
  const result:TokenUsage={};
  for(const key of ['inputTokens','outputTokens'] as const) if(Number.isSafeInteger(value[key])&&value[key]!>=0&&value[key]!<2147483647)result[key]=value[key];
  return result;
}
export function withUsage(error:unknown,usage:TokenUsage):Error {
  const failure=error instanceof LearningFailure?error:new LearningFailure(learningErrorCode(error));
  usages.set(failure,safeUsage(usage));return failure;
}
export function failureUsage(error:unknown):TokenUsage {return error instanceof Error?usages.get(error)??{}:{};}
export function learningErrorCode(error:unknown):LearningErrorCode {
  if(error instanceof LearningFailure)return error.code;
  const message=error instanceof Error?error.message:'';
  if(message==='Le service de préparation a dépassé le délai autorisé.')return 'TIMEOUT';
  if(message==='Aucun passage vérifié n’est encore disponible pour travailler ce cours.')return 'SOURCE_UNUSABLE';
  if(/configur/.test(message))return 'PROVIDER_UNAVAILABLE';
  if(/déjà|interrompue/.test(message))return 'BUSY';
  if(/introuvable/.test(message))return 'NOT_FOUND';
  return 'INTERNAL';
}
export const REJECTED_PRODUCTION_MESSAGE='L’explication a été préparée, mais elle n’a pas pu être suffisamment vérifiée. Aucun contenu incertain n’a été affiché. Tu pourras réessayer plus tard.';
export function learningErrorCategory(error:unknown):string {
  const code=learningErrorCode(error);
  if(['INVALID_STRUCTURE','UNKNOWN_CITATION','QUOTE_MISMATCH','UNVERIFIABLE_NUMBER','NO_USABLE_BLOCKS','AUDIT_REJECTED'].includes(code))return 'generation';
  return ({TIMEOUT:'timeout',SOURCE_UNUSABLE:'reading',PROVIDER_UNAVAILABLE:'provider',BUSY:'pending'} as Record<string,string>)[code]??'failed';
}
