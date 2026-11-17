// Authenticated AI quiz generation against the server-verified QLA curriculum register.
const headers={"Content-Type":"application/json"};
const reply=(statusCode,body)=>({statusCode,headers,body:JSON.stringify(body)});
exports.handler=async(event)=>{
 if(event.httpMethod!=="POST")return reply(405,{error:"Method not allowed."});
 const apiKey=process.env.OPENAI_API_KEY,supabaseUrl=process.env.SUPABASE_URL,supabaseAnonKey=process.env.SUPABASE_ANON_KEY;
 if(!apiKey||!supabaseUrl||!supabaseAnonKey)return reply(503,{error:"AI quiz generation is not configured. Check the server environment variables."});
 const token=(event.headers.authorization||event.headers.Authorization||"").replace(/^Bearer\\s+/i,"");
 if(!token)return reply(401,{error:"Sign in before creating an AI quiz."});
 let input;try{input=JSON.parse(event.body||"{}");}catch{return reply(400,{error:"Invalid request body."});}
 for(const k of ["grade","learningArea","academicYear","term","strand","subStrand"])if(!String(input[k]||"").trim())return reply(400,{error:"Select "+k+" from the verified curriculum register."});
 if(!Array.from({length:12},(_,i)=>"Grade "+(i+1)).includes(input.grade))return reply(400,{error:"Choose a grade from 1 to 12."});
 const count=Math.max(5,Math.min(30,Number(input.questionCount)||20));
 const difficulty=["Easy","Medium","Hard","Mixed"].includes(input.difficulty)?input.difficulty:"Mixed";\n const format=input.questionFormat==="mcq"?"mcq":"mixed";
 try{
  const auth=await fetch(supabaseUrl+"/auth/v1/user",{headers:{apikey:supabaseAnonKey,Authorization:"Bearer "+token}});
  if(!auth.ok)return reply(401,{error:"Your session has expired. Sign in again."});
  const user=await auth.json();
  const params=new URLSearchParams({select:"id,grade,learning_area,academic_year,term,strand,sub_strand,learning_outcomes,curriculum_notes,source_reference",grade:"eq."+input.grade,learning_area:"eq."+input.learningArea,academic_year:"eq."+String(input.academicYear),strand:"eq."+input.strand,sub_strand:"eq."+input.subStrand,is_active:"eq.true"});
  if(input.term!=="Full Year")params.set("term","eq."+input.term);
  const topicRes=await fetch(supabaseUrl+"/rest/v1/qla_curriculum_topics?"+params.toString(),{headers:{apikey:supabaseAnonKey,Authorization:"Bearer "+token}});
  if(!topicRes.ok)return reply(502,{error:"Could not verify the curriculum selection."});
  const topics=await topicRes.json();if(!topics.length)return reply(400,{error:"That exact grade, learning area, strand and sub-strand is not in the verified curriculum register yet."});
  const outcomes=topics.map(t=>t.learning_outcomes).filter(Boolean).join("\\n").slice(0,14000);
  const notes=topics.map(t=>t.curriculum_notes).filter(Boolean).join("\\n").slice(0,18000);
  if(!outcomes||!notes)return reply(400,{error:"This curriculum entry needs verified outcomes and teaching notes before a quiz can be generated."});
  const source=topics.map(t=>t.source_reference).filter(Boolean).join("; ");
  const schema={type:"object",additionalProperties:false,required:["questions"],properties:{questions:{type:"array",minItems:count,maxItems:count,items:{type:"object",additionalProperties:false,required:["type","question","options","correct_index","accepted_answers","explanation"],properties:{type:{type:"string",enum:["mcq","tf","typed"]},question:{type:"string"},options:{type:"array",items:{type:"string"},maxItems:4},correct_index:{type:["integer","null"],minimum:0,maximum:3},accepted_answers:{type:"array",items:{type:"string"}},explanation:{type:"string"}}}}}};
  const prompt="Create exactly "+count+" original age-appropriate learning game questions. Question format: "+(format==="mcq"?"all questions must be four-option multiple choice (mcq).":"mixed formats, approximately 70% mcq, 15% true/false (tf), 15% typed-answer (typed). For tf use options [True,False] and correct_index 0 or 1. For typed use empty options, null correct_index and one or more accepted_answers.")+". Grade: "+input.grade+"; learning area: "+input.learningArea+"; year: "+input.academicYear+"; term: "+input.term+"; strand: "+input.strand+"; sub-strand: "+input.subStrand+". Difficulty: "+difficulty+". Verified learning outcomes:\\n"+outcomes+"\\nVerified curriculum notes:\\n"+notes+"\\nSource: "+(source||"Not recorded")+". Use only supplied curriculum facts; preserve official scope; do not invent outcomes or syllabus labels; four distinct options and one defensible correct answer; varied recall, understanding and application; Kenyan age-appropriate contexts; brief teaching explanations.";
  const ai=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+apiKey},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",input:[{role:"system",content:"You are an expert Kenyan CBC assessment writer. Curriculum fidelity and age-appropriate clarity are mandatory. Never fabricate official curriculum content."},{role:"user",content:prompt}],text:{format:{type:"json_schema",name:"qla_questions",strict:true,schema}},max_output_tokens:9000})});
  const payload=await ai.json();if(!ai.ok)return reply(502,{error:payload.error?.message||"AI generation failed."});
  const output=payload.output_text||((payload.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==="output_text").map(x=>x.text).join(""));
  if(!output)return reply(502,{error:"The AI returned no quiz content."});
  const result=JSON.parse(output);
  if(!Array.isArray(result.questions)||result.questions.length!==count)return reply(502,{error:"The generated quiz failed the question-count check."});
  for(const q of result.questions){const validMcq=q.type==="mcq"&&q.options?.length===4&&new Set(q.options.map(x=>String(x).trim().toLowerCase())).size===4&&Number.isInteger(q.correct_index)&&q.correct_index>=0&&q.correct_index<=3;const validTf=q.type==="tf"&&q.options?.length===2&&Number.isInteger(q.correct_index)&&(q.correct_index===0||q.correct_index===1);const validTyped=q.type==="typed"&&q.options?.length===0&&q.correct_index===null&&Array.isArray(q.accepted_answers)&&q.accepted_answers.length>0;if(!q.question||!(validMcq||validTf||validTyped)||!q.explanation)return reply(502,{error:"A question failed quality validation. Please generate again."});}
  return reply(200,{...result,verifiedCurriculum:{grade:input.grade,learningArea:input.learningArea,strand:input.strand,subStrand:input.subStrand,sourceReference:source},createdFor:user.id});
 }catch(e){return reply(502,{error:"Quiz generation failed: "+(e.message||"Unknown error")});}
};