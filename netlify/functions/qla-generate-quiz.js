// Authenticated AI quiz generation against the server-verified QLA curriculum register.
const headers={"Content-Type":"application/json"};
const reply=(statusCode,body)=>({statusCode,headers,body:JSON.stringify(body)});
exports.handler=async(event)=>{
 if(event.httpMethod!=="POST")return reply(405,{error:"Method not allowed."});
 const apiKey=process.env.OPENAI_API_KEY,supabaseUrl=process.env.SUPABASE_URL,supabaseAnonKey=process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!apiKey||!supabaseUrl||!supabaseAnonKey)return reply(503,{error:"AI quiz generation is not configured. Check the server environment variables."});
 const token=(event.headers.authorization||event.headers.Authorization||"").replace(/^Bearer\s+/i,"");
 if(!token)return reply(401,{error:"Sign in before creating an AI quiz."});
 let input;try{input=JSON.parse(event.body||"{}");}catch{return reply(400,{error:"Invalid request body."});}
 if(!String(input.grade||"").trim()||!String(input.learningArea||"").trim())return reply(400,{error:"Choose a grade and learning area."});
 if(!Array.from({length:12},(_,i)=>"Grade "+(i+1)).includes(input.grade))return reply(400,{error:"Choose a grade from 1 to 12."});
 const count=Math.max(5,Math.min(30,Number(input.questionCount)||20));
 const difficulty=["Easy","Medium","Hard","Mixed"].includes(input.difficulty)?input.difficulty:"Mixed";
 const format=input.questionFormat==="mcq"?"mcq":"mixed";
 try{
  const auth=await fetch(supabaseUrl+"/auth/v1/user",{headers:{apikey:supabaseAnonKey,Authorization:"Bearer "+token}});
  if(!auth.ok)return reply(401,{error:"Your session has expired. Sign in again."});
  const user=await auth.json();
  const focus=String(input.focusTopic||"").trim().slice(0,180);
  const schema={type:"object",additionalProperties:false,required:["questions"],properties:{questions:{type:"array",minItems:count,maxItems:count,items:{type:"object",additionalProperties:false,required:["type","question","options","correct_index","accepted_answers","explanation"],properties:{type:{type:"string",enum:["mcq","tf","typed"]},question:{type:"string"},options:{type:"array",items:{type:"string"},maxItems:4},correct_index:{type:["integer","null"],minimum:0,maximum:3},accepted_answers:{type:"array",items:{type:"string"}},explanation:{type:"string"}}}}}};
  const prompt="Create exactly "+count+" original, high-quality, age-appropriate learning game questions for Kenyan learners. Selected grade: "+input.grade+"; learning area: "+input.learningArea+"; optional topic/focus: "+(focus||"Choose a suitable foundational topic for this grade and learning area")+". Academic context: "+String(input.academicYear||"2027")+"; "+String(input.term||"Full Year")+". Difficulty: "+difficulty+". Question format: "+(format==="mcq"?"all four-option multiple choice (mcq).":"mixed formats, approximately 70% mcq, 15% true/false (tf), 15% typed-answer (typed). For tf use options [True,False] and correct_index 0 or 1. For typed use empty options, null correct_index and one or more accepted_answers.")+". Use your subject knowledge to create a balanced practice set appropriate to the selected grade and Kenyan CBC/CBE learning context. Cover a sensible range of concepts within the learning area; do not claim that generated topic labels or questions are copied from or officially verified against a KICD design. Avoid advanced content beyond the selected grade. Include clear, unambiguous questions, four distinct options for MCQ, one defensible correct answer, and concise teaching explanations. For mathematics/science, ensure calculations and units are correct. For languages, assess age-appropriate grammar, vocabulary, comprehension or communication skills. For social sciences and CRE, use respectful, balanced age-appropriate content.";
  const ai=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+apiKey},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",input:[{role:"system",content:"You are an expert Kenyan CBC/CBE assessment writer. Produce accurate, age-appropriate practice questions from your subject knowledge. Never falsely claim official source verification."},{role:"user",content:prompt}],text:{format:{type:"json_schema",name:"qla_questions",strict:true,schema}},max_output_tokens:9000})});
  const payload=await ai.json();if(!ai.ok)return reply(502,{error:payload.error?.message||"AI generation failed."});
  const output=payload.output_text||((payload.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==="output_text").map(x=>x.text).join(""));
  if(!output)return reply(502,{error:"The AI returned no quiz content."});
  const result=JSON.parse(output);
  if(!Array.isArray(result.questions)||result.questions.length!==count)return reply(502,{error:"The generated quiz failed the question-count check."});
  for(const q of result.questions){const validMcq=q.type==="mcq"&&q.options?.length===4&&new Set(q.options.map(x=>String(x).trim().toLowerCase())).size===4&&Number.isInteger(q.correct_index)&&q.correct_index>=0&&q.correct_index<=3;const validTf=q.type==="tf"&&q.options?.length===2&&Number.isInteger(q.correct_index)&&(q.correct_index===0||q.correct_index===1);const validTyped=q.type==="typed"&&q.options?.length===0&&q.correct_index===null&&Array.isArray(q.accepted_answers)&&q.accepted_answers.length>0;if(!q.question||!(validMcq||validTf||validTyped)||!q.explanation)return reply(502,{error:"A question failed quality validation. Please generate again."});}
  return reply(200,{...result,generationContext:{grade:input.grade,learningArea:input.learningArea,focusTopic:focus||null,academicYear:input.academicYear||null,term:input.term||null,source:"AI-generated practice questions; not a verified extract from an official curriculum design."},createdFor:user.id});
 }catch(e){return reply(502,{error:"Quiz generation failed: "+(e.message||"Unknown error")});}
};