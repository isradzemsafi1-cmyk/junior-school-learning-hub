const respond = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
export default async (request) => {
  if (request.method !== "POST") return respond(405, { error: "Method not allowed." });
  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const serviceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return respond(500, { error: "Account registration is not configured. Please contact support." });
  try {
    const body = await request.json();
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    const fullName = String(body.full_name || "").trim();
    const grade = String(body.grade || "").trim();
    if (!/^[a-z0-9][a-z0-9._-]{3,19}$/.test(username)) return respond(400, { error: "Choose a username with 4–20 letters or numbers. You may also use dot, dash or underscore." });
    if (password.length < 8) return respond(400, { error: "Use a password with at least 8 characters." });
    if (!fullName || !grade) return respond(400, { error: "Enter the learner's name and grade." });
    // Reserved internal alias: Supabase password authentication, with no email delivery or confirmation.
    const email = `${username}@learners.juniorschoollearninghub.co.ke`;
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, { method: "POST", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: fullName, grade, username, registration_method: "username_password", phone: body.phone || null, guardian_name: body.guardian_name || null, guardian_phone: body.guardian_phone || null } }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = result.msg || result.message || result.error_description || "Could not create the account.";
      if (/already|registered|exists/i.test(message)) return respond(409, { error: "That username is already taken. Please choose another one or sign in." });
      return respond(response.status, { error: message });
    }
    return respond(201, { success: true, email, message: "Account created. Sign in using your username and password." });
  } catch {
    return respond(500, { error: "Registration failed. Please try again or contact support." });
  }
};
