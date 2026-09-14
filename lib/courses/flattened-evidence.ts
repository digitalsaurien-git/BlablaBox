// Read-only recognition of explicit, single-cell pairs in flattened PDF text.
// Offsets always refer to the original string; accent folding is detection only.
export const foldEvidence=(text:string)=>text.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('fr').replace(/\s+/g,' ').trim();
const escapePattern=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const word="[\\p{L}\\p{M}][\\p{L}\\p{M}’'-]{1,39}";
const measure="\\d+(?:[.,]\\d+)?\\s*(?:Ma|Ga|ka|ans?|km|cm|mm|kg|m|g|s|h|%|°C)(?![\\p{L}\\p{M}])|(?:1\\d{3}|20\\d{2})(?!\\d)";
const label="(?:esp[eè]ces?|noms?|termes?|notions?)";
const valueLabel="(?:dates?|valeurs?)";
const tableStart=new RegExp(`(?<![\\p{L}\\p{M}])${label}\\s*:?\\s+`,'giu');
const pair=new RegExp(`^${label}\\s*:?\\s+(${word})\\s+${valueLabel}\\s*:?\\s+(${measure})\\s*[.;]?$`,'iu');
const compact=new RegExp(`^([\\p{Lu}][\\p{L}\\p{M}’'-]{1,39})\\s+(${measure})\\s*[.;]?$`,'u');
const excluded=new Set(['espece','especes','nom','noms','terme','notion','date','dates','valeur','valeurs','quel','quelle','quels','quelles']);
export type ExplicitPair={term:string;value:string};

export function flattenedPair(text:string):ExplicitPair|undefined {
  const result=pair.exec(text)||compact.exec(text);
  if(!result||excluded.has(foldEvidence(result[1])))return;
  return {term:result[1],value:result[2]};
}

export function explicitDateRelation(text:string,name:string,date:string) {
  // Co-occurrence alone does not establish that this person's date is the value.
  const link="(?:date de|est date de|a vecu (?:il y a|vers|en)|vivait (?:il y a|vers|en)|est ne en|apparait (?:vers|en|il y a))";
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapePattern(foldEvidence(name))}\\s+${link}\\s+${escapePattern(foldEvidence(date))}(?![\\p{L}\\p{N}])`,'u').test(foldEvidence(text));
}

export function flattenedRows(text:string):Array<{start:number;end:number}> {
  const rows:Array<{start:number;end:number}>=[];
  // No coordinate-changing rewrite, no guesses for column-major lists. A row
  // must contain exactly one term and one value with an explicit boundary.
  const starts=[...text.matchAll(tableStart)].map(match=>match.index);
  for(let i=0;i<starts.length;i++) {
    const start=starts[i];
    const tail=text.slice(start,Math.min(text.length,start+400,starts[i+1]??text.length));
    const boundary=tail.search(/[!?;\r\n]|\.(?=\s|$)/u);
    let end=start+(boundary<0?tail.length:boundary+(tail[boundary]==='.'||tail[boundary]===';'?1:0));
    if(boundary>=0&&tail[boundary]==='?')continue;
    while(end>start&&/\s/u.test(text[end-1]))end--;
    const prefix=foldEvidence(text.slice(0,start).split(/[.!?;\r\n]/u).at(-1)??'');
    // A proposed option in a question is not an answer. A completed table after
    // a competency/instruction label is an explicit response, unlike an option.
    if(/\b(?:quel\w*|quand|choisi\w*|complete\w*|trouve\w*|est-ce|vrai|faux)\b/u.test(prefix)&&!/(?:competence|consigne).*tableau/u.test(prefix))continue;
    if(flattenedPair(text.slice(start,end)))rows.push({start,end});
  }
  return rows;
}

export function ambiguousTable(text:string) {
  return new RegExp(`${label}\\s+.+\\s+${valueLabel}\\s+`,'iu').test(text)&&!flattenedPair(text);
}
