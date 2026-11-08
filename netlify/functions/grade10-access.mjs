export default async (request) => {
  const respond = (status, data) => new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
  if (request.method !== "GET") return respond(405, { success: false, message: "Only GET requests are allowed." });
  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const serviceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publishableKey = "sb_publishable_uaOcRVaIwnvRl_wZhMhJ-Q_DhrqZyS_";
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!supabaseUrl || !serviceKey) return respond(500, { success: false, message: "Access service is not configured." });
  if (!token) return respond(401, { success: false, message: "Please sign in first." });
  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: publishableKey, Authorization: `Bearer ${token}` } });
    if (!userResponse.ok) return respond(401, { success: false, message: "Your session is invalid. Please sign in again." });
    const user = await userResponse.json();
    const query = `${supabaseUrl}/rest/v1/entitlements?user_id=eq.${encodeURIComponent(user.id)}&product_id=eq.grade10_selection_form&active=eq.true&select=id,expires_at&limit=1`;
    const accessResponse = await fetch(query, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    if (!accessResponse.ok) return respond(500, { success: false, message: "Could not check your access." });
    const rows = await accessResponse.json();
    const row = rows[0];
    const active = !!row && (row.expires_at === null || new Date(row.expires_at).getTime() > Date.now());
    return respond(200, { success: true, paid: active, permanent: active && row.expires_at === null });
  } catch (error) {
    console.error("Grade 10 access check failed:", error.message);
    return respond(500, { success: false, message: "Unable to verify access right now." });
  }
};
