import grade9Content from "../content/grade9-library-content.mjs";

// Returns the Grade 9 library content only to a signed-in learner whose
// grade9_notes entitlement is active and has not expired.
// Follows the same verification steps as get-grade7-library.
export default async (request) => {
  const respond = (status, data) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });

  if (request.method !== "GET") {
    return respond(405, { message: "Method not allowed." });
  }

  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const serviceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publishableKey =
    "sb_publishable_uaOcRVaIwnvRl_wZhMhJ-Q_DhrqZyS_";

  if (!supabaseUrl || !serviceKey) {
    return respond(500, { message: "Server configuration error." });
  }

  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!token) {
      return respond(401, { message: "Please log in first." });
    }

    const auth = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${token}`
      }
    });

    if (!auth.ok) {
      return respond(401, { message: "Invalid login session." });
    }

    const user = await auth.json();

    if (!user?.id) {
      return respond(401, { message: "Learner account could not be verified." });
    }

    const entitlementUrl =
      `${supabaseUrl}/rest/v1/entitlements` +
      `?user_id=eq.${encodeURIComponent(user.id)}` +
      `&product_id=eq.grade9_notes` +
      `&active=eq.true` +
      `&expires_at=gt.${encodeURIComponent(new Date().toISOString())}` +
      `&select=id,expires_at&limit=1`;

    const entitlement = await fetch(entitlementUrl, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      }
    });

    if (!entitlement.ok) {
      throw new Error("Could not verify learner access.");
    }

    const access = await entitlement.json();

    if (!access.length) {
      return respond(403, {
        message: "Grade 9 library access is not active. Please purchase access."
      });
    }

    return respond(200, {
      success: true,
      expires_at: access[0].expires_at,
      content: grade9Content
    });

  } catch (error) {
    console.error("Grade 9 library error:", error.message);

    return respond(500, {
      message: "Unable to load the Grade 9 library. Please try again."
    });
  }
};
