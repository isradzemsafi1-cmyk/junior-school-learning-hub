export default async (request) => {
  const reply = (status, body) => new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
  if (request.method !== "POST") return reply(405, { error: "Only POST requests are allowed." });
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return reply(401, { error: "Please sign in with your Learning Hub account first." });
  const supabaseUrl = Netlify.env.get("SUPABASE_URL") || "https://hqbqhnhgrgfxpedjzmnm.supabase.co";
  const supabaseKey = Netlify.env.get("SUPABASE_PUBLISHABLE_KEY") || Netlify.env.get("SUPABASE_ANON_KEY") || "sb_publishable_uaOcRVaIwnvRl_wZhMhJ-Q_DhrqZyS_";
  const openaiKey = Netlify.env.get("OPENAI_API_KEY");
  if (!openaiKey) return reply(503, { error: "AI document generation is not configured. The site administrator must add OPENAI_API_KEY to Netlify environment variables." });
  try {
    const authResponse = await fetch(supabaseUrl + "/auth/v1/user", {
      headers: { apikey: supabaseKey, Authorization: "Bearer " + token }
    });
    if (!authResponse.ok) return reply(401, { error: "Your sign-in session is invalid or expired. Please sign in again." });
    const user = await authResponse.json();
    if (!user?.id) return reply(401, { error: "A valid signed-in account is required." });
    const input = await request.json();
    const allowedGrades = Array.from({ length: 12 }, (_, i) => "Grade " + (i + 1));
    if (!allowedGrades.includes(input.grade)) return reply(400, { error: "Choose a valid grade from Grade 1 to Grade 12." });
    if (["documentType", "learningArea", "topic"].some(k => !String(input[k] || "").trim()))
      return reply(400, { error: "Document type, learning area and topic are required." });
    const clean = value => String(value || "").slice(0, 12000);
    const data = Object.fromEntries(["documentType","grade","pathway","learningArea","term","academicYear","schoolName","teacherName","strand","topic","learningOutcomes","curriculumNotes","termWeeks","lessonsPerWeek","midtermWeeks","assessmentWeeks","instructions"].map(k => [k, clean(input[k])]));
    const prompt = `You are the professional curriculum-document assistant for Junior School Learning Hub in Kenya. Generate a complete, carefully structured and editable first draft for the requested school document.
CURRICULUM RULES:
- Align to the grade-specific Kenyan CBC/CBE curriculum design and supplied learning area.
- Do not invent official strands, sub-strands, lesson allocations, assessment standards, curriculum codes or KNEC requirements.
- Use the exact curriculum details supplied in CURRICULUM NOTES and LEARNING OUTCOMES. If important details are absent, mark them "TEACHER TO VERIFY AGAINST THE CURRENT KICD CURRICULUM DESIGN" rather than fabricating them.
- KICD curriculum designs define learning areas, strands, sub-strands and expected learning outcomes. KNEC is the assessment body; do not claim KNEC approved a teaching document.
- For Grades 10–12, use the supplied pathway information: ${data.pathway || "not specified"}. Senior School subjects depend on pathway; if no pathway is specified, state that the teacher must confirm the learner's pathway and exact subject design.
- For CBC/CBE lesson plans, show the selected curriculum outcomes clearly, then organise lesson-specific intentions into Knowledge, Skills and Attitudes where appropriate without changing the official outcome wording. Learning experiences should be learner-centred, practical, inclusive and competency-focused.\n- When imported curriculum components are supplied, use the listed key inquiry questions, suggested learning experiences, core competencies, values, PCIs and assessment guidance where relevant. Do not add invented items and clearly mark missing components for teacher verification.
- Schemes of Work: use columns WK, LSN, TOPIC, SUB-TOPIC, OBJECTIVES, L/ACTIVITIES, L/T AIDS, REFERENCE, REMARKS.
- Lesson Plans: include lesson details, specific learning outcomes, key inquiry questions, learning experiences, core competencies, values, pertinent and contemporary issues where relevant, resources, assessment and reflection.
- Records of Work: use columns Strand, Subject Strand/Sub-strand, Week, Date, Lesson, Work Covered, Sign. Leave Date and Sign blank.
- Do not invent school names. Leave school blank if not supplied.
- Make the document detailed, professional, practical for Kenyan teachers and appropriate to the grade.
- Return only the document body in Markdown, without preamble or claims of official approval.
DOCUMENT INPUT:
${JSON.stringify(data, null, 2)}
Generate the requested document now.`;
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + openaiKey },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: "You create professional Kenyan CBC/CBE teaching documents. Follow the curriculum accuracy rules in the user message. Never invent official curriculum details or claim KNEC approval." },
          { role: "user", content: prompt }
        ],
        temperature: 0.35,
        max_tokens: 8192
      })
    });
    const result = await aiResponse.json();
    if (!aiResponse.ok) {
      console.error("OpenAI document generation failed:", result?.error?.message || aiResponse.status);
      return reply(502, { error: "The AI service could not generate this document. Please try again later." });
    }
    const document = result?.choices?.[0]?.message?.content?.trim();
    if (!document) return reply(502, { error: "The AI service returned an empty document. Please try again." });
    return reply(200, { success: true, document, generatedFor: { grade: data.grade, learningArea: data.learningArea, documentType: data.documentType } });
  } catch (error) {
    console.error("Teacher document generation error:", error?.message || error);
    return reply(500, { error: "Document generation failed. Check the details and try again." });
  }
};
