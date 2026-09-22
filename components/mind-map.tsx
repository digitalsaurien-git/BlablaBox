import { SourceRefs } from './learning-ui';
import type { LearningOutput } from '@/lib/courses/learning-contract';

const colors=['border-sky-400 bg-sky-50','border-amber-400 bg-amber-50','border-emerald-400 bg-emerald-50','border-violet-400 bg-violet-50','border-rose-400 bg-rose-50','border-cyan-400 bg-cyan-50'];

export function MindMap({courseId,visual}:{courseId:string;visual:NonNullable<LearningOutput['visual']>}) {
  const centralIndex=visual.items.findIndex(item=>item.parent===-1);const central=visual.items[centralIndex];
  const branches=visual.items.map((item,index)=>({item,index})).filter(({item})=>item.parent===centralIndex);
  return <section className="grid gap-6" aria-label="Carte mentale">
    <div className="mx-auto max-w-sm rounded-full border-4 border-moss bg-mist px-6 py-5 text-center shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-ink/60">Sujet central</p><h2 className="text-xl font-bold">{central.label}</h2><SourceRefs refs={central.citations} courseId={courseId}/></div>
    <div className="grid gap-4 sm:grid-cols-2">{branches.map(({item,index},branchIndex)=>{const leaves=visual.items.filter(leaf=>leaf.parent===index);return <section key={index} className={`grid gap-3 rounded-2xl border-2 p-4 shadow-sm ${colors[branchIndex%colors.length]}`}><h3 className="text-lg font-bold">{item.label}</h3><SourceRefs refs={item.citations} courseId={courseId}/><ul className="grid gap-2" aria-label={`Éléments de ${item.label}`}>{leaves.map((leaf,leafIndex)=><li key={leafIndex} className="rounded-xl bg-white/80 p-3"><p>{leaf.label}</p>{leaf.detail?<p className="mt-1 text-sm text-ink/75">{leaf.detail}</p>:null}<SourceRefs refs={leaf.citations} courseId={courseId}/></li>)}</ul></section>;})}</div>
    <details className="rounded-xl border p-4 text-sm"><summary className="cursor-pointer font-semibold">Version structurée de la carte</summary><ol className="mt-3 grid gap-3">{branches.map(({item,index})=><li key={index}><strong>{item.label}</strong><ul className="list-disc pl-5">{visual.items.filter(leaf=>leaf.parent===index).map((leaf,leafIndex)=><li key={leafIndex}>{leaf.label}</li>)}</ul></li>)}</ol></details>
  </section>;
}
