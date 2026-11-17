export default async (request) => {
  const reply = (status, body) => new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
  if (request.method !== "POST") return reply(405, { error: "Only POST requests are allowed." });
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return reply(401, { error: "Please sign in before importing curriculum designs." });
  const supabaseUrl = Netlify.env.get("SUPABASE_URL") || "https://hqbqhnhgrgfxpedjzmnm.supabase.co";
  const supabaseKey = Netlify.env.get("SUPABASE_PUBLISHABLE_KEY") || Netlify.env.get("SUPABASE_ANON_KEY") || "sb_publishable_uaOcRVaIwnvRl_wZhMhJ-Q_DhrqZyS_";
  const openaiKey = Netlify.env.get("OPENAI_API_KEY");
  if (!openaiKey) return reply(503, { error: "Curriculum extraction AI is not configured. The administrator must add OPENAI_API_KEY to Netlify." });
  try {
    const auth = await fetch(supabaseUrl + "/auth/v1/user", {
      headers: { apikey: supabaseKey, Authorization: "Bearer " + token }
    });
    if (!auth.ok) return reply(401, { error: "Your sign-in session has expired. Please sign in again." });
    const user = await auth.json();
    if (!user?.id) return reply(401, { error: "A valid signed-in account is required." });
    const input = await request.json();
    const grade = String(input.grade || "");
    if (!/^Grade (?:[1-9]|1[0-2])$/.test(grade)) return reply(400, { error: "Choose a valid grade from Grade 1 to Grade 12." });
    const learningArea = String(input.learningArea || "").slice(0, 180);
    const sourceName = String(input.sourceName || "Teacher-supplied curriculum source").slice(0, 240);
    const sourceText = String(input.sourceText || "").slice(0, 65000);
    if (!learningArea || sourceText.trim().length < 150) return reply(400, { error: "Select a learning area and provide readable curriculum design text." });
    const prompt = `Extract curriculum structure from the exact teacher-supplied source text below. This is a source-grounded extraction task, not a curriculum-writing task.
Context: Kenya CBC/CBE; ${grade}; learning area: ${learningArea}; Senior School pathway: ${String(input.pathway || "not supplied")}.
Rules:
1. Only extract information actually present in the supplied text. Do not use outside knowledge to fill gaps.
2. For every specific expected learning outcome, preserve the original wording exactly as it appears in the source, including numbering where present. Do not paraphrase, combine, simplify, correct or invent it.
3. Link each outcome to its source strand and sub-strand exactly where identifiable. If uncertain, use "Needs teacher verification".
4. Exclude general prose, learning experiences, objectives written by the AI, and outcomes belonging to another grade or learning area.
5. If the text is not clearly for the selected grade and learning area, return an empty outcomes array and explain why in warnings.
6. If text extraction has broken words or tables, preserve only legible text and add a warning rather than guessing.
7. Return valid JSON only with this shape:
{"sourceTitle":"string","grade":"string","learningArea":"string","designVersion":"string","outcomes":[{"strand":"exact strand heading or Needs teacher verification","subStrand":"exact sub-strand heading or empty string","text":"verbatim specific learning outcome"}],"generalLearningOutcomes":["verbatim only if clearly identified"],"keyInquiryQuestions":["verbatim source questions"],"suggestedLearningExperiences":["brief source-grounded items"],"coreCompetencies":["source-listed items"],"values":["source-listed items"],"pcis":["source-listed pertinent and contemporary issues"],"assessmentGuidance":["verbatim source-grounded assessment guidance"],"assessmentRubrics":["verbatim source-grounded rubric criteria or descriptors"],"warnings":["extraction limitations or items requiring teacher review"]}
8. Do not output the entire source document. Extract only the curriculum fields listed above.
SOURCE NAME: ${sourceName}
SOURCE TEXT:
${sourceText}`;
    const ai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + openaiKey },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: "You are a precise curriculum-document extraction engine. You must preserve source wording exactly and never invent curriculum details. Return valid JSON only." },
          { role: "user", content: prompt }
        ],
        temperature: 0,
        max_tokens: 12000,
        response_format: { type: "json_object" }
      })
    });
    const result = await ai.json();
    if (!ai.ok) {
      console.error("Curriculum extraction AI error:", result?.error?.message || ai.status);
      return reply(502, { error: "The AI could not extract this design. Try a smaller PDF section or paste clearer text." });
    }
    const raw = result?.choices?.[0]?.message?.content;
    if (!raw) return reply(502, { error: "The extraction service returned no curriculum data." });
    let curriculum;
    try { curriculum = JSON.parse(raw); } catch { return reply(502, { error: "The extraction result was not valid structured data. Please retry." }); }
    if (!Array.isArray(curriculum.outcomes)) curriculum.outcomes = [];
    curriculum.outcomes = curriculum.outcomes
      .filter(x => x && typeof x.text === "string" && x.text.trim())
      .map(x => ({
        strand: String(x.strand || "Needs teacher verification").slice(0, 300),
        subStrand: String(x.subStrand || "").slice(0, 300),
        text: x.text.trim().slice(0, 3000)
      }));
    curriculum.grade = grade;
    curriculum.learningArea = learningArea;
    curriculum.sourceName = sourceName;
    curriculum.extractionNotice = "AI-extracted from teacher-supplied source. Verify every extracted item against the original KICD design before use.";
    return reply(200, { success: true, curriculum });
  } catch (error) {
    console.error("Curriculum extraction error:", error?.message || error);
    return reply(500, { error: "Curriculum extraction failed. Please try again." });
  }
};
