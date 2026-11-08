import { TEACHER_RESOURCES } from "./teacher-resource-catalog.mjs";

const json = (status, data) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" }
});

export default async (request) => {
  if (request.method !== "POST") return json(405, { success: false, message: "Only POST is allowed." });

  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const serviceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publishableKey = "sb_publishable_uaOcRVaIwnvRl_wZhMhJ-Q_DhrqZyS_";
  const consumerKey = Netlify.env.get("MPESA_CONSUMER_KEY");
  const consumerSecret = Netlify.env.get("MPESA_CONSUMER_SECRET");
  const shortcode = Netlify.env.get("MPESA_SHORTCODE");
  const passkey = Netlify.env.get("MPESA_PASSKEY");
  const callbackURL = Netlify.env.get("MPESA_CALLBACK_URL");
  if (!supabaseUrl || !serviceKey || !consumerKey || !consumerSecret || !shortcode || !passkey || !callbackURL?.startsWith("https://")) {
    return json(500, { success: false, message: "Payment configuration is incomplete." });
  }

  const auth = request.headers.get("authorization") || "";
  const accessToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!accessToken) return json(401, { success: false, message: "Please sign in first." });
  const body = await request.json().catch(() => ({}));
  const resource = TEACHER_RESOURCES[String(body.resource_id || "")];
  if (!resource) return json(400, { success: false, message: "The selected resource is not recognised." });

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` }
  });
  if (!authResponse.ok) return json(401, { success: false, message: "Your session is invalid. Please sign in again." });
  const user = await authResponse.json();
  if (!user.id) return json(401, { success: false, message: "Account verification failed." });

  let phone = String(body.phone || "").replace(/[\s+-]/g, "");
  if (phone.startsWith("0")) phone = `254${phone.slice(1)}`;
  if (!/^254[17]\d{8}$/.test(phone)) return json(400, { success: false, message: "Enter a valid Kenyan M-Pesa number." });

  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  let orderId = null;
  let paymentId = null;
  try {
    const orderRes = await fetch(`${supabaseUrl}/rest/v1/teacher_download_orders`, {
      method: "POST", headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: user.id, grade: resource.grade, resource_id: resource.resource_id,
        subject: resource.subject, resource_type: resource.resource_type,
        period: resource.period, amount: resource.amount,
        storage_path: resource.storage_path, status: "awaiting_payment"
      })
    });
    const orderRows = await orderRes.json();
    if (!orderRes.ok || !orderRows[0]?.id) throw new Error("Could not create the download order.");
    orderId = orderRows[0].id;

    const payRes = await fetch(`${supabaseUrl}/rest/v1/payments`, {
      method: "POST", headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ user_id: user.id, phone, amount: resource.amount, product_id: "teacher_download", status: "pending" })
    });
    const payRows = await payRes.json();
    if (!payRes.ok || !payRows[0]?.id) throw new Error("Could not create the payment record.");
    paymentId = payRows[0].id;

    const linkRes = await fetch(`${supabaseUrl}/rest/v1/teacher_download_orders?id=eq.${orderId}`, {
      method: "PATCH", headers, body: JSON.stringify({ payment_id: paymentId })
    });
    if (!linkRes.ok) throw new Error("Could not link the payment to its download order.");

    const basic = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    const tokenRes = await fetch("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", { headers: { Authorization: `Basic ${basic}` } });
    const token = await tokenRes.json();
    if (!tokenRes.ok || !token.access_token) throw new Error("Safaricom authentication failed.");
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const part = (name) => parts.find(x => x.type === name).value;
    const timestamp = part("year") + part("month") + part("day") + part("hour") + part("minute") + part("second");
    const password = Buffer.from(shortcode + passkey + timestamp).toString("base64");
    const stkRes = await fetch("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
      method: "POST", headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ BusinessShortCode: shortcode, Password: password, Timestamp: timestamp, TransactionType: "CustomerPayBillOnline", Amount: resource.amount, PartyA: phone, PartyB: shortcode, PhoneNumber: phone, CallBackURL: callbackURL, AccountReference: "JSLH-TEACHER", TransactionDesc: "Teacher Centre resource download" })
    });
    const stk = await stkRes.json();
    if (!stkRes.ok || stk.ResponseCode !== "0") throw new Error(stk.errorMessage || stk.ResponseDescription || "Safaricom could not start the payment.");
    const update = await fetch(`${supabaseUrl}/rest/v1/payments?id=eq.${paymentId}`, {
      method: "PATCH", headers, body: JSON.stringify({ checkout_request_id: stk.CheckoutRequestID, merchant_request_id: stk.MerchantRequestID })
    });
    if (!update.ok) throw new Error("Payment started but its record needs attention. Do not retry yet.");
    return json(200, { success: true, order_id: orderId, message: stk.CustomerMessage || "Check your phone and enter your M-Pesa PIN." });
  } catch (error) {
    if (paymentId) await fetch(`${supabaseUrl}/rest/v1/payments?id=eq.${paymentId}`, { method: "PATCH", headers, body: JSON.stringify({ status: "failed", result_desc: "Teacher Centre payment initiation failed." }) }).catch(() => {});
    if (orderId) await fetch(`${supabaseUrl}/rest/v1/teacher_download_orders?id=eq.${orderId}`, { method: "PATCH", headers, body: JSON.stringify({ status: "failed" }) }).catch(() => {});
    return json(502, { success: false, message: error.message || "Could not start payment." });
  }
};
