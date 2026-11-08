
export default async (request) => {
  const respond = (status, data) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    });

  if (request.method !== "POST") {
    return respond(405, {
      success: false,
      message: "Method not allowed."
    });
  }

  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const serviceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const consumerKey = Netlify.env.get("MPESA_CONSUMER_KEY");
  const consumerSecret = Netlify.env.get("MPESA_CONSUMER_SECRET");
  const shortcode = Netlify.env.get("MPESA_SHORTCODE");
  const passkey = Netlify.env.get("MPESA_PASSKEY");

  if (!supabaseUrl || !serviceKey || !consumerKey ||
      !consumerSecret || !shortcode || !passkey) {
    console.error("Callback configuration is incomplete.");
    return respond(500, { success: false });
  }

  const catalog = {
    online_tuition: 100,
    premium_quizzes: 20,
    grade7_notes: 10,
    grade8_notes: 10,
    grade9_notes: 30,
    grade10_selection_form: 30,
    teacher_download: null
  };

  const durations = {
    grade7_notes: 12,
    grade8_notes: 12,
    grade9_notes: 24,
    online_tuition: 24,
    premium_quizzes: 24
  };

  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json"
  };

  const normalizePhone = (value) => {
    let phone = String(value || "").replace(/[\s+-]/g, "");
    if (phone.startsWith("0")) phone = "254" + phone.slice(1);
    return phone;
  };

  const getTimestamp = () => {
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

    const get = (type) =>
      parts.find(part => part.type === type).value;

    return get("year") + get("month") + get("day") +
      get("hour") + get("minute") + get("second");
  };

  try {
    const body = await request.json();
    const callback = body?.Body?.stkCallback;

    if (!callback?.CheckoutRequestID) {
      return respond(400, { success: false });
    }

    const checkoutId = callback.CheckoutRequestID;
    const merchantId = callback.MerchantRequestID || "";
    const callbackCode = String(callback.ResultCode);

    const paymentResponse = await fetch(
      `${supabaseUrl}/rest/v1/payments?checkout_request_id=eq.${encodeURIComponent(checkoutId)}&select=*`,
      { headers: dbHeaders }
    );

    if (!paymentResponse.ok) {
      throw new Error("Could not retrieve payment record.");
    }

    const payments = await paymentResponse.json();
    const payment = payments[0];

    if (!payment) {
      console.error("No matching payment record:", checkoutId);
      return respond(200, { ResultCode: 0, ResultDesc: "Received" });
    }

    if (payment.status === "success") {
      if (payment.product_id === "teacher_download") {
        const orderCheck = await fetch(
          `${supabaseUrl}/rest/v1/teacher_download_orders?payment_id=eq.${payment.id}&user_id=eq.${payment.user_id}&select=id,status&limit=1`,
          { headers: dbHeaders }
        );
        if (!orderCheck.ok) throw new Error("Could not check the teacher download order.");
        const existingOrder = (await orderCheck.json())[0];
        if (existingOrder && ["paid", "downloaded"].includes(existingOrder.status)) {
          return respond(200, { ResultCode: 0, ResultDesc: "Teacher download payment already processed." });
        }
      } else {
        const entitlementCheck = await fetch(
          `${supabaseUrl}/rest/v1/entitlements?user_id=eq.${payment.user_id}&product_id=eq.${payment.product_id}&payment_id=eq.${payment.id}&select=id&limit=1`,
          { headers: dbHeaders }
        );
        if (!entitlementCheck.ok) throw new Error("Could not check existing access.");
        const existingAccess = await entitlementCheck.json();
        if (existingAccess.length > 0) return respond(200, { ResultCode: 0, ResultDesc: "Payment already processed." });
      }
    }

    if (callbackCode !== "0") {
      const failedUpdate = await fetch(
        `${supabaseUrl}/rest/v1/payments?id=eq.${payment.id}`,
        {
          method: "PATCH",
          headers: dbHeaders,
          body: JSON.stringify({
            status: "failed",
            result_code: callbackCode,
            result_desc: callback.ResultDesc || "Payment was not completed."
          })
        }
      );

      if (!failedUpdate.ok) {
        throw new Error("Could not record failed payment.");
      }
      if (payment.product_id === "teacher_download") {
        const failedOrder = await fetch(
          `${supabaseUrl}/rest/v1/teacher_download_orders?payment_id=eq.${payment.id}&user_id=eq.${payment.user_id}&status=eq.awaiting_payment`,
          { method: "PATCH", headers: dbHeaders, body: JSON.stringify({ status: "failed" }) }
        );
        if (!failedOrder.ok) throw new Error("Could not record the failed teacher download order.");
      }

      return respond(200, { ResultCode: 0, ResultDesc: "Received" });
    }

    let teacherOrder = null;
    if (payment.product_id === "teacher_download") {
      const orderResponse = await fetch(
        `${supabaseUrl}/rest/v1/teacher_download_orders?payment_id=eq.${payment.id}&user_id=eq.${payment.user_id}&select=*`,
        { headers: dbHeaders }
      );
      if (!orderResponse.ok) throw new Error("Could not retrieve the teacher download order.");
      teacherOrder = (await orderResponse.json())[0];
      if (!teacherOrder || Number(payment.amount) !== Number(teacherOrder.amount) || teacherOrder.status !== "awaiting_payment") {
        throw new Error("Teacher download order or amount does not match.");
      }
    } else if (
      !Object.prototype.hasOwnProperty.call(catalog, payment.product_id) ||
      Number(payment.amount) !== catalog[payment.product_id]
    ) {
      throw new Error("Payment product or amount does not match.");
    }

    const metadata = callback.CallbackMetadata?.Item || [];
    const getMetadata = (name) =>
      metadata.find(item => item.Name === name)?.Value;

    const receipt = getMetadata("MpesaReceiptNumber");
    const paidAmount = Number(getMetadata("Amount"));
    const paidPhone = normalizePhone(getMetadata("PhoneNumber"));

    if (
      !receipt ||
      paidAmount !== Number(payment.amount) ||
      paidPhone !== normalizePhone(payment.phone)
    ) {
      throw new Error("Payment details could not be matched.");
    }

    const credentials = Buffer.from(
      `${consumerKey}:${consumerSecret}`
    ).toString("base64");

    const tokenResponse = await fetch(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        headers: { Authorization: `Basic ${credentials}` }
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error("Could not authenticate with Safaricom.");
    }

    const timestamp = getTimestamp();
    const password = Buffer.from(
      shortcode + passkey + timestamp
    ).toString("base64");

    const queryResponse = await fetch(
      "https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query",
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
          CheckoutRequestID: checkoutId
        })
      }
    );

    const queryResult = await queryResponse.json();

    if (
      !queryResponse.ok ||
      String(queryResult.ResultCode) !== "0" ||
      queryResult.CheckoutRequestID !== checkoutId
    ) {
      console.error("Safaricom verification is pending or unsuccessful.");
      return respond(200, { ResultCode: 0, ResultDesc: "Received" });
    }

    const paymentUpdate = await fetch(
      `${supabaseUrl}/rest/v1/payments?id=eq.${payment.id}`,
      {
        method: "PATCH",
        headers: dbHeaders,
        body: JSON.stringify({
          status: "success",
          merchant_request_id: merchantId || payment.merchant_request_id,
          mpesa_receipt: receipt,
          result_code: "0",
          result_desc: "Payment successfully verified."
        })
      }
    );

    if (!paymentUpdate.ok) {
      throw new Error("Could not update the verified payment.");
    }

    // Teacher Centre purchases are one-resource, one-download orders.
    // They never create reusable entitlements.
    if (payment.product_id === "teacher_download") {
      const orderUpdate = await fetch(
        `${supabaseUrl}/rest/v1/teacher_download_orders?id=eq.${teacherOrder.id}&payment_id=eq.${payment.id}&status=eq.awaiting_payment`,
        {
          method: "PATCH",
          headers: { ...dbHeaders, Prefer: "return=representation" },
          body: JSON.stringify({ status: "paid", paid_at: new Date().toISOString() })
        }
      );
      const updatedOrders = await orderUpdate.json();
      if (!orderUpdate.ok || !updatedOrders.length) throw new Error("Payment verified, but teacher download activation needs attention.");
      console.log("Verified one-time Teacher Centre download:", teacherOrder.resource_id);
      return respond(200, { ResultCode: 0, ResultDesc: "Teacher download payment processed." });
    }

    // Grade 10 is a one-time permanent unlock. Existing products retain
    // their original time-limited entitlement durations.
    const isPermanentGrade10 = payment.product_id === "grade10_selection_form";
    const hours = durations[payment.product_id];
    const expiry = isPermanentGrade10
      ? null
      : new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    if (!isPermanentGrade10 && !Number.isFinite(hours)) {
      throw new Error("No entitlement duration is configured for this product.");
    }

    const entitlementResponse = await fetch(
      `${supabaseUrl}/rest/v1/entitlements?on_conflict=user_id,product_id`,
      {
        method: "POST",
        headers: {
          ...dbHeaders,
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify({
          user_id: payment.user_id,
          product_id: payment.product_id,
          payment_id: payment.id,
          active: true,
          expires_at: expiry
        })
      }
    );

    if (!entitlementResponse.ok) {
      throw new Error("Payment verified, but access activation needs attention.");
    }

    console.log(
      "Verified payment and activated:",
      payment.product_id,
      isPermanentGrade10 ? "permanently" : `${hours} hours`
    );

    return respond(200, {
      ResultCode: 0,
      ResultDesc: "Payment processed successfully."
    });

  } catch (error) {
    console.error("M-Pesa callback processing error:", error.message);

    return respond(200, {
      ResultCode: 0,
      ResultDesc: "Callback received."
    });
  }
};
