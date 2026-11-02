
export default async (request) => {
  const headers = {
    "Content-Type": "application/json"
  };

  const respond = (data) =>
    new Response(JSON.stringify(data), {
      status: 200,
      headers
    });

  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405
    });
  }

  try {
    const body = await request.json();
    const callback = body?.Body?.stkCallback;

    if (!callback) {
      console.error("Invalid M-Pesa callback structure");

      return respond({
        ResultCode: 0,
        ResultDesc: "Callback received"
      });
    }

    const checkoutRequestId = callback.CheckoutRequestID;
    const merchantRequestId = callback.MerchantRequestID;
    const resultCode = callback.ResultCode;
    const resultDescription = callback.ResultDesc;

    console.log("M-Pesa callback received", {
      checkoutRequestId,
      merchantRequestId,
      resultCode,
      resultDescription
    });

    if (Number(resultCode) === 0) {
      const items =
        callback.CallbackMetadata?.Item || [];

      const receipt = items.find(
        item => item.Name === "MpesaReceiptNumber"
      )?.Value;

      const amount = items.find(
        item => item.Name === "Amount"
      )?.Value;

      const phone = items.find(
        item => item.Name === "PhoneNumber"
      )?.Value;

      console.log("Successful payment callback received", {
        checkoutRequestId,
        receipt,
        amount,
        phone
      });
    }

    return respond({
      ResultCode: 0,
      ResultDesc: "Callback received successfully"
    });

  } catch (error) {
    console.error("Callback processing error:", error.message);

    return respond({
      ResultCode: 0,
      ResultDesc: "Callback received"
    });
  }
};
