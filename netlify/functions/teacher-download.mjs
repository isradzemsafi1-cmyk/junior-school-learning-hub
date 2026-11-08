const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export default async (request) => {
  if (request.method !== "POST") return json(405, { success: false, message: "Only POST is allowed." });
  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const serviceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publishableKey = "sb_publishable_uaOcRVaIwnvRl_wZhMhJ-Q_DhrqZyS_";
  if (!supabaseUrl || !serviceKey) return json(500, { success: false, message: "Download service is not configured." });
  const auth = request.headers.get("authorization") || "";
  const accessToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!accessToken) return json(401, { success: false, message: "Please sign in first." });
  const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` } });
  if (!authRes.ok) return json(401, { success: false, message: "Your session is invalid." });
  const user = await authRes.json();
  const { order_id } = await request.json().catch(() => ({}));
  if (!order_id || !/^[0-9a-f-]{36}$/i.test(order_id)) return json(400, { success: false, message: "A valid download order is required." });
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  const orderRes = await fetch(`${supabaseUrl}/rest/v1/teacher_download_orders?id=eq.${order_id}&user_id=eq.${user.id}&status=eq.paid&download_count=eq.0&select=*`, { headers });
  const rows = await orderRes.json();
  const order = rows[0];
  if (!order) return json(403, { success: false, message: "This download is not available. Confirm payment or make a new purchase." });
  // Only accept paths created from the trusted server-side resource catalogue.
  if (!/^grade[89]\/[A-Za-z0-9 _()&.'-]+(?:\/[A-Za-z0-9 _()&.'-]+)*\.pdf$/i.test(order.storage_path)) return json(400, { success: false, message: "Invalid resource path." });
  const fileRes = await fetch(`${supabaseUrl}/storage/v1/object/authenticated/teacher-resources/${order.storage_path.split('/').map(encodeURIComponent).join('/')}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
  if (!fileRes.ok) return json(502, { success: false, message: "The resource file is not yet available in private storage." });
  // Atomically consume the paid order so a later visit requires another payment.
  const consumeRes = await fetch(`${supabaseUrl}/rest/v1/teacher_download_orders?id=eq.${order.id}&user_id=eq.${user.id}&status=eq.paid&download_count=eq.0`, {
    method: "PATCH", headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({ status: "downloaded", download_count: 1, downloaded_at: new Date().toISOString() })
  });
  const consumed = await consumeRes.json();
  if (!consumeRes.ok || !consumed.length) return json(409, { success: false, message: "This download has already been used. Please start a new purchase." });
  const filename = order.storage_path.split('/').pop().replace(/[\r\n"\\]/g, "_");
  return new Response(fileRes.body, { status: 200, headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"
  }});
};
