import type { Handler } from "@netlify/functions";

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json(503, { error: "AI is not configured yet. Add GEMINI_API_KEY to this Netlify site's server-side environment variables." });

  try {
    const body = JSON.parse(event.body || "{}");
    const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 8000) : "";
    const role = typeof body.role === "string" ? body.role : "Teacher";
    const grade = typeof body.grade === "string" ? body.grade : "Grade 7";
    const area = typeof body.area === "string" ? body.area : "Integrated Science";
    if (!prompt) return json(400, { error: "Please enter a question or instruction." });

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "You are the Junior School Learning Hub educational assistant in Kenya. Be age-appropriate, inclusive, clear and practical. For teacher documents, structure outcomes as Knowledge, Skills and Attitudes, use learner-centred experiences, and label generated curriculum material as a draft that must be checked against the current official curriculum design. Do not invent official curriculum citations or claim approval. For learners, explain concepts and guide reasoning rather than simply completing assessed work." }] },
        contents: [{ role: "user", parts: [{ text: `Workspace role: ${role}. Grade: ${grade}. Learning area: ${area}. Request: ${prompt}` }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1800 }
      })
    });
    const data = await response.json();
    if (!response.ok) return json(response.status, { error: data?.error?.message || "The AI provider request failed." });
    const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("\n") || "";
    return json(200, { text });
  } catch {
    return json(400, { error: "The request could not be processed. Check the prompt and try again." });
  }
};
