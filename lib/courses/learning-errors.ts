export const LEARNING_ERROR_CODES = ['INVALID_STRUCTURE','UNKNOWN_CITATION','QUOTE_MISMATCH','UNVERIFIABLE_NUMBER','NO_USABLE_BLOCKS','AUDIT_REJECTED','QUIZ_JSON_CONTRACT_INVALID','QUIZ_QUESTION_COUNT_INVALID','QUIZ_QUESTION_PROMPT_INVALID','QUIZ_CHOICE_COUNT_INVALID','QUIZ_CHOICE_ID_INVALID','QUIZ_CHOICE_ID_DUPLICATE','QUIZ_CHOICE_TEXT_INVALID','QUIZ_CORRECT_CHOICE_INVALID','QUIZ_EXPLANATION_INVALID','QUIZ_EVIDENCE_INVALID','QUIZ_EVIDENCE_DUPLICATE','QUIZ_QUESTION_DUPLICATE','QUIZ_CHOICE_DUPLICATE','QUIZ_CHOICE_LENGTH_MISMATCH','QUIZ_DISTRACTOR_CATEGORY_INVALID','QUIZ_NUMERIC_UNIT_INVALID','QUIZ_CORRECT_CHOICE_BIAS','QUIZ_AUDIT_CONTRACT_INVALID','QUIZ_AUDIT_REJECTED','TIMEOUT','SOURCE_UNUSABLE','PROVIDER_UNAVAILABLE','BUSY','NOT_FOUND','INTERNAL'] as const;
export type LearningErrorCode = typeof LEARNING_ERROR_CODES[number];
export type TokenUsage = {inputTokens?:number;outputTokens?:number};
export type LearningFailurePhase='parsing'|'contract-resolution'|'deterministic-validation'|'audit'|'persistence';
export type LearningFailureDiagnostics={failurePhase?:LearningFailurePhase;questionOrdinal?:number;questionsReceived?:number;questionsExpected?:number;choicesReceived?:number;choicesExpected?:number;distinctChoiceIds?:number;evidenceReferenceCount?:number;minChoiceLength?:number;maxChoiceLength?:number;providerFinishReason?:'incomplete'|'invalid-json'|'empty-output'|'refusal'};
export class LearningFailure extends Error {
  readonly code: LearningErrorCode;
  constructor(code:LearningErrorCode) {
    super(code==='TIMEOUT'?'Le service de préparation a dépassé le délai autorisé.':'La production ne peut pas être vérifiée.');
    this.name='LearningFailure';this.code=code;
  }
}
// WeakMap keeps provider counters out of serialized errors and accepts no content.
const usages=new WeakMap<object,TokenUsage>();
const diagnostics=new WeakMap<object,LearningFailureDiagnostics>();
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
export function safeDiagnostics(value:LearningFailureDiagnostics):LearningFailureDiagnostics {
  const result:LearningFailureDiagnostics={};
  if(['parsing','contract-resolution','deterministic-validation','audit','persistence'].includes(value.failurePhase??''))result.failurePhase=value.failurePhase;
  if(['incomplete','invalid-json','empty-output','refusal'].includes(value.providerFinishReason??''))result.providerFinishReason=value.providerFinishReason;
  for(const key of ['questionOrdinal','questionsReceived','questionsExpected','choicesReceived','choicesExpected','distinctChoiceIds','evidenceReferenceCount','minChoiceLength','maxChoiceLength'] as const)if(Number.isSafeInteger(value[key])&&value[key]!>=0&&value[key]!<=10000)result[key]=value[key];
  return result;
}
export function withDiagnostics(error:unknown,value:LearningFailureDiagnostics):LearningFailure {
  const failure=error instanceof LearningFailure?error:new LearningFailure(learningErrorCode(error));
  diagnostics.set(failure,safeDiagnostics(value));return failure;
}
export function failureDiagnostics(error:unknown):LearningFailureDiagnostics {return error instanceof Error?diagnostics.get(error)??{}:{};}
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
export const QUIZ_REJECTED_PRODUCTION_MESSAGE='Le quiz a été préparé, mais certaines questions n’ont pas pu être suffisamment vérifiées. Aucun contenu incertain n’a été affiché. Tu pourras réessayer plus tard.';
export function rejectedProductionMessage(activity?:string) {return activity==='quiz'?QUIZ_REJECTED_PRODUCTION_MESSAGE:REJECTED_PRODUCTION_MESSAGE;}
export function learningErrorCategory(error:unknown):string {
  const code=learningErrorCode(error);
  if(['INVALID_STRUCTURE','UNKNOWN_CITATION','QUOTE_MISMATCH','UNVERIFIABLE_NUMBER','NO_USABLE_BLOCKS','AUDIT_REJECTED',...LEARNING_ERROR_CODES.filter(code=>code.startsWith('QUIZ_'))].includes(code))return 'generation';
  return ({TIMEOUT:'timeout',SOURCE_UNUSABLE:'reading',PROVIDER_UNAVAILABLE:'provider',BUSY:'pending'} as Record<string,string>)[code]??'failed';
}
