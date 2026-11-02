
export default async (request) => {
  const headers = {
    "Content-Type": "application/json"
  };

  const respond = (status, data) =>
    new Response(JSON.stringify(data), { status, headers });

  if (request.method !== "POST") {
    return respond(405, {
      success: false,
      message: "Only POST requests are allowed."
    });
  }

  const consumerKey = Netlify.env.get("MPESA_CONSUMER_KEY");
  const consumerSecret = Netlify.env.get("MPESA_CONSUMER_SECRET");
  const shortcode = Netlify.env.get("MPESA_SHORTCODE");
  const passkey = Netlify.env.get("MPESA_PASSKEY");
  const callbackURL = Netlify.env.get("MPESA_CALLBACK_URL");

  if (!consumerKey || !consumerSecret || !shortcode ||
      !passkey || !callbackURL) {
    return respond(500, {
      success: false,
      message: "M-Pesa configuration is incomplete."
    });
  }

  if (!callbackURL.startsWith("https://")) {
    return respond(500, {
      success: false,
      message: "A secure HTTPS callback URL is required."
    });
  }

  try {
    const body = await request.json();

    let phone = String(body.phone || "").replace(/[\s+-]/g, "");
    const amount = Number(body.amount);

    if (phone.startsWith("0")) {
      phone = "254" + phone.slice(1);
    }

    if (!/^254[17]\d{8}$/.test(phone)) {
      return respond(400, {
        success: false,
        message: "Enter a valid Kenyan M-Pesa phone number."
      });
    }

    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000) {
      return respond(400, {
        success: false,
        message: "For Sandbox testing, enter an amount between KSh 1 and KSh 1,000."
      });
    }

    const credentials = Buffer.from(
      `${consumerKey}:${consumerSecret}`
    ).toString("base64");

    const tokenResponse = await fetch(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${credentials}`
        }
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      return respond(502, {
        success: false,
        message: "Could not authenticate with Safaricom."
      });
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

    const get = (type) => parts.find(p => p.type === type).value;

    const timestamp =
      get("year") + get("month") + get("day") +
      get("hour") + get("minute") + get("second");

    const password = Buffer.from(
      shortcode + passkey + timestamp
    ).toString("base64");

    const stkResponse = await fetch(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
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
          TransactionType: "CustomerPayBillOnline",
          Amount: amount,
          PartyA: phone,
          PartyB: shortcode,
          PhoneNumber: phone,
          CallBackURL: callbackURL,
          AccountReference: "JSLH",
          TransactionDesc: "Learning Hub Payment"
        })
      }
    );

    const result = await stkResponse.json();

    if (!stkResponse.ok || result.ResponseCode !== "0") {
      return respond(502, {
        success: false,
        message: result.errorMessage ||
          result.ResponseDescription ||
          "Safaricom could not initiate the payment."
      });
    }

    return respond(200, {
      success: true,
      message: result.CustomerMessage ||
        "Payment request sent. Check your phone.",
      merchantRequestId: result.MerchantRequestID,
      checkoutRequestId: result.CheckoutRequestID
    });

  } catch (error) {
    return respond(500, {
      success: false,
      message: "Unable to process the payment request."
    });
  }
};

