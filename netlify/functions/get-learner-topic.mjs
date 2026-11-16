import { grade8Content, grade8Metadata } from "../content/grade8-mathematics-content.mjs";

const respond = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
});

export default async (request) => {
  if (request.method !== "GET") return respond(405, { message: "Method not allowed." });
  const url = new URL(request.url);
  const resourceId = url.searchParams.get("resource_id");
  if (!resourceId) return respond(200, { success: true, resources: grade8Metadata });

  const match = /^learner_g8_[a-z0-9-]{1,70}$/.test(resourceId);
  if (!match) return respond(404, { message: "Learning topic not found." });
  const index = grade8Metadata.findIndex(item => item.resource_id === resourceId);
  if (index < 0) return respond(404, { message: "Learning topic not found." });

  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const serviceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publishableKey = Netlify.env.get("SUPABASE_PUBLISHABLE_KEY") || "sb_publishable_uaOcRVaIwnvRl_wZhMhJ-Q_DhrqZyS_";
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!supabaseUrl || !serviceKey || !publishableKey) return respond(500, { message: "Server configuration error." });
  if (!token) return respond(401, { message: "Sign in with your learner account to continue." });

  try {
    const auth = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` }
    });
    if (!auth.ok) return respond(401, { message: "Your learner session has expired. Please sign in again." });
    const user = await auth.json();
    if (!user?.id) return respond(401, { message: "Learner account could not be verified." });

    const productId = resourceId;
    const entitlementUrl = `${supabaseUrl}/rest/v1/entitlements?user_id=eq.${encodeURIComponent(user.id)}&product_id=eq.${encodeURIComponent(productId)}&active=eq.true&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=expires_at&order=expires_at.desc&limit=1`;
    const accessResponse = await fetch(entitlementUrl, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
    });
    if (!accessResponse.ok) throw new Error("Entitlement verification failed.");
    const access = await accessResponse.json();
    if (!access.length) return respond(403, { message: "This topic is locked. Pay KES 10 to unlock it for 24 hours.", resource_id: productId });
    return respond(200, { success: true, resource: grade8Content[index], expires_at: access[0].expires_at });
  } catch (error) {
    console.error("Grade 8 topic access error:", error.message);
    return respond(500, { message: "Unable to verify topic access. Please try again." });
  }
};
