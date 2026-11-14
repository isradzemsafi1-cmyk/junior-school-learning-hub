
// Netlify Function: generate exactly 30 curriculum-aligned MCQs
// for an authorised teacher.
//
// Required Netlify environment variables:
// OPENAI_API_KEY, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
//
// Optional:
// OPENAI_MODEL (defaults to gpt-4.1-mini)

const headers = {
  "Content-Type": "application/json"
};

const reply = (statusCode, body) => ({
  statusCode,
  headers,
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return reply(405, { error: "Method not allowed." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabasePublishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!apiKey || !supabaseUrl || !supabasePublishableKey) {
    return reply(503, {
      error: "Quiz generation is not configured. Add OPENAI_API_KEY, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to Netlify environment variables."
    });
  }

  const token = (
    event.headers.authorization ||
    event.headers.Authorization ||
    ""
  ).replace(/^Bearer\s+/i, "");

  if (!token) {
    return reply(401, {
      error: "Sign in as an authorised teacher first."
    });
  }

  let input;

  try {
    input = JSON.parse(event.body || "{}");
  } catch {
    return reply(400, { error: "Invalid request body." });
  }

  const required = [
    "grade",
    "learningArea",
    "academicYear",
    "term",
    "strand",
    "subStrand",
    "learningOutcomes",
    "curriculumNotes"
  ];

  for (const key of required) {
    if (!String(input[key] || "").trim()) {
      return reply(400, {
        error: `Missing required curriculum field: ${key}`
      });
    }
  }

  if (!["Grade 7", "Grade 8", "Grade 9"].includes(input.grade)) {
    return reply(400, { error: "Invalid grade." });
  }

  const subjects = [
    "Mathematics",
    "English",
    "Kiswahili",
    "Integrated Science",
    "Social Studies",
    "CRE",
    "Agriculture",
    "Pre-Technical Studies",
    "Creative Arts and Sports"
  ];

  if (!subjects.includes(input.learningArea)) {
    return reply(400, { error: "Invalid learning area." });
  }

  if (!["Term 1", "Term 2", "Term 3", "Full Year"].includes(input.term)) {
    return reply(400, { error: "Invalid term." });
  }

  if (
    typeof input.learningOutcomes !== "string" ||
    typeof input.curriculumNotes !== "string" ||
    input.learningOutcomes.length > 12000 ||
    input.curriculumNotes.length > 16000
  ) {
    return reply(400, {
      error: "Curriculum context is invalid or too long."
    });
  }

  // Verify the bearer token and teacher role using
  // the existing Supabase authentication and RPC.
  try {
    const authRes = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          apikey: supabasePublishableKey,
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!authRes.ok) {
      return reply(401, {
        error: "Your session is invalid. Sign in again."
      });
    }

    const teacherRes = await fetch(
      `${supabaseUrl}/rest/v1/rpc/is_tuition_teacher`,
      {
        method: "POST",
        headers: {
          apikey: supabasePublishableKey,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: "{}"
      }
    );

    if (!teacherRes.ok || (await teacherRes.json()) !== true) {
      return reply(403, {
        error: "Only authorised teachers can generate quizzes."
      });
    }
  } catch {
    return reply(503, {
      error: "Could not verify teacher access with Supabase."
    });
  }

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["questions"],
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "question",
            "options",
            "correct_index",
            "explanation"
          ],
          properties: {
            question: { type: "string" },
            options: {
              type: "array",
              items: { type: "string" }
            },
            correct_index: {
              type: "integer",
              minimum: 0,
              maximum: 3
            },
            explanation: { type: "string" }
          }
        }
      }
    }
  };

  const prompt = `Create exactly 30 distinct, accurate Grade-level CBC assessment questions.
Use ONLY the curriculum information supplied below. Do not add topics outside the stated strand/sub-strand or invent curriculum outcomes.

Grade: ${input.grade}
Learning area: ${input.learningArea}
Academic year: ${input.academicYear}
Term scope: ${input.term}
Strand: ${input.strand}
Sub-strand: ${input.subStrand}
Learning outcomes: ${input.learningOutcomes}
Curriculum content notes: ${input.curriculumNotes}
Source reference: ${input.sourceReference || "Not supplied"}

Requirements:
- Exactly 30 unique multiple-choice questions, four options each.
- Cover the supplied learning outcomes broadly; vary recall, understanding, application and reasoning.
- Use age-appropriate Kenyan junior-school contexts and units where relevant.
- One and only one defensible correct option for every question.
- Distractors must be plausible and from the same subject domain.
- No duplicate stems, no repeated numerical problems with only changed numbers, and no unsupported facts.
- Correct index is zero-based (0=A, 1=B, 2=C, 3=D).
- Explanations must explain the correct answer accurately and briefly.
- Return only the required structured data.`;

  try {
    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
          input: [
            {
              role: "system",
              content: "You are a careful Kenyan junior-school assessment author. Accuracy and curriculum fidelity are more important than filling gaps. If the supplied curriculum notes do not support 30 distinct questions, do not fabricate; return a refusal."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          text: {
            format: {
              type: "json_schema",
              name: "qla_quiz_questions",
              strict: true,
              schema
            }
          },
          max_output_tokens: 9000
        })
      }
    );

    const payload = await response.json();

    if (!response.ok) {
      return reply(502, {
        error: payload.error?.message ||
          "The question-generation service returned an error."
      });
    }

    if (payload.status === "incomplete") {
      return reply(502, {
        error: "The question generation was incomplete. Please try again."
      });
    }

    let parsed;

    if (payload.output_text) {
      parsed = JSON.parse(payload.output_text);
    } else {
      const outputText = (payload.output || [])
        .flatMap(item => item.content || [])
        .filter(item => item.type === "output_text")
        .map(item => item.text)
        .join("");

      if (!outputText) {
        return reply(502, {
          error: "No structured questions were returned."
        });
      }

      parsed = JSON.parse(outputText);
    }

    if (
      !Array.isArray(parsed.questions) ||
      parsed.questions.length !== 30
    ) {
      return reply(502, {
        error: "The generator did not return 30 questions. Please try again."
      });
    }

    for (const q of parsed.questions) {
      if (
        !q.question ||
        !Array.isArray(q.options) ||
        q.options.length !== 4 ||
        new Set(
          q.options.map(x => String(x).trim().toLowerCase())
        ).size !== 4 ||
        !Number.isInteger(q.correct_index) ||
        q.correct_index < 0 ||
        q.correct_index > 3 ||
        !q.explanation
      ) {
        return reply(502, {
          error: "A generated question failed validation. Please generate the quiz again."
        });
      }
    }

    return reply(200, parsed);

  } catch (error) {
    return reply(502, {
      error: "Question generation failed: " +
        (error.message || "Unknown error")
    });
  }
};
