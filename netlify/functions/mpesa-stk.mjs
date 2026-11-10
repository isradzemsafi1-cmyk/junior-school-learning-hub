import { teacherCatalog } from "../lib/teacher-catalog.mjs";


export default async (request) => {
  const respond = (status, data) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    });

  if (request.method !== "POST") {
    return respond(405, {
      success: false,
      message: "Only POST requests are allowed."
    });
  }

  const catalog = {
    online_tuition: 100,
    premium_quizzes: 20,
    grade7_notes: 10,
    grade8_notes: 10,
    grade9_notes: 30,
    career_guidance_full_package: 30,
    grade10_selection_form: 30,
    ...Object.fromEntries(
      Object.values(teacherCatalog).flat().map(item => [item.product_id, item.price_kes])
    )
  };

  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const publishableKey =
    "sb_publishable_uaOcRVaIwnvRl_wZhMhJ-Q_DhrqZyS_";
  const serviceKey =
    Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const consumerKey = Netlify.env.get("MPESA_CONSUMER_KEY");
  const consumerSecret = Netlify.env.get("MPESA_CONSUMER_SECRET");
  const shortcode = Netlify.env.get("MPESA_SHORTCODE");
  const tillNumber = Netlify.env.get("MPESA_TILL_NUMBER");
  const passkey = Netlify.env.get("MPESA_PASSKEY");
  const callbackURL = Netlify.env.get("MPESA_CALLBACK_URL");

  if (!supabaseUrl || !serviceKey || !consumerKey ||
      !consumerSecret || !shortcode || !tillNumber ||
      !passkey || !callbackURL) {
    return respond(500, {
      success: false,
      message: "const missing = [
  ["SUPABASE_URL", supabaseUrl],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
  ["MPESA_CONSUMER_KEY", consumerKey],
  ["MPESA_CONSUMER_SECRET", consumerSecret],
  ["MPESA_SHORTCODE", shortcode],
  ["MPESA_TILL_NUMBER", tillNumber],
  ["MPESA_PASSKEY", passkey],
  ["MPESA_CALLBACK_URL", callbackURL]
].filter(([, value]) => !value).map(([name]) => name);

if (missing.length) {
  console.error("Missing payment configuration:", missing);
  return respond(500, {
    success: false,
    message: "Payment configuration is incomplete.",
    missing
  });
}"
    });
  }

  if (!callbackURL.startsWith("https://")) {
    return respond(500, {
      success: false,
      message: "A secure HTTPS callback URL is required."
    });
  }

  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json"
  };

  let paymentId;

  try {
    const body = await request.json();

    const authHeader = request.headers.get("authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!accessToken) {
      return respond(401, {
        success: false,
        message: "Please log in first."
      });
    }

    const authResponse = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    if (!authResponse.ok) {
      return respond(401, {
        success: false,
        message: "Please log in again."
      });
    }

    const user = await authResponse.json();

    if (!user.id) {
      return respond(401, {
        success: false,
        message: "Learner account could not be verified."
      });
    }

    const productId = String(body.product_id || "");

    if (!Object.prototype.hasOwnProperty.call(catalog, productId)) {
      return respond(400, {
        success: false,
        message: "Please select a valid learning product."
      });
    }

    const amount = catalog[productId];

    let phone = String(body.phone || "").replace(/[\s+-]/g, "");

    if (phone.startsWith("0")) {
      phone = "254" + phone.slice(1);
    }

    if (!/^254[17]\d{8}$/.test(phone)) {
      return respond(400, {
        success: false,
        message: "Enter a valid Kenyan M-Pesa number."
      });
    }

    const paymentResponse = await fetch(
      `${supabaseUrl}/rest/v1/payments`,
      {
        method: "POST",
        headers: {
          ...dbHeaders,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          user_id: user.id,
          phone,
          amount,
          product_id: productId,
          status: "pending"
        })
      }
    );

    const paymentRows = await paymentResponse.json();

    if (!paymentResponse.ok || !paymentRows[0]?.id) {
      return respond(500, {
        success: false,
        message: "Could not save payment record."
      });
    }

    paymentId = paymentRows[0].id;

    const credentials = Buffer.from(
      `${consumerKey}:${consumerSecret}`
    ).toString("base64");

    const tokenResponse = await fetch(
      "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${credentials}`
        }
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error("Safaricom authentication failed.");
    }

    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Nairobi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date());

    const get = type =>
      parts.find(part => part.type === type).value;

    const timestamp =
      get("year") + get("month") + get("day") +
      get("hour") + get("minute") + get("second");

    const password = Buffer.from(
      shortcode + passkey + timestamp
    ).toString("base64");

    const stkResponse = await fetch(
      "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          BusinessShortCode: shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerBuyGoodsOnline",
          Amount: amount,
          PartyA: phone,
          PartyB: tillNumber,
          PhoneNumber: phone,
          CallBackURL: callbackURL,
          AccountReference: "JSLH",
          TransactionDesc: "Learning Hub Payment"
        })
      }
    );

    const result = await stkResponse.json();

    if (!stkResponse.ok || result.ResponseCode !== "0") {
      await fetch(
        `${supabaseUrl}/rest/v1/payments?id=eq.${paymentId}`,
        {
          method: "PATCH",
          headers: dbHeaders,
          body: JSON.stringify({
            status: "failed",
            result_desc: result.errorMessage ||
              result.ResponseDescription ||
              "Safaricom could not initiate payment."
          })
        }
      );

      return respond(502, {
        success: false,
        message: result.errorMessage ||
          result.ResponseDescription ||
          "Safaricom could not initiate payment."
      });
    }

    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/payments?id=eq.${paymentId}`,
      {
        method: "PATCH",
        headers: dbHeaders,
        body: JSON.stringify({
          checkout_request_id: result.CheckoutRequestID,
          merchant_request_id: result.MerchantRequestID
        })
      }
    );

    if (!updateResponse.ok) {
      return respond(500, {
        success: false,
        message: "Payment initiated. Record update needs attention."
      });
    }

    return respond(200, {
      success: true,
      message: result.CustomerMessage ||
        "Payment request sent. Check your phone.",
      checkoutRequestId: result.CheckoutRequestID
    });

  } catch (error) {
    console.error("STK initiation error:", error.message);

    if (paymentId) {
      await fetch(
        `${supabaseUrl}/rest/v1/payments?id=eq.${paymentId}`,
        {
          method: "PATCH",
          headers: dbHeaders,
          body: JSON.stringify({
            status: "failed",
            result_desc: "Payment initiation could not be completed."
          })
        }
      ).catch(() => {});
    }

    return respond(500, {
      success: false,
      message: "Unable to process payment. Please try again later."
    });
  }
};
