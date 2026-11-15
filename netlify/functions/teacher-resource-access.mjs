const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
});

export default async (request) => {
  if (request.method !== "POST") return json(405, { success: false, message: "POST required." });

  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const serviceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Netlify.env.get("SUPABASE_ANON_KEY") || Netlify.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) return json(500, { success: false, message: "Secure resource access is not configured." });

  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json(401, { success: false, message: "Sign in to access purchased resources." });

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` }
    });
    if (!userResponse.ok) return json(401, { success: false, message: "Your session has expired. Sign in again." });
    const user = await userResponse.json();
    const { resource_id } = await request.json();
    if (typeof resource_id !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(resource_id)) return json(400, { success: false, message: "Invalid resource." });

    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
    const purchaseResponse = await fetch(
      `${supabaseUrl}/rest/v1/teacher_resource_purchases?user_id=eq.${encodeURIComponent(user.id)}&resource_id=eq.${encodeURIComponent(resource_id)}&status=eq.paid&select=id&limit=1`,
      { headers }
    );
    if (!purchaseResponse.ok) throw new Error("Purchase lookup failed.");
    const purchases = await purchaseResponse.json();
    if (!purchases.length) return json(403, { success: false, message: "Purchase this resource to unlock permanent access." });

    const catalogResponse = await fetch(
      `${supabaseUrl}/rest/v1/teacher_resource_catalog?id=eq.${encodeURIComponent(resource_id)}&active=eq.true&select=storage_path&limit=1`,
      { headers }
    );
    if (!catalogResponse.ok) throw new Error("Resource lookup failed.");
    const catalog = await catalogResponse.json();
    if (!catalog.length) return json(404, { success: false, message: "Resource is unavailable." });

    const signedResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/sign/teacher-resources-private/${catalog[0].storage_path.split("/").map(encodeURIComponent).join("/")}`,
      { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 300 }) }
    );
    const signed = await signedResponse.json();
    if (!signedResponse.ok || !signed.signedURL) throw new Error("Could not create secure download link.");
    const url = signed.signedURL.startsWith("http") ? signed.signedURL : `${supabaseUrl}/storage/v1${signed.signedURL}`;
    return json(200, { success: true, url, expires_in_seconds: 300 });
  } catch (error) {
    console.error("Teacher resource access error:", error.message);
    return json(500, { success: false, message: "Could not open the purchased resource. Please try again." });
  }
};
