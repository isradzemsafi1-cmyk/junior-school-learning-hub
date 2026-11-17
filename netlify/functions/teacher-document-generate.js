// AI Teacher Document Studio — authenticated teacher-only generation.
// Uses the existing OPENAI_API_KEY, SUPABASE_URL and SUPABASE_ANON_KEY Netlify secrets.
const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
const AREAS = ["Mathematics","English","Kiswahili","Integrated Science","Social Studies","CRE","Agriculture","Pre-Technical Studies","Creative Arts and Sports"];
const GRADES = ["Grade 7","Grade 8","Grade 9"];
const TYPES = ["Scheme of Work","Lesson Plan","Records of Work","Assessment / CAT","End-Term Examination","Marking Scheme","Assessment Rubric","Lesson Notes","Topical Questions","Worksheet","Learner Progress Report","Remedial Teaching Plan","Academic Department Report","Class Timetable","Meeting Minutes","Departmental Report","Teacher Appraisal Evidence"];
const typeGuidance = {
 "Scheme of Work":"Create a term scheme in a clear table with columns exactly: WK, LSN, TOPIC, SUB-TOPIC, OBJECTIVES, L/ACTIVITIES, L/T AIDS, REFERENCE, REMARKS. Include knowledge, skills and attitudes in learning objectives. Allocate only teaching weeks; respect the specified midterm and assessment/closing weeks. Do not invent official curriculum content.",
 "Lesson Plan":"Use a professional lesson-plan structure: lesson particulars; specific learning outcomes separately under Knowledge, Skills and Attitudes; key inquiry question; prior knowledge; learning experiences in Introduction, Development and Conclusion with time allocations; teacher and learner activities; resources; assessment; inclusion/differentiation; reflection. Learning experiences should be learner-centred and begin with 'In groups learners are guided to…' where suitable.",
 "Records of Work":"Create a register-style table with columns Strand, Sub-strand, Week, Date, Lesson, Work Covered, Teacher's Signature. Populate strand, sub-strand, week, lesson and work covered; leave date and signature blank unless dates were explicitly supplied.",
 "Assessment / CAT":"Create a balanced CBC/CBE assessment with clear instructions, varied item types, marks per item, total marks matching the requested total, competency/application questions, and a separate answer key/marking guide.",
 "End-Term Examination":"Create a complete, printable examination paper with candidate instructions, sections, numbered questions, mark allocations that sum exactly to the requested total, and a separate detailed marking scheme.",
 "Marking Scheme":"Create a detailed marking scheme with expected responses, alternative acceptable answers where appropriate, mark allocation per point, and a total that matches the supplied assessment.",
 "Assessment Rubric":"Create a clear analytic rubric with criteria and four performance levels: Exceeding Expectations (EE), Meeting Expectations (ME), Approaching Expectations (AE), and Below Expectations (BE). Use observable descriptors.",
 "Lesson Notes":"Create well-organised learner-friendly notes with learning outcomes, clear explanations, vocabulary, worked/local examples, activities, summary and self-check questions with answers.",
 "Topical Questions":"Create graded topical questions from the supplied content only, moving from recall to application and reasoning. Include marks and a separate answer guide.",
 "Worksheet":"Create a classroom-ready learner worksheet with instructions, scaffolded activities, inclusive options and a separate teacher answer key.",
 "Learner Progress Report":"Create a professional blank learner progress report template with learning areas, performance levels, teacher comments, competencies, values, strengths, next steps and parent/guardian feedback. Do not invent learner data.",
 "Remedial Teaching Plan":"Create a practical intervention plan with learning gaps, diagnostic evidence placeholders, target outcomes, strategies, resources, timeline, responsible person and follow-up assessment.",
 "Academic Department Report":"Create a professional department report with summary, curriculum coverage, assessment analysis placeholders, strengths, challenges, interventions, resource needs, recommendations and action plan.",
 "Class Timetable":"Create a weekly timetable table Monday to Friday with periods, break/lunch slots and blank editable cells unless subjects and times are supplied. Do not double-book supplied entries.",
 "Meeting Minutes":"Create formal minutes with meeting details, attendance placeholders, agenda, discussion, resolutions, action owners, deadlines and next meeting.",
 "Departmental Report":"Create a concise formal departmental report with purpose, activities, achievements, evidence, challenges, recommendations and action tracker.",
 "Teacher Appraisal Evidence":"Create a professional evidence-record template with practice area, objective, activity, evidence/documentation, impact on learner progress, reflection and next action. Do not claim official appraisal compliance."
};
exports.handler = async (event) => {
 if (event.httpMethod !== "POST") return reply(405,{error:"Method not allowed."});
 const apiKey=process.env.OPENAI_API_KEY, supabaseUrl=process.env.SUPABASE_URL, anon=process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!apiKey||!supabaseUrl||!anon) return reply(503,{error:"AI document generation is not configured. The site administrator must configure OPENAI_API_KEY, SUPABASE_URL and SUPABASE_ANON_KEY in Netlify."});
 const token=(event.headers.authorization||event.headers.Authorization||"").replace(/^Bearer\s+/i,"");
 if(!token) return reply(401,{error:"Please sign in with an authorised teacher account."});
 let input; try{input=JSON.parse(event.body||"{}")}catch{return reply(400,{error:"Invalid request body."})}
 const required=["documentType","grade","learningArea","term","academicYear","topic"];
 for(const key of required) if(!String(input[key]||"").trim()) return reply(400,{error:"Please complete the required field: "+key});
 if(!TYPES.includes(input.documentType)||!GRADES.includes(input.grade)||!AREAS.includes(input.learningArea)||!["Term 1","Term 2","Term 3","Full Year"].includes(input.term)) return reply(400,{error:"One or more selected document details are invalid."});
 const serialized=JSON.stringify(input);
 if(serialized.length>18000) return reply(413,{error:"Your instructions are too long. Shorten the curriculum notes and try again."});
 try{
  const auth=await fetch(supabaseUrl+"/auth/v1/user",{headers:{apikey:anon,Authorization:"Bearer "+token}});
  if(!auth.ok) return reply(401,{error:"Your session has expired. Sign in again."});
  const teacher=await fetch(supabaseUrl+"/rest/v1/rpc/is_tuition_teacher",{method:"POST",headers:{apikey:anon,Authorization:"Bearer "+token,"Content-Type":"application/json"},body:"{}"});
  if(!teacher.ok||(await teacher.json())!==true) return reply(403,{error:"This AI studio is available to authorised teacher accounts only."});
  const prompt=`Prepare a complete, polished professional Kenyan Junior School teacher document.
Document: ${input.documentType}
Grade: ${input.grade}
Learning area: ${input.learningArea}
Term: ${input.term}
Academic year: ${input.academicYear}
School: ${input.schoolName||"Leave blank"}
Teacher: ${input.teacherName||"Leave blank"}
Strand: ${input.strand||"Not supplied"}
Sub-strand/topic: ${input.topic}
Learning outcomes supplied by teacher: ${input.learningOutcomes||"Not supplied"}
Curriculum notes / source text: ${input.curriculumNotes||"Not supplied"}
Term weeks: ${input.termWeeks||"Use teacher's supplied calendar"}
Lessons per week: ${input.lessonsPerWeek||"Not supplied"}
Midterm break week(s): ${input.midtermWeeks||"Not supplied"}
Assessment / closing week(s): ${input.assessmentWeeks||"Not supplied"}
Additional instructions: ${input.instructions||"None"}
Document-specific structure: ${typeGuidance[input.documentType]}
Quality requirements:
- Align the content to the Kenyan CBC/CBE approach and the stated grade, learning area and supplied curriculum notes.
- Use practical Kenyan contexts, locally available learning resources, learner-centred experiences, inclusion and differentiation.
- Distinguish Knowledge, Skills and Attitudes where learning outcomes are relevant; include competencies and values where appropriate.
- Use clear professional British/Kenyan English, consistent numbering, headings and tables where useful.
- Do not invent KICD codes, official outcomes, page numbers, citations, legal requirements or claims of official approval. If curriculum detail is missing, mark it clearly as 'Teacher to verify against the current KICD curriculum design' rather than guessing.
- Use the exact requested term calendar constraints. Do not schedule teaching in stated break or assessment/closing weeks.
- For question papers, ensure marks add correctly and provide a separate answer/marking guide.
- Make the result complete and ready for teacher review, not a brief outline.
Return the document as clean Markdown. Do not include commentary about being an AI.`;
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:"Bearer "+apiKey,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",instructions:"You are a highly experienced Kenyan Junior School CBC/CBE teacher, curriculum planner and professional school-document editor. Follow the user-supplied curriculum evidence carefully.",input:prompt,max_output_tokens:8500})});
  const payload=await response.json();
  if(!response.ok) return reply(502,{error:payload.error?.message||"The AI service could not generate the document. Please try again."});
  const content=payload.output_text||(payload.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==="output_text").map(x=>x.text).join("\n");
  if(!content||!content.trim()) return reply(502,{error:"The AI returned an empty document. Please try again."});
  return reply(200,{document:content.trim(),documentType:input.documentType});
 }catch(error){return reply(502,{error:"Document generation failed. Please try again. "+(error.message||"")})}
};
