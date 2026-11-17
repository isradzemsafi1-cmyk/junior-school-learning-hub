export default async (request) => {
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (request.method !== "POST") return reply(405, { error: "Only POST requests are allowed." });
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return reply(401, { error: "Please sign in before refining documents." });
  const url = Netlify.env.get("SUPABASE_URL") || "https://hqbqhnhgrgfxpedjzmnm.supabase.co";
  const key = Netlify.env.get("SUPABASE_PUBLISHABLE_KEY") || Netlify.env.get("SUPABASE_ANON_KEY") || "sb_publishable_uaOcRVaIwnvRl_wZhMhJ-Q_DhrqZyS_";
  const openaiKey = Netlify.env.get("OPENAI_API_KEY");
  if (!openaiKey) return reply(503, { error: "Document refinement is not configured. The site administrator must add OPENAI_API_KEY in Netlify." });
  try {
    const auth = await fetch(url + "/auth/v1/user", { headers: { apikey: key, Authorization: "Bearer " + token } });
    if (!auth.ok) return reply(401, { error: "Your sign-in session has expired. Please sign in again." });
    const user = await auth.json();
    if (!user?.id) return reply(401, { error: "A valid signed-in account is required." });
    const input = await request.json();
    const limit = (v, n) => String(v || "").slice(0, n);
    const documentText = limit(input.documentText, 45000);
    if (documentText.trim().length < 100) return reply(400, { error: "The document is too short to refine. Generate or edit a complete draft first." });
    const context = { documentType: limit(input.documentType, 100), grade: limit(input.grade, 20), learningArea: limit(input.learningArea, 180), term: limit(input.term, 40), topic: limit(input.topic, 500), learningOutcomes: limit(input.learningOutcomes, 10000), curriculumNotes: limit(input.curriculumNotes, 12000) };
    const prompt = [
      "Refine the supplied teacher document into a complete, professional, print-ready final draft.",
      "ACCURACY: Preserve teacher-provided facts, dates, names, school details, selected learning outcomes and their exact wording. Do not silently change facts.",
      "Do not invent official KICD strands, sub-strands, curriculum codes, lesson allocations, assessment standards or KNEC requirements. Use only supplied curriculum notes and outcomes for official curriculum claims. Where missing, insert [TEACHER TO VERIFY AGAINST CURRENT KICD DESIGN].",
      "Do not claim KICD or KNEC approval. Respect teacher instructions and edits unless they conflict with accuracy.",
      "QUALITY: Complete all expected sections; remove filler and duplication; ensure grade, learning area, term, topic, weeks and lesson sequence are internally consistent. Use professional Kenyan school language, clear headings, consistent numbering and useful tables. Check spelling, grammar, arithmetic, marks totals, sequence, resources and assessable evidence.",
      "Scheme of Work: use columns WK, LSN, TOPIC, SUB-TOPIC, OBJECTIVES, L/ACTIVITIES, L/T AIDS, REFERENCE, REMARKS. Respect stated teaching weeks, lessons and break/assessment weeks.",
      "Lesson Plan: include lesson particulars, outcomes, inquiry questions where supplied, introduction, development and conclusion, teacher/learner activities, resources, assessment/evidence, inclusion/differentiation, competencies, values, PCIs where supplied and reflection. State Knowledge, Skills and Attitudes as lesson intentions where appropriate without rewriting official outcomes.",
      "Records of Work: columns Strand, Subject Strand/Sub-strand, Week, Date, Lesson, Work Covered, Sign. Leave Date and Sign blank.",
      "Assessment/CAT/Examination: clear instructions, balanced grade-appropriate questions, marks per question and a correct total. Marking Scheme: accurate answers/workings and consistent allocations. Rubric: observable descriptors and coherent performance levels.",
      "Lesson Notes/Questions/Worksheet: progressive explanations, accurate worked examples, practice tasks and answer guide where appropriate. Timetables: no overlaps where constraints are supplied. Reports/Minutes/Appraisal/Remedial Plans: professional structure, actions, responsibilities and follow-up fields without invented names or outcomes.",
      "Return only the complete final document in Markdown, without process commentary.",
      "DOCUMENT CONTEXT:", JSON.stringify(context),
      "CURRENT TEACHER DOCUMENT INCLUDING EDITS:", documentText
    ].join("\n\n");
    const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + openaiKey }, body: JSON.stringify({ model: "gpt-4.1", messages: [{ role: "system", content: "You are a meticulous senior Kenyan CBC/CBE curriculum-document editor. Improve completeness and presentation without inventing facts or changing teacher intent." }, { role: "user", content: prompt }], temperature: 0.15, max_tokens: 12000 }) });
    const result = await response.json();
    if (!response.ok) { console.error("Document refinement AI error:", result?.error?.message || response.status); return reply(502, { error: "The AI service could not refine this document. Please try again." }); }
    const document = result?.choices?.[0]?.message?.content?.trim();
    if (!document) return reply(502, { error: "The refinement service returned an empty document. Please retry." });
    return reply(200, { success: true, document, generatedFor: { documentType: context.documentType, grade: context.grade, learningArea: context.learningArea } });
  } catch (error) { console.error("Teacher document refinement error:", error?.message || error); return reply(500, { error: "Document refinement failed. Please check your connection and try again." }); }
}