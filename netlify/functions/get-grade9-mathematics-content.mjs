const BUCKET = "grade9-mathematics-private";
const PUBLISHABLE_KEY = "sb_publishable_uaOcRVaIwnvRl_wZhMhJ-Q_DhrqZyS_";
const VALID_TERMS = new Set(["I", "II", "III"]);

const respond = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff"
    }
  });

function normalizeForLibrary(content, term) {
  if (content?.term !== term || !Array.isArray(content?.topics)) {
    throw new Error("Stored term lesson data is invalid.");
  }

  const topics = content.topics.map((topic) => {
    if (!topic || typeof topic !== "object" || typeof topic.title !== "string" || !topic.title.trim()) {
      throw new Error("Stored topic is missing its title.");
    }
    if (topic.quiz !== undefined && !Array.isArray(topic.quiz)) {
      throw new Error(`Quiz data is invalid for topic ${topic.title}.`);
    }
    for (const question of topic.quiz || []) {
      const options = question?.o || question?.options;
      const answer = question?.a ?? question?.answerIndex;
      if (typeof (question?.q || question?.question) !== "string" || !Array.isArray(options) || !Number.isInteger(Number(answer))) {
        throw new Error(`Quiz question schema is invalid for topic ${topic.title}.`);
      }
    }

    const notes = Array.isArray(topic.notes)
      ? topic.notes.filter((item) => typeof item === "string")
      : typeof topic.notes === "string" ? [topic.notes] : [];

    // The current library UI renders notes as plain text/list items. Surface
    // scheme subtopic headings and source gaps through that supported field,
    // without replacing or adding any lesson content to the stored object.
    if (Array.isArray(topic.sequence) && topic.sequence.length) {
      notes.push(`Scheme lesson sequence: ${topic.sequence.filter((item) => typeof item === "string").join("; ")}`);
    }
    if (Array.isArray(topic.sourceGaps)) {
      topic.sourceGaps.forEach((gap) => {
        if (!gap || typeof gap !== "object") return;
        const detail = [gap.status, gap.detail].filter(Boolean).join(" — ");
        notes.push(`Source gap: ${gap.item || "Unmatched scheme content"}${detail ? ` — ${detail}` : ""}`);
      });
    }

    return { ...topic, notes };
  });
  return { ...content, topics };
}

// Serves private Mathematics term data only after validating the learner session
// and an active, unexpired Grade 9 entitlement.
export default async (request) => {
  if (request.method !== "GET") {
    return respond(405, { message: "Method not allowed." });
  }

  const term = new URL(request.url).searchParams.get("term");
  if (!VALID_TERMS.has(term)) {
    return respond(400, { message: "Choose Term I, Term II, or Term III." });
  }

  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const serviceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return respond(500, { message: "Server configuration error." });
  }

  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return respond(401, { message: "Please log in first." });

    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (!authResponse.ok) return respond(401, { message: "Invalid login session." });

    const user = await authResponse.json();
    if (!user?.id) return respond(401, { message: "Learner account could not be verified." });

    const entitlementUrl = new URL(`${supabaseUrl}/rest/v1/entitlements`);
    entitlementUrl.search = new URLSearchParams({
      user_id: `eq.${user.id}`,
      product_id: "eq.grade9_notes",
      active: "eq.true",
      expires_at: `gt.${new Date().toISOString()}`,
      select: "id",
      limit: "1"
    }).toString();
    const entitlementResponse = await fetch(entitlementUrl, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      cache: "no-store"
    });
    if (!entitlementResponse.ok) throw new Error("Entitlement verification failed.");
    const entitlements = await entitlementResponse.json();
    if (!Array.isArray(entitlements) || entitlements.length === 0) {
      return respond(403, { message: "Grade 9 library access is not active." });
    }

    const objectPath = `grade9/mathematics/term-${term.toLowerCase()}.json`;
    const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
    const objectResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/${BUCKET}/${encodedPath}`,
      {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        cache: "no-store"
      }
    );
    if (objectResponse.status === 404) {
      return respond(503, { message: "This term's source-based lessons are not available yet." });
    }
    if (!objectResponse.ok) throw new Error("Private lesson retrieval failed.");

    const storedContent = await objectResponse.json();
    const content = normalizeForLibrary(storedContent, term);
    return respond(200, { success: true, term, content });
  } catch (error) {
    console.error("Grade 9 Mathematics content error:", error.message);
    return respond(500, { message: "Unable to load this term. Please try again." });
  }
};
