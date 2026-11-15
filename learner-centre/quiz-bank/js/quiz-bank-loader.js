/* JSLH 2027 quiz-bank loader. Does not alter Arena League or Supabase.
 * The 2027 bank is a review draft. Disabled by default until teacher QA.
 * Deploy question JSON files under /learner-centre/quiz-bank/data/.
 */
(function(root){
 "use strict";
 const base="/learner-centre/quiz-bank/data";
 const subjects={
  "Mathematics":"Mathematics","Integrated Science":"Integrated_Science",
  "English":"English","Kiswahili":"Kiswahili","Social Studies":"Social_Studies",
  "Agriculture":"Agriculture","Pre-Technical Studies":"Pre-Technical_Studies",
  "CRE":"CRE","Creative Arts and Sports":"Creative_Arts_and_Sports"
 };
 const cache=new Map();
 const enabled=false; // Switch only after the question bank is deployed and teacher-reviewed.

 function gradeNumber(grade){
  const match=String(grade).match(/(?:^|\\D)([789])(?:\\D|$)/);
  if(!match) throw new Error("Unsupported grade");
  return Number(match[1]);
 }
 function getPaths(grade,subject,term){
  const g=gradeNumber(grade), folder=subjects[subject], t=Number(term);
  if(!folder || ![1,2,3].includes(t)) throw new Error("Invalid subject or term");
  if(g===7) return [base+"/grade7/catalog.json"];
  if(g===8) return [base+"/grade8/"+folder+"/term_"+t+".json"];
  return [base+"/grade9/"+folder+"/term_"+t+".json"];
 }
 async function fetchJson(url){
  const response=await fetch(url,{credentials:"same-origin",cache:"no-store"});
  if(!response.ok) throw new Error("Quiz data unavailable: HTTP "+response.status);
  return response.json();
 }
 async function load(grade,subject,term){
  if(!enabled) return null;
  const key=[grade,subject,term].join("|");
  if(cache.has(key)) return cache.get(key);
  const promise=(async()=>{
   if(!root.JSLHQuizAdapter) throw new Error("Quiz adapter is unavailable");
   const paths=getPaths(grade,subject,term);
   let records=[];
   if(gradeNumber(grade)===7){
    const catalog=await fetchJson(paths[0]);
    const slug=subject.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    const items=(catalog.files||[]).filter(x=>x.subject===slug && Number(x.term)===Number(term));
    for(const item of items){
     if(typeof item.path!=="string" || !/^grade7\\/question-banks\\/grade7\\/[a-z0-9-]+\\/term[123]\\/[a-z0-9-]+\\/questions\\.json$/.test(item.path)){
      throw new Error("Invalid grade 7 catalog path");
     }
     const data=await fetchJson(base+"/"+item.path);
     records.push(...(Array.isArray(data)?data:data.questions||[]));
    }
   } else {
    const data=await fetchJson(paths[0]);
    records=Array.isArray(data)?data:data.questions||[];
   }
   return root.JSLHQuizAdapter.normalizeMany(records,gradeNumber(grade));
  })();
  cache.set(key,promise);
  try{return await promise;}catch(error){cache.delete(key);throw error;}
 }
 root.JSLHQuizBank=Object.freeze({load,getPaths,isEnabled:()=>enabled,clearCache:()=>cache.clear()});
})(typeof window!=="undefined"?window:globalThis);
