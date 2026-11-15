/* JSLH 2027 quiz-bank loader. Development branch integration. */
(function(root){
 "use strict";
 const base="/learner-centre/quiz-bank/data";
 const subjects={
  "Mathematics":"Mathematics","Integrated Science":"Integrated_Science",
  "English":"English","Kiswahili":"Kiswahili","Social Studies":"Social_Studies",
  "Agriculture":"Agriculture","Pre-Technical Studies":"Pre-Technical_Studies",
  "CRE":"CRE","Creative Arts and Sports":"Creative_Arts_and_Sports"
 };
 const grade7Slugs={
  "Mathematics":"mathematics","Integrated Science":"integrated-science",
  "English":"english","Kiswahili":"kiswahili","Social Studies":"social-studies",
  "Agriculture":"agriculture-nutrition","Pre-Technical Studies":"pre-technical-studies",
  "CRE":"cre","Creative Arts and Sports":"creative-arts-sports"
 };
 const cache=new Map();
 const enabled=true;
 function gradeNumber(grade){
  const match=String(grade).match(/(?:^|\D)([789])(?:\D|$)/);
  if(!match) throw new Error("Unsupported grade");
  return Number(match[1]);
 }
 function getPaths(grade,subject,term){
  const g=gradeNumber(grade),folder=subjects[subject],t=Number(term);
  if(!folder||![1,2,3].includes(t)) throw new Error("Invalid learning area or term");
  if(g===7)return [base+"/grade7/catalog.json"];
  return [base+"/grade"+g+"/"+folder+"/term_"+t+".json"];
 }
 async function fetchJson(url){
  const response=await fetch(url,{credentials:"same-origin",cache:"no-store"});
  if(!response.ok)throw new Error("Quiz data unavailable: HTTP "+response.status+" ("+url+")");
  return response.json();
 }
 async function load(grade,subject,term){
  const g=gradeNumber(grade),t=Number(term),key=[g,subject,t].join("|");
  if(cache.has(key))return cache.get(key);
  const promise=(async()=>{
   if(!root.JSLHQuizAdapter)throw new Error("Quiz adapter is unavailable");
   let records=[];
   if(g===7){
    const catalog=await fetchJson(base+"/grade7/catalog.json");
    const slug=grade7Slugs[subject];
    const items=(catalog.files||[]).filter(x=>x.subject===slug&&Number(x.term)===t);
    if(!items.length)throw new Error("No Grade 7 catalogue entries for "+subject+" Term "+t);
    for(const item of items){
     const prefix="grade7/question-banks/grade7/";
     if(typeof item.path!=="string"||!item.path.startsWith(prefix))throw new Error("Invalid Grade 7 catalogue path");
     const relative=item.path.slice(prefix.length);
     if(relative.includes("..")||relative.startsWith("/"))throw new Error("Unsafe Grade 7 catalogue path");
     const data=await fetchJson(base+"/grade7/"+relative);
     records.push(...(Array.isArray(data)?data:data.questions||[]));
    }
   }else{
    const data=await fetchJson(base+"/grade"+g+"/"+subjects[subject]+"/term_"+t+".json");
    records=Array.isArray(data)?data:data.questions||[];
   }
   if(!records.length)throw new Error("No questions found for this grade, learning area and term");
   return root.JSLHQuizAdapter.normalizeMany(records,g);
  })();
  cache.set(key,promise);
  try{return await promise;}catch(error){cache.delete(key);throw error;}
 }
 root.JSLHQuizBank=Object.freeze({load,getPaths,isEnabled:()=>enabled,clearCache:()=>cache.clear()});
})(typeof window!=="undefined"?window:globalThis);
