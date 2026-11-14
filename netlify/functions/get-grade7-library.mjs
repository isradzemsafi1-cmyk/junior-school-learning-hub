
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
  const publishableKey = Netlify.env.get("SUPABASE_PUBLISHABLE_KEY");

  if (!supabaseUrl || !serviceKey || !publishableKey) {
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

    const entitlementUrl =
      `${supabaseUrl}/rest/v1/entitlements` +
      `?user_id=eq.${encodeURIComponent(user.id)}` +
      `&product_id=eq.grade7_notes` +
      `&active=eq.true` +
      `&expires_at=gt.${encodeURIComponent(new Date().toISOString())}` +
      `&select=id&limit=1`;

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
        message: "Grade 7 library access is not active. Please purchase access."
      });
    }

    const contentUrl =
      `${supabaseUrl}/storage/v1/object/` +
      `premium-learning-content/grade7-library-content.json`;

    const contentResponse = await fetch(contentUrl, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      }
    });

    if (!contentResponse.ok) {
      throw new Error("Could not retrieve learning content.");
    }

    const content = await contentResponse.json();

    return respond(200, {
      success: true,
      content
    });

  } catch (error) {
    console.error("Grade 7 library error:", error.message);

    return respond(500, {
      message: "Unable to load the Grade 7 library. Please try again."
    });
  }
};
