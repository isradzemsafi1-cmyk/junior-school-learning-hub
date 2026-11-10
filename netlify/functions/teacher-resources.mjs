import { teacherCatalog } from "../lib/teacher-catalog.mjs";

const SUPABASE_URL = () => Netlify.env.get("SUPABASE_URL");
const SERVICE_KEY = () => Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
const PUBLISHABLE_KEY = "sb_publishable_uaOcRVaIwnvRl_wZhMhJ-Q_DhrqZyS_";
const BUCKET = "teacher-premium";

const reply = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers }
  });

async function getUser(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL()}/auth/v1/user`, {
    headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? { id: u.id, token } : null;
}

async function hasAccess(userId, productId) {
  const q = new URLSearchParams({
    user_id: `eq.${userId}`, product_id: `eq.${productId}`,
    active: "eq.true", expires_at: `gt.${new Date().toISOString()}`,
    select: "id", limit: "1"
  });
  const r = await fetch(`${SUPABASE_URL()}/rest/v1/entitlements?${q}`, {
    headers: { apikey: SERVICE_KEY(), Authorization: `Bearer ${SERVICE_KEY()}` }
  });
  if (!r.ok) throw new Error("Could not verify resource access.");
  return (await r.json()).length > 0;
}

function itemsForGrade(grade) {
  return (teacherCatalog[String(grade)] || []).map(item => ({
    product_id: item.product_id, subject: item.subject, category: item.category,
    label: item.label, price_kes: item.price_kes, path: item.path, storage_path: item.storage_path
  }));
}

export default async (request) => {
  if (request.method !== "GET") return reply(405, { success: false, message: "GET only." });
  if (!SUPABASE_URL() || !SERVICE_KEY()) return reply(500, { success: false, message: "Resource service is not configured." });

  const user = await getUser(request);
  if (!user) return reply(401, { success: false, message: "Please sign in to your learner account first." });

  const url = new URL(request.url);
  const grade = url.searchParams.get("grade");
  if (!["8", "9"].includes(grade)) return reply(400, { success: false, message: "Choose Grade 8 or Grade 9." });

  try {
    const all = itemsForGrade(grade);
    const path = url.searchParams.get("path");
    if (path) {
      const item = (teacherCatalog[grade] || []).find(x => x.storage_path === path);
      if (!item) return reply(404, { success: false, message: "Resource not found." });
      if (!(await hasAccess(user.id, item.product_id))) return reply(403, { success: false, message: "This resource is locked. Purchase it to unlock access." });
      const file = await fetch(`${SUPABASE_URL()}/storage/v1/object/${BUCKET}/${item.storage_path}`, {
        headers: { apikey: SERVICE_KEY(), Authorization: `Bearer ${SERVICE_KEY()}` }
      });
      if (!file.ok) return reply(404, { success: false, message: "The protected PDF has not been uploaded yet." });
      const headers = new Headers({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${item.filename.replace(/["\\]/g, "")}"`,
        "Cache-Control": "private, no-store"
      });
      return new Response(file.body, { status: 200, headers });
    }

    const withAccess = await Promise.all(all.map(async item => ({
      ...item, unlocked: await hasAccess(user.id, item.product_id)
    })));
    return reply(200, { success: true, grade, resources: withAccess });
  } catch (e) {
    console.error("Teacher resource error:", e.message);
    return reply(500, { success: false, message: "Could not load protected teacher resources." });
  }
};
