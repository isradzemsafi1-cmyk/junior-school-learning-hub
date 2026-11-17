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
  const supabaseKey = Netlify.env.get("SUPABASE_ANON_KEY") || "sb_publishable_uaOcRVaIwnvRl_wZhMhJ-Q_DhrqZyS_";
  const geminiKey = Netlify.env.get("GEMINI_API_KEY");
  if (!geminiKey) return reply(503, { error: "AI document generation is not configured yet. The site administrator must add GEMINI_API_KEY to Netlify environment variables." });
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
    const data = Object.fromEntries(["documentType","grade","learningArea","term","academicYear","schoolName","teacherName","strand","topic","learningOutcomes","curriculumNotes","termWeeks","lessonsPerWeek","midtermWeeks","assessmentWeeks","instructions"].map(k => [k, clean(input[k])]));
    const prompt = `You are the professional curriculum-document assistant for Junior School Learning Hub in Kenya. Generate a complete, carefully structured and editable first draft for the requested school document.
CURRICULUM RULES:
- Align to the grade-specific Kenyan CBC/CBE curriculum design and supplied learning area.
- Do not invent official strands, sub-strands, lesson allocations, assessment standards, curriculum codes or KNEC requirements.
- Use the exact curriculum details supplied in CURRICULUM NOTES and LEARNING OUTCOMES. If important details are absent, mark them "TEACHER TO VERIFY AGAINST THE CURRENT KICD CURRICULUM DESIGN" rather than fabricating them.
- KICD curriculum designs define learning areas, strands, sub-strands and expected learning outcomes. KNEC is the assessment body; do not claim KNEC approved a teaching document.
- For Grades 10–12, recognise Senior School pathway and subject choices. If pathway is not specified, state that the teacher must confirm the learner's pathway and exact subject design.
- For CBC/CBE lesson plans, express outcomes through Knowledge, Skills and Attitudes where appropriate. Learning experiences should be learner-centred, practical, inclusive and competency-focused.
- Schemes of Work: use columns WK, LSN, TOPIC, SUB-TOPIC, OBJECTIVES, L/ACTIVITIES, L/T AIDS, REFERENCE, REMARKS.
- Lesson Plans: include lesson details, specific learning outcomes, key inquiry questions, learning experiences, core competencies, values, pertinent and contemporary issues where relevant, resources, assessment and reflection.
- Records of Work: use columns Strand, Subject Strand/Sub-strand, Week, Date, Lesson, Work Covered, Sign. Leave Date and Sign blank.
- Do not invent school names. Leave school blank if not supplied.
- Make the document detailed, professional, practical for Kenyan teachers and appropriate to the grade.
- Return only the document body in Markdown, without preamble or claims of official approval.
DOCUMENT INPUT:
${JSON.stringify(data, null, 2)}
Generate the requested document now.`;
    const aiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(geminiKey), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.35, maxOutputTokens: 8192 } })
    });
    const result = await aiResponse.json();
    if (!aiResponse.ok) {
      console.error("Gemini generation failed:", result?.error?.message || aiResponse.status);
      return reply(502, { error: "The AI service could not generate this document. Please try again later." });
    }
    const document = result?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("\n").trim();
    if (!document) return reply(502, { error: "The AI service returned an empty document. Please try again." });
    return reply(200, { success: true, document, generatedFor: { grade: data.grade, learningArea: data.learningArea, documentType: data.documentType } });
  } catch (error) {
    console.error("Teacher document generation error:", error?.message || error);
    return reply(500, { error: "Document generation failed. Check the details and try again." });
  }
};
