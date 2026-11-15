/* JSLH 2027 quiz-bank loader. Does not alter Arena League or Supabase.
 * The bank remains disabled until its JSON files are deployed and teacher-reviewed.
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
 const enabled=false;

 function gradeNumber(grade){
  const match=String(grade).match(/(?:^|\D)([789])(?:\D|$)/);
  if(!match) throw new Error("Unsupported grade");
  return Number(match[1]);
 }
 function getPaths(grade,subject,term){
  const g=gradeNumber(grade), folder=subjects[subject], t=Number(term);
  if(!folder || ![1,2,3].includes(t)) throw new Error("Invalid subject or term");
  if(g===7) return [base+"/grade7/catalog.json"];
  if(g===8) return [base+"/grade8/JSLH_Grade8_2027_Quiz_Bank_EXPANDED/"+folder+"/term_"+t+".json"];
  return [base+"/grade9/"+folder+"/term_"+t+".json"];
 }
 async function fetchJson(url){
  const response=await fetch(url,{credentials:"same-origin",cache:"no-store"});
  if(!response.ok) throw new Error("Quiz data unavailable: HTTP "+response.status);
  return response.json();
 }
 async function load(grade,subject,term){
  if(!enabled) return null;
  const g=gradeNumber(grade), key=[g,subject,term].join("|");
  if(cache.has(key)) return cache.get(key);
  const promise=(async()=>{
   if(!root.JSLHQuizAdapter) throw new Error("Quiz adapter is unavailable");
   let records=[];
   if(g===7){
    const catalog=await fetchJson(base+"/grade7/catalog.json");
    const slugMap={
     "Mathematics":"mathematics","Integrated Science":"integrated-science",
     "English":"english","Kiswahili":"kiswahili","Social Studies":"social-studies",
     "Agriculture":"agriculture-nutrition","Agriculture & Nutrition":"agriculture-nutrition",
     "Pre-Technical Studies":"pre-technical-studies","CRE":"cre",
     "Creative Arts and Sports":"creative-arts-sports"
    };
    const slug=slugMap[subject];
    const items=(catalog.files||[]).filter(x=>
     (x.subject===slug || x.learning_area===subject || x.learning_area===slug) &&
     Number(x.term)===Number(term)
    );
    for(const item of items){
     if(typeof item.path!=="string" ||
        !/^grade7\/question-banks\/grade7\/[a-z0-9-]+\/term[123]\/[a-z0-9-]+\/questions\.json$/.test(item.path)){
      throw new Error("Invalid Grade 7 catalogue path");
     }
     const data=await fetchJson(base+"/"+item.path);
     records.push(...(Array.isArray(data)?data:data.questions||[]));
    }
   }else{
    const folder=subjects[subject];
    const path=g===8
     ? base+"/grade8/JSLH_Grade8_2027_Quiz_Bank_EXPANDED/"+folder+"/term_"+Number(term)+".json"
     : base+"/grade9/"+folder+"/term_"+Number(term)+".json";
    const data=await fetchJson(path);
    records=Array.isArray(data)?data:data.questions||[];
   }
   if(!records.length) throw new Error("No questions found for this grade, learning area and term");
   return root.JSLHQuizAdapter.normalizeMany(records,g);
  })();
  cache.set(key,promise);
  try{return await promise;}catch(error){cache.delete(key);throw error;}
 }
 root.JSLHQuizBank=Object.freeze({load,getPaths,isEnabled:()=>enabled,clearCache:()=>cache.clear()});
})(typeof window!=="undefined"?window:globalThis);
