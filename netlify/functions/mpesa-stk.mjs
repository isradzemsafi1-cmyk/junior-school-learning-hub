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

  const supabaseUrl = Netlify.env.get("SUPABASE_URL");

  const publishableKey =
    "sb_publishable_uaOcRVaIwnvRl_wZhMhJ-Q_DhrqZyS_";

  const serviceKey =
    Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const requestHost = new URL(request.url).hostname.toLowerCase();
  const deployContext =
    Netlify.env.get("CONTEXT") ||
    process.env.CONTEXT ||
    process.env.NETLIFY_CONTEXT ||
    "";
  // Netlify's system CONTEXT was not reliably visible in the runtime for this
  // site. The canonical custom domain is an unambiguous production signal;
  // deploy-preview netlify.app hosts remain sandbox-only.
  const isProduction =
    deployContext === "production" ||
    requestHost === "juniorschoollearninghub.co.ke" ||
    requestHost === "www.juniorschoollearninghub.co.ke";
  // Keep sandbox and live Daraja credentials strictly separated. The sandbox
  // shortcode/passkey below are Safaricom's published test values.
  const consumerKey = isProduction
    ? (Netlify.env.get("MPESA_PRODUCTION_CONSUMER_KEY") || Netlify.env.get("MPESA_CONSUMER_KEY"))
    : Netlify.env.get("MPESA_SANDBOX_CONSUMER_KEY");
  const consumerSecret = isProduction
    ? (Netlify.env.get("MPESA_PRODUCTION_CONSUMER_SECRET") || Netlify.env.get("MPESA_CONSUMER_SECRET"))
    : Netlify.env.get("MPESA_SANDBOX_CONSUMER_SECRET");
  const shortcode = isProduction
    ? (Netlify.env.get("MPESA_PRODUCTION_SHORTCODE") || Netlify.env.get("MPESA_SHORTCODE"))
    : (Netlify.env.get("MPESA_SANDBOX_SHORTCODE"));
  const tillNumber = isProduction
    ? (Netlify.env.get("MPESA_PRODUCTION_TILL_NUMBER") || Netlify.env.get("MPESA_TILL_NUMBER"))
    : shortcode;
  const passkey = isProduction
    ? (Netlify.env.get("MPESA_PRODUCTION_PASSKEY") || Netlify.env.get("MPESA_PASSKEY"))
    : (Netlify.env.get("MPESA_SANDBOX_PASSKEY"));
  // Always use the explicitly configured, public HTTPS callback. Its path
  // must be Daraja-safe (payment-callback), without provider-reserved words.
  const callbackURL = Netlify.env.get("MPESA_CALLBACK_URL") || "";
  let callbackHost = "invalid";
  try {
    const parsedCallback = new URL(callbackURL);
    callbackHost = parsedCallback.host;
    if (parsedCallback.protocol !== "https:" ||
        /localhost|127\.0\.0\.1/i.test(parsedCallback.hostname)) {
      throw new Error("Callback URL must be a public HTTPS address.");
    }
  } catch {
    return respond(500, {
      success: false,
      message: "The M-PESA callback URL is invalid. Configure MPESA_CALLBACK_URL as a public HTTPS endpoint or verify the Netlify site URL."
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


  const missing = [
    ["SUPABASE_URL", supabaseUrl],
    ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
    [isProduction ? "MPESA_PRODUCTION_CONSUMER_KEY" : "MPESA_SANDBOX_CONSUMER_KEY", consumerKey],
    [isProduction ? "MPESA_PRODUCTION_CONSUMER_SECRET" : "MPESA_SANDBOX_CONSUMER_SECRET", consumerSecret],
    [isProduction ? "MPESA_PRODUCTION_SHORTCODE" : "MPESA_SANDBOX_SHORTCODE", shortcode],
    ...(isProduction ? [["MPESA_PRODUCTION_TILL_NUMBER", tillNumber]] : []),
    [isProduction ? "MPESA_PRODUCTION_PASSKEY" : "MPESA_SANDBOX_PASSKEY", passkey]
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length) {
    console.error("Missing payment configuration:", missing);
    return respond(500, {
      success: false,
      environment: isProduction ? "production" : "sandbox",
      message: isProduction
        ? "Production M-Pesa configuration is incomplete. Please contact the site administrator."
        : "Sandbox M-Pesa credentials are not configured for this deploy preview. No payment was initiated. Configure sandbox credentials in Netlify to test preview payments.",
      missing
    });
  }



  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json"
  };
const mpesaBaseUrl = isProduction
  ? "https://api.safaricom.co.ke"
  : "https://sandbox.safaricom.co.ke";
  let paymentId;
const readJson = async (response, service) => {
  const raw = await response.text();

  if (!raw.trim()) {
    throw new Error(
      `${service} returned an empty response. HTTP ${response.status}`
    );
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      `${service} returned invalid JSON. HTTP ${response.status}`
    );
  }
};
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

    const user = await readJson(authResponse, "Supabase authentication");

    if (!user.id) {
      return respond(401, {
        success: false,
        message: "Learner account could not be verified."
      });
    }

    const productId = String(body.product_id || "");
    let isRevisionResource = false;
    if (/^kjsea2027_[a-z0-9_]{3,80}$/.test(productId)) {
      const resourceCheck = await fetch(
        `${supabaseUrl}/rest/v1/learner_revision_resources?id=eq.${encodeURIComponent(productId)}&published=eq.true&select=id,price_kes&limit=1`,
        { headers: dbHeaders }
      );
      if (!resourceCheck.ok) throw new Error("Could not validate KJSEA revision resource.");
      const resources = await resourceCheck.json();
      isRevisionResource = resources.length === 1 && Number(resources[0].price_kes) === 10;
    }
    if (!isRevisionResource && !Object.prototype.hasOwnProperty.call(catalog, productId)) {
      return respond(400, {
        success: false,
        message: "Please select a valid learning product."
      });
    }

    const amount = isRevisionResource ? 10 : catalog[productId];

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

    const paymentRows = await readJson(paymentResponse, "Supabase payment record");

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
      `${mpesaBaseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${credentials}`
        }
      }
    );

    const tokenData = await readJson(tokenResponse, "Safaricom OAuth");

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

    const transactionType = isProduction
      ? "CustomerBuyGoodsOnline"
      : "CustomerPayBillOnline";
    const partyB = isProduction ? tillNumber : shortcode;

    console.log("Starting M-PESA STK request", {
      environment: isProduction ? "production" : "sandbox",
      businessShortCode: shortcode,
      partyB,
      transactionType,
      callbackHost
    });

    const stkResponse = await fetch(
      `${mpesaBaseUrl}/mpesa/stkpush/v1/processrequest`,
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
          TransactionType: transactionType,
          Amount: amount,
          PartyA: phone,
          PartyB: partyB,
          PhoneNumber: phone,
          CallBackURL: callbackURL,
          AccountReference: "JSLH",
          TransactionDesc: "Learning Hub Payment"
        })
      }
    );

    const result = await readJson(stkResponse, "Safaricom STK Push");

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

      // Keep the provider diagnostics useful without exposing credentials,
      // payer phone numbers, payment IDs, or the complete callback URL.
      console.error("Safaricom rejected STK initiation", {
        httpStatus: stkResponse.status,
        providerErrorCode: result.errorCode || result.ResponseCode || null,
        providerRequestId: result.requestId || result.RequestId || null,
        callbackHost,
        environment: isProduction ? "production" : "sandbox",
        message: result.errorMessage || result.ResponseDescription || null
      });
      return respond(502, {
        success: false,
        message: result.errorMessage ||
          result.ResponseDescription ||
          "Safaricom could not initiate payment.",
        providerErrorCode: result.errorCode || result.ResponseCode || null,
        providerRequestId: result.requestId || result.RequestId || null,
        callbackHost,
        environment: isProduction ? "production" : "sandbox"
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
