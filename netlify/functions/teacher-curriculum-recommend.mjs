export default async (request) => {
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
  if(request.method!=="POST")return reply(405,{error:"Only POST requests are allowed."});
  const authHeader=request.headers.get("authorization")||"";
  const token=authHeader.startsWith("Bearer ")?authHeader.slice(7):"";
  if(!token)return reply(401,{error:"Please sign in first."});
  const supabaseUrl=Netlify.env.get("SUPABASE_URL")||"https://hqbqhnhgrgfxpedjzmnm.supabase.co";
  const supabaseKey=Netlify.env.get("SUPABASE_PUBLISHABLE_KEY")||Netlify.env.get("SUPABASE_ANON_KEY")||"sb_publishable_uaOcRVaIwnvRl_wZhMhJ-Q_DhrqZyS_";
  const openaiKey=Netlify.env.get("OPENAI_API_KEY");
  if(!openaiKey)return reply(503,{error:"AI outcome selection is not configured. Add OPENAI_API_KEY in Netlify."});
  try{
    const auth=await fetch(supabaseUrl+"/auth/v1/user",{headers:{apikey:supabaseKey,Authorization:"Bearer "+token}});
    if(!auth.ok)return reply(401,{error:"Your session has expired. Sign in again."});
    const user=await auth.json();if(!user?.id)return reply(401,{error:"A valid teacher sign-in is required."});
    const input=await request.json();
    const outcomes=Array.isArray(input.outcomes)?input.outcomes.slice(0,300):[];
    if(!outcomes.length)return reply(400,{error:"Load curriculum outcomes before asking AI to select them."});
    const topic=String(input.topic||"").slice(0,1000),strand=String(input.strand||"").slice(0,500);
    if(!topic.trim())return reply(400,{error:"Enter the lesson topic or sub-strand first."});
    const safe=outcomes.map((o,index)=>({index,strand:String(o.strand||""),subStrand:String(o.subStrand||""),text:String(o.text||"").slice(0,2500)}));
    const prompt=`Select the most relevant specific learning outcomes for a teacher's lesson, using ONLY the candidate outcomes supplied. Do not rewrite, modify or create outcomes. Select 1 to 8 outcomes that are directly relevant, prioritising grade-level fit and coverage of the stated topic. If fewer than 8 are relevant, return fewer. If none are relevant, return an empty list. Return JSON only: {"selectedIndexes":[integer,...],"reason":"short explanation"}.
Grade: ${String(input.grade||"")}
Learning area: ${String(input.learningArea||"")}
Strand: ${strand}
Lesson topic/sub-strand: ${topic}
Candidate outcomes:
${JSON.stringify(safe)}`;
    const ai=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+openaiKey},body:JSON.stringify({model:"gpt-4.1-mini",messages:[{role:"system",content:"You are a curriculum alignment assistant. Choose only the supplied outcome indexes. Never invent or paraphrase curriculum outcomes. Return valid JSON only."},{role:"user",content:prompt}],temperature:0,max_tokens:1200,response_format:{type:"json_object"}})});
    const result=await ai.json();
    if(!ai.ok){console.error("Outcome recommendation failed:",result?.error?.message||ai.status);return reply(502,{error:"AI could not select outcomes. Please retry."});}
    let parsed;try{parsed=JSON.parse(result?.choices?.[0]?.message?.content||"{}");}catch{return reply(502,{error:"AI returned an invalid selection. Please retry."});}
    const selectedIndexes=[...new Set((Array.isArray(parsed.selectedIndexes)?parsed.selectedIndexes:[]).filter(i=>Number.isInteger(i)&&i>=0&&i<safe.length))].slice(0,8);
    return reply(200,{success:true,selectedIndexes,reason:String(parsed.reason||"").slice(0,500)});
  }catch(error){console.error("Outcome recommendation error:",error?.message||error);return reply(500,{error:"Could not select curriculum outcomes. Please retry."});}
};
