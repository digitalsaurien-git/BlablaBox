import { quizContext } from '../../lib/courses/quiz-contract.ts';

// Entirely synthetic, short lessons; never copied from a user's document.
export function quizFixture(subject='Histoire-géographie') {
  const rows=subject==='Mathématiques'?[
    ['Le périmètre du carré mesure 12 cm.','Combien mesure le périmètre du carré ?','12 cm','10 cm','14 cm'],
    ['Le triangle possède 3 côtés.','Combien de côtés possède le triangle ?','3','4','5'],
    ['Le produit de deux par trois vaut 6.','Que vaut le produit de deux par trois ?','6','5','8'],
    ['La somme de quatre et cinq vaut 9.','Que vaut la somme de quatre et cinq ?','9','8','10'],
  ]:subject==='Français'?[
    ['Le mot courir est un infinitif.','Quelle est la forme du mot courir ?','infinitif','participe','impératif'],
    ['Le mot rapidement est un adverbe.','Quelle est la nature du mot rapidement ?','adverbe','adjectif','pronom'],
    ['Le mot maison est un nom.','Quelle est la nature du mot maison ?','nom','verbe','pronom'],
    ['Le mot bleu est un adjectif.','Quelle est la nature du mot bleu ?','adjectif','adverbe','pronom'],
  ]:[
    ['Le groupe étudié vit en Afrique de l’Est et du Sud.','Dans quelles régions d’Afrique vit le groupe étudié ?','Afrique de l’Est et du Sud','Afrique de l’Ouest','Afrique du Nord'],
    ['Le fossile présenté date de 7 Ma.','De quand date le fossile présenté ?','7 Ma','5 Ma','9 Ma'],
    ['La cité synthétique est fondée en 1900.','Quand la cité synthétique est-elle fondée ?','1900','1910','1920'],
    ['Le personnage étudié se nomme Amara.','Comment se nomme le personnage étudié ?','Amara','Nadia','Leila'],
  ];
  const passages=rows.map(([text],i)=>({id:`synthetic-${subject}-${i}`,text,quality:'verified',label:'Synthétique',method:'native'}));
  const plan=quizContext(passages,5,subject);
  const raw={questions:rows.map(([explanation,prompt,correct,...wrong],i)=>{
    const choices=[...wrong];choices.splice(i%3,0,correct);
    return {prompt,choices:choices.map((text,j)=>({id:['a','b','c'][j],text})),correctChoiceId:['a','b','c'][i%3],explanation,segmentIds:[plan.context.segments.find(s=>s.text===explanation).id]};
  })};
  const audit={decisions:rows.map((_,index)=>({index,supported:true,unambiguous:true,plausible:true}))};
  return {passages,raw,audit,plan,input:{mode:'quiz',minutes:5,subject,passages}};
}
