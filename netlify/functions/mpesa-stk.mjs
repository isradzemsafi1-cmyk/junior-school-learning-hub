import { respond, catalog, normalizePhone, configuration, authenticatedUser, supabase, safaricom, password, registerPayment, signedCallbackURL } from '../lib/mpesa.mjs';

export default async (request, context) => {
  if (request.method !== 'POST') return respond(405, { success: false });
  // A preview must never send a real STK push or write a customer payment record.
  if (context?.deploy?.context !== 'production') return respond(403, { success: false, message: 'Payment initiation is disabled in previews.' });
  let config;
  try { config = configuration(); } catch { return respond(503, { success: false, message: 'Payment configuration is incomplete.' }); }
  let body;
  try { body = await request.json(); } catch { return respond(400, { success: false, message: 'Invalid request.' }); }
  let paymentId, initiationStarted = false;
  try {
    const user = await authenticatedUser(request);
    if (!user) return respond(401, { success: false, message: 'Please log in to your learner account first.' });
    const productId = String(body.product_id || '');
    const amount = catalog()[productId];
    const phone = normalizePhone(body.phone);
    if (!Object.hasOwn(catalog(), productId) || !/^254[17]\d{8}$/.test(phone)) return respond(400, { success: false, message: 'Select a valid product and Kenyan M-Pesa phone number.' });
    const recent = await supabase(`payments?user_id=eq.${encodeURIComponent(user.id)}&product_id=eq.${productId}&status=eq.pending&created_at=gte.${encodeURIComponent(new Date(Date.now()-5*60000).toISOString())}&select=id&limit=1`);
    if (recent.length) return respond(409, { success: false, message: 'A payment is already pending. Check its status before trying again.' });
    const rows = await supabase('payments', { method: 'POST', representation: true, body: { user_id: user.id, phone, amount, product_id: productId, status: 'pending' } });
    if (rows.length !== 1) throw new Error('payment_not_saved');
    paymentId = rows[0].id;
    await registerPayment(paymentId);
    initiationStarted = true;
    const result = await safaricom(config, '/mpesa/stkpush/v1/processrequest', {
      ...password(config), TransactionType: config.transactionType, Amount: amount, PartyA: phone, PartyB: config.shortcode,
      PhoneNumber: phone, CallBackURL: signedCallbackURL(config.callback, paymentId), AccountReference: 'JSLH', TransactionDesc: 'Learning Hub Payment',
    });
    if (String(result.ResponseCode) !== '0') {
      await supabase(`payments?id=eq.${encodeURIComponent(paymentId)}&status=in.(pending,failed)`, { method: 'PATCH', body: { status: 'failed', result_desc: 'Safaricom rejected payment initiation.' } });
      return respond(502, { success: false, message: 'Safaricom could not initiate payment.' });
    }
    if (!result.CheckoutRequestID || !result.MerchantRequestID) throw new Error('missing_payment_identifiers');
    const updated = await supabase(`payments?id=eq.${encodeURIComponent(paymentId)}`, { method: 'PATCH', representation: true, body: { checkout_request_id: result.CheckoutRequestID, merchant_request_id: result.MerchantRequestID } });
    if (updated.length !== 1) throw new Error('payment_update_not_matched');
    return respond(200, { success: true, paymentId, checkoutRequestId: result.CheckoutRequestID, message: 'Check your phone to complete payment.' });
  } catch {
    console.error('M-Pesa initiation could not be completed.');
    // A timeout is ambiguous: do not falsely mark a possibly charged request as failed.
    return respond(503, { success: false, paymentId, message: initiationStarted ? 'Payment status is uncertain. Do not pay again; check payment status or contact support.' : 'Unable to start payment. Please try again later.' });
  }
};
