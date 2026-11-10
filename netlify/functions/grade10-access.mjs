const reply = (status, data) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
});
export default async (request) => {
  if (request.method !== "GET") return reply(405, { success: false, message: "GET only." });
  const url = Netlify.env.get("SUPABASE_URL");
  const key = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !key) return reply(500, { success: false, message: "Access service is not configured." });
  if (!token) return reply(401, { success: false, message: "Please sign in first." });
  const auth = await fetch(`${url}/auth/v1/user`, { headers: {
    apikey: "sb_publishable_uaOcRVaIwnvRl_wZhMhJ-Q_DhrqZyS_", Authorization: `Bearer ${token}`
  }});
  if (!auth.ok) return reply(401, { success: false, message: "Please sign in again." });
  const user = await auth.json();
  const q = new URLSearchParams({
    user_id: `eq.${user.id}`, product_id: "eq.career_guidance_full_package",
    active: "eq.true", expires_at: `gt.${new Date().toISOString()}`, select: "id", limit: "1"
  });
  const ent = await fetch(`${url}/rest/v1/entitlements?${q}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  if (!ent.ok) return reply(500, { success: false, message: "Could not verify Career Guidance access." });
  const rows = await ent.json();
  return reply(200, { success: true, paid: rows.length > 0, product_id: "career_guidance_full_package" });
};
