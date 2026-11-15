export default async (request) => {
  const respond = (status, data) => new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
  if (request.method !== "GET") return respond(405, { success: false, message: "Method not allowed." });
  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const serviceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publishableKey = Netlify.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !serviceKey || !publishableKey) return respond(500, { success: false, message: "Server configuration error." });
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return respond(401, { success: false, message: "Please log in first." });
  try {
    const auth = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` }
    });
    if (!auth.ok) return respond(401, { success: false, message: "Your login session is invalid. Please log in again." });
    const user = await auth.json();
    if (!user?.id) return respond(401, { success: false, message: "Learner account could not be verified." });
    const url = `${supabaseUrl}/rest/v1/entitlements?user_id=eq.${encodeURIComponent(user.id)}&product_id=eq.learner_centre_access&active=eq.true&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,expires_at&limit=1`;
    const accessResponse = await fetch(url, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    if (!accessResponse.ok) throw new Error("Could not verify Learner Centre access.");
    const rows = await accessResponse.json();
    if (!rows.length) return respond(403, { success: false, paid: false, message: "Learner Centre access is locked. Pay KES 10 for 24-hour access.", price: 10, duration_hours: 24 });
    return respond(200, { success: true, paid: true, expires_at: rows[0].expires_at });
  } catch (error) {
    console.error("Learner Centre access check failed:", error.message);
    return respond(500, { success: false, message: "Unable to verify access right now. Please try again." });
  }
};
